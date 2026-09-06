import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import type {
  ApproveClosureDto,
  ClosureResult,
  CorrectionDto,
  ReturnExecutionDto,
} from './dto/closure.dto';

/**
 * C127 (06 v2 §29/§30/§31): los tres veredictos administrativos.
 *
 * Aprobar es el ÚNICO camino por el que un proyecto llega a CERRADO y por el
 * que unas horas quedan acreditadas. Corregir devuelve la documentación sin
 * reabrir la ejecución; devolver a ejecución sí la reabre, y ninguna de las
 * dos toca las horas ya consolidadas.
 *
 * Esqueleto en C127: cada veredicto llega con su contrato.
 */
@Injectable()
export class ProjectClosureReviewService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
    protected readonly policy: ProjectPolicyService,
    protected readonly readiness: ProjectCloseReadinessService,
    protected readonly audit: BitacoraEventosService,
    protected readonly notifications: NotificationsService,
  ) {}

  /** E114: corrección documental; el proyecto sigue en solicitud de cierre. */
  requestDocumentaryCorrection(
    projectId: number,
    actorId: number,
    dto: CorrectionDto,
  ): Promise<ClosureResult> {
    return this.projectTx.run(projectId, actorId, 'closure.correction', async ({ tx, project, effects }) => {
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'CIERRE_VEREDICTO', actorId);
      const comentario = this.requireComment(dto.comentario);
      const revision = await tx.revisionCierreProyecto.findFirst({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId, estadoRevision: 'ENVIADA' },
        include: { documentos: true },
      });
      if (!revision) throw new ConflictException('La revisión enviada ya no está vigente');
      const resolved = await tx.revisionCierreProyecto.updateMany({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId, estadoRevision: 'ENVIADA' },
        data: { estadoRevision: 'CORRECCION_DOCUMENTAL', idRevisor: actorId, resueltaEn: new Date(), comentarioRevisor: comentario },
      });
      if (resolved.count !== 1) throw new ConflictException('La revisión cambió');
      const last = await tx.revisionCierreProyecto.aggregate({ where: { idProyecto: projectId }, _max: { numeroRevision: true } });
      const draft = await tx.revisionCierreProyecto.create({ data: {
        idProyecto: projectId, numeroRevision: last._max.numeroRevision! + 1,
        documentos: { create: revision.documentos.map((link) => ({ idDocumentoCierre: link.idDocumentoCierre, orden: link.orden })) },
      } });
      for (const [tipoEvento, idEntidad, valorNuevo] of [
        [TipoEventoBitacora.PROJECT_CLOSE_REVIEW_DOC_CORRECTION, dto.revisionId, { comentario, nuevaRevisionId: draft.idRevisionCierre }],
        [TipoEventoBitacora.CLOSURE_DRAFT_CREATED, draft.idRevisionCierre, { revisionOrigenId: dto.revisionId, numeroRevision: draft.numeroRevision }],
      ] as const) await this.audit.registrarEvento({ tx, tipoEvento, idActor: actorId, idProyecto: projectId,
        tipoEntidad: 'REVISION_CIERRE', idEntidad, valorNuevo });
      const { tituloProyecto: projectTitle } = await tx.proyecto.findUniqueOrThrow({ where: { idProyecto: projectId } });
      await this.notifications.persistTemplateTx(tx, [project.creadoPor], 'CIERRE_CORRECCION_DOCUMENTAL', {
        projectId, projectTitle, revisionId: dto.revisionId, numeroRevision: draft.numeroRevision, comentario,
      }, effects);
      await this.notifications.deferClosureEventsTx(tx, effects, projectId, project.creadoPor, draft.idRevisionCierre);
      return { projectId, estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: draft.idRevisionCierre,
        numeroRevision: draft.numeroRevision, fingerprintEntrega: null, informeOficialId: null, cantidades: { vinculosHeredados: revision.documentos.length } };
    }, { publish: (effects) => this.notifications.publishEffects(effects) });
  }

  protected requireComment(value: string | undefined): string {
    const comment = value?.trim() ?? '';
    if (!comment || comment.length > 5000) throw new BadRequestException('comentario debe tener entre 1 y 5000 caracteres');
    return comment;
  }

  /** E115: devolución a ejecución; las horas pendientes siguen pendientes. */
  returnToExecution(
    _projectId: number,
    _actorId: number,
    _dto: ReturnExecutionDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('returnToExecution todavía no está implementado'));
  }

  /** E112: aprobación; cierra, acredita y completa en una sola transacción. */
  approveClosure(
    _projectId: number,
    _actorId: number,
    _dto: ApproveClosureDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('approveClosure todavía no está implementado'));
  }
}
