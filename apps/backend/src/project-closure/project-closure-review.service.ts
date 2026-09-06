import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectCloseReadinessService } from './project-close-readiness.service';
import { CLOSURE_GENERATOR_VERSION } from './project-close-readiness.service';
import { ProjectClosureReportService } from './project-closure-report.service';
import { ProjectClosureDocumentsService } from './project-closure-documents.service';
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
    protected readonly report: ProjectClosureReportService,
    protected readonly documents: ProjectClosureDocumentsService,
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
    projectId: number,
    actorId: number,
    dto: ReturnExecutionDto,
  ): Promise<ClosureResult> {
    return this.projectTx.run(projectId, actorId, 'closure.returnToExecution', async ({ tx, project, effects }) => {
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'CIERRE_VEREDICTO', actorId);
      const comentario = this.requireComment(dto.comentario);
      const reviewCount = await tx.revisionCierreProyecto.count({ where: { idProyecto: projectId } });
      const legacy = dto.legacy === true && dto.revisionId == null;
      let revision: { idRevisionCierre: number; numeroRevision: number; fingerprintEntrega: string | null } | null = null;
      const fecha = new Date();
      if (legacy) {
        if (reviewCount !== 0) throw new ConflictException('El modo legacy solo aplica a proyectos sin revisiones de cierre');
      } else {
        if (!Number.isInteger(dto.revisionId)) throw new BadRequestException('revisionId es obligatorio');
        revision = await tx.revisionCierreProyecto.findFirst({
          where: { idRevisionCierre: dto.revisionId!, idProyecto: projectId, estadoRevision: 'ENVIADA' },
          select: { idRevisionCierre: true, numeroRevision: true, fingerprintEntrega: true },
        });
        if (!revision) throw new ConflictException('La revisión enviada ya no está vigente');
        const returned = await tx.revisionCierreProyecto.updateMany({
          where: { idRevisionCierre: revision.idRevisionCierre, idProyecto: projectId, estadoRevision: 'ENVIADA' },
          data: { estadoRevision: 'DEVUELTA_A_EJECUCION', idRevisor: actorId, resueltaEn: fecha, comentarioRevisor: comentario },
        });
        if (returned.count !== 1) throw new ConflictException('La revisión cambió');
      }
      const moved = await tx.proyecto.updateMany({
        where: { idProyecto: projectId, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null },
        data: { estadoProyecto: 'EN_PROGRESO' },
      });
      if (moved.count !== 1) throw new ConflictException('El proyecto cambió');
      const { tituloProyecto: projectTitle } = await tx.proyecto.findUniqueOrThrow({ where: { idProyecto: projectId } });
      await this.audit.registrarEvento({
        tx, tipoEvento: TipoEventoBitacora.PROJECT_CLOSE_RETURNED_TO_EXECUTION,
        idActor: actorId, idProyecto: projectId, tipoEntidad: 'PROYECTO', idEntidad: projectId,
        valorAnterior: { estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: revision?.idRevisionCierre ?? null },
        valorNuevo: { estadoProyecto: 'EN_PROGRESO', legacy, comentario },
      });
      await this.notifications.persistTemplateTx(tx, [project.creadoPor], 'CIERRE_DEVUELTO_A_EJECUCION', {
        projectId, projectTitle, ...(revision ? { revisionId: revision.idRevisionCierre } : {}), comentario,
      }, effects);
      await this.notifications.deferClosureEventsTx(tx, effects, projectId, project.creadoPor, revision?.idRevisionCierre ?? null, 'EN_PROGRESO');
      return { projectId, estadoProyecto: 'EN_PROGRESO', revisionId: revision?.idRevisionCierre ?? null,
        numeroRevision: revision?.numeroRevision ?? 0, fingerprintEntrega: revision?.fingerprintEntrega ?? null,
        informeOficialId: null, cantidades: { revisionesDevueltas: revision ? 1 : 0 } };
    }, { publish: (effects) => this.notifications.publishEffects(effects) });
  }

  /** E112: aprobación; cierra, acredita y completa en una sola transacción. */
  async approveClosure(projectId: number, actorId: number, dto: ApproveClosureDto): Promise<ClosureResult> {
    const fechaAprobacion = new Date();
    const phaseOne = await this.projectTx.run(projectId, actorId, 'closure.approve.capture', async ({ tx, project }) => {
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'CIERRE_VEREDICTO', actorId);
      const revision = await tx.revisionCierreProyecto.findFirst({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId },
        select: { idRevisionCierre: true, estadoRevision: true, fingerprintEntrega: true, numeroRevision: true },
      });
      if (!revision) throw new NotFoundException('Revisión de cierre no encontrada');
      if (revision.estadoRevision !== 'ENVIADA') throw new ConflictException('La revisión no está enviada');
      if (revision.fingerprintEntrega !== dto.expectedFingerprint) throw new ConflictException('La entrega cambió');
      await this.readiness.assertReady(tx, projectId, { phase: 'APPROVE', revisionId: dto.revisionId });
      const capture = await this.report.buildOfficialModelTx(tx, {
        projectId, revisionId: dto.revisionId, adminId: actorId, fechaAprobacion,
      });
      const document = await this.documents.reserveGeneratedTx(tx, {
        projectId,
        revisionId: dto.revisionId,
        tipoDocumento: 'INFORME_OFICIAL_FINAL',
        nombreArchivo: `informe-oficial-${projectId}-${dto.revisionId}.pdf`,
        actorId,
        generatorVersion: CLOSURE_GENERATOR_VERSION,
        fingerprintEjecucion: capture.fingerprintEjecucion,
        fingerprintModelo: capture.fingerprintModelo,
        contextoReporte: capture.contexto as unknown as Prisma.InputJsonValue,
      });
      return { capture, documentId: document.idDocumentoCierre, deliveryFingerprint: revision.fingerprintEntrega,
        numeroRevision: revision.numeroRevision };
    });
    const rendered = this.report.renderOfficial(phaseOne.capture);
    const uploaded = await this.documents.uploadGenerated(phaseOne.documentId, projectId, rendered.pdf);
    await this.projectTx.run(projectId, actorId, 'closure.approve.record-upload', async ({ tx }) => {
      const recorded = await tx.documentoCierre.updateMany({
        where: { idDocumentoCierre: phaseOne.documentId, idProyecto: projectId, idRevisionOrigen: dto.revisionId,
          tipoDocumento: 'INFORME_OFICIAL_FINAL', estadoDocumento: 'RESERVADO',
          fingerprintEjecucion: phaseOne.capture.fingerprintEjecucion, fingerprintModelo: phaseOne.capture.fingerprintModelo },
        data: { estadoDocumento: 'EN_CARGA', cargaIniciadaEn: new Date(), cargaLimiteEn: new Date(Date.now() + 7_200_000),
          assetId: uploaded.identidad.assetId ?? null, versionRemota: uploaded.identidad.version ?? null,
          tamanoBytes: BigInt(uploaded.tamanoBytes), tamanoCifradoBytes: BigInt(uploaded.tamanoCifradoBytes),
          checksumSha256: uploaded.checksumSha256, checksumCifradoSha256: uploaded.checksumCifradoSha256,
          cryptoMetadata: uploaded.metadata as unknown as Prisma.InputJsonValue },
      });
      if (recorded.count !== 1) throw new ConflictException('La reserva oficial cambió');
    });
    throw new ConflictException('La fase final de aprobación todavía no está habilitada');
  }
}
