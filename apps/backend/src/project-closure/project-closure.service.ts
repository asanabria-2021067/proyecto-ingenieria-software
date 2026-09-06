import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { canonicalDigest } from './closure-report-model';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import {
  ProjectCloseReadinessService,
  type ClosurePhase,
} from './project-close-readiness.service';
import type { ClosureResult, RequestCloseDto, ResubmitClosureDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §21/§24): orquestación del lado del LÍDER en el cierre.
 *
 * El líder prepara, genera su informe y SOLICITA; nunca cierra. Esa asimetría
 * es el contrato: quien ejecuta el proyecto no es quien acredita sus horas.
 *
 * C129: preparar es idempotente bajo el lock del proyecto. Generar (C130),
 * solicitar (C133) y reenviar (C137) llegan cada uno con su contrato.
 */

export interface ClosureDraft {
  idRevisionCierre: number;
  numeroRevision: number;
  estadoRevision: string;
}

@Injectable()
export class ProjectClosureService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
    protected readonly policy: ProjectPolicyService,
    protected readonly readinessService: ProjectCloseReadinessService,
    protected readonly bitacoraEventos: BitacoraEventosService,
    protected readonly notifications: NotificationsService,
  ) {}

  /**
   * E103 (§21/§24): crea el borrador de cierre o devuelve el que ya existe.
   *
   * Es IDEMPOTENTE a propósito: preparar dos veces no puede producir dos
   * borradores, porque `numeroRevision` es consecutivo por proyecto y dos
   * borradores simultáneos harían ambiguo cuál se está entregando. La
   * numeración se calcula bajo el lock del proyecto, no con un contador
   * optimista.
   */
  async prepare(projectId: number, actorId: number): Promise<ClosureDraft> {
    return this.projectTx.run(projectId, actorId, 'closure.prepare', async (ctx) => {
      const { tx } = ctx;
      const proyecto = ctx.project;
      if (!proyecto) {
        throw new NotFoundException('Proyecto no encontrado');
      }
      await this.policy.assertWriteTx(tx, proyecto, 'CIERRE_PREPARACION', actorId);

      const existente = await tx.revisionCierreProyecto.findFirst({
        where: { idProyecto: projectId, estadoRevision: 'BORRADOR' },
        orderBy: { numeroRevision: 'desc' },
        select: { idRevisionCierre: true, numeroRevision: true, estadoRevision: true },
      });
      if (existente) {
        return existente;
      }

      const ultima = await tx.revisionCierreProyecto.aggregate({
        where: { idProyecto: projectId },
        _max: { numeroRevision: true },
      });
      const creada = await tx.revisionCierreProyecto.create({
        data: {
          idProyecto: projectId,
          numeroRevision: (ultima._max.numeroRevision ?? 0) + 1,
          estadoRevision: 'BORRADOR',
        },
        select: { idRevisionCierre: true, numeroRevision: true, estadoRevision: true },
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.CLOSURE_DRAFT_CREATED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'REVISION_CIERRE',
        idEntidad: creada.idRevisionCierre,
        valorAnterior: null,
        valorNuevo: { numeroRevision: creada.numeroRevision, origen: 'PREPARACION' },
      });

      return creada;
    });
  }

  /** E104: preparación consultada; leer nunca cambia el estado del proyecto. */
  async readiness(projectId: number, actorId: number, phase: ClosurePhase) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, estadoProyecto: true, eliminadoEn: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    // La preparación es información del LÍDER: ni el equipo ni un externo la
    // consultan, porque enumera exactamente qué falta para cerrar.
    if (proyecto.creadoPor !== actorId) {
      throw new ForbiddenException('Solo el líder del proyecto puede consultar su preparación');
    }
    return this.readinessService.evaluate(undefined, projectId, { phase });
  }

  /** E105: solicita el cierre y sella la entrega. */
  requestClose(
    projectId: number,
    actorId: number,
    dto: RequestCloseDto,
  ): Promise<ClosureResult> {
    if (dto.confirmado !== true) throw new BadRequestException('Debe confirmar la solicitud');
    return this.projectTx.run(projectId, actorId, 'closure.requestClose', async ({ tx, project, effects }) => {
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      this.policy.assertProjectState(project, ['E']);
      await this.policy.assertActorTx(tx, project, 'LIDER', actorId);
      const ready = await this.readinessService.assertReady(tx, projectId, {
        phase: 'REQUEST', revisionId: dto.revisionId, expectedFingerprint: dto.expectedFingerprint,
      });
      await this.policy.assertWriteTx(tx, project, 'CIERRE_ENVIO', actorId);
      const revision = await tx.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: dto.revisionId } });
      const links = await tx.documentoRevisionCierre.findMany({
        where: { idRevisionCierre: dto.revisionId }, orderBy: [{ orden: 'asc' }, { idDocumentoCierre: 'asc' }],
        include: { documento: true },
      });
      const fingerprintEntrega = canonicalDigest({
        revisionId: dto.revisionId, executionFingerprint: ready.executionFingerprint,
        documentos: links.map((link) => ({ id: link.idDocumentoCierre, checksum: link.documento.checksumSha256, orden: link.orden })),
      });
      const pending = await tx.postulacion.findMany({
        where: { rolProyecto: { idProyecto: projectId }, estadoPostulacion: 'PENDIENTE' },
        include: { rolProyecto: { select: { nombreRol: true } } }, orderBy: { idPostulacion: 'asc' },
      });
      const fecha = new Date();
      const moved = await tx.proyecto.updateMany({
        where: { idProyecto: projectId, estadoProyecto: 'EN_PROGRESO', eliminadoEn: null },
        data: { estadoProyecto: 'EN_SOLICITUD_CIERRE' },
      });
      const sent = await tx.revisionCierreProyecto.updateMany({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId, estadoRevision: 'BORRADOR' },
        data: { estadoRevision: 'ENVIADA', idSolicitante: actorId, enviadaEn: fecha, fingerprintEntrega },
      });
      if (moved.count !== 1 || sent.count !== 1) throw new ConflictException('La entrega cambió');
      const rejected = await tx.postulacion.updateMany({
        where: { idPostulacion: { in: pending.map((row) => row.idPostulacion) }, estadoPostulacion: 'PENDIENTE' },
        data: { estadoPostulacion: 'RECHAZADA', fechaResolucion: fecha, resueltaPor: actorId,
          comentarioResolucion: 'Rechazada automáticamente por solicitud de cierre del proyecto' },
      });
      if (rejected.count !== pending.length) throw new ConflictException('El conteo de postulaciones cambió');
      const { tituloProyecto: projectTitle } = await tx.proyecto.findUniqueOrThrow({ where: { idProyecto: projectId } });
      for (const row of pending) {
        await this.notifications.persistTemplateTx(tx, [row.idUsuarioPostulante], 'POSTULACION_RECHAZADA_POR_CIERRE', {
          projectId, projectTitle, applicationId: row.idPostulacion, roleName: row.rolProyecto.nombreRol,
        }, effects);
      }
      await this.notifications.persistAdminsTx(tx, 'SOLICITUD_CIERRE_PROYECTO', { projectId, projectTitle }, effects);
      await this.bitacoraEventos.registrarEvento({ tx, tipoEvento: TipoEventoBitacora.PROJECT_CLOSE_REQUESTED,
        idActor: actorId, idProyecto: projectId, tipoEntidad: 'REVISION_CIERRE', idEntidad: dto.revisionId,
        valorAnterior: { estadoProyecto: 'EN_PROGRESO' },
        valorNuevo: { estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: dto.revisionId, fingerprintEntrega },
      });
      await this.bitacoraEventos.registrarEvento({ tx, tipoEvento: TipoEventoBitacora.POSTULATIONS_AUTO_REJECTED,
        idActor: actorId, idProyecto: projectId, tipoEntidad: 'PROYECTO', idEntidad: projectId,
        valorAnterior: null, valorNuevo: { ids: pending.map((row) => row.idPostulacion), cantidad: rejected.count },
      });
      await this.notifications.deferClosureEventsTx(tx, effects, projectId, project.creadoPor, dto.revisionId, 'EN_SOLICITUD_CIERRE');
      return { projectId, estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: dto.revisionId,
        numeroRevision: revision.numeroRevision, fingerprintEntrega, informeOficialId: null,
        cantidades: { postulacionesRechazadas: rejected.count } };
    }, { publish: (effects) => this.notifications.publishEffects(effects) });
  }

  /** E113: reenvía tras una corrección documental. */
  resubmit(
    _projectId: number,
    _actorId: number,
    _dto: ResubmitClosureDto,
  ): Promise<ClosureResult> {
    return Promise.reject(new Error('resubmit todavía no está implementado'));
  }
}
