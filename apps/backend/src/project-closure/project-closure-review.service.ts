import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { canonicalJson } from './closure-report-model';
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
      return { capture, document, documentId: document.idDocumentoCierre, deliveryFingerprint: revision.fingerprintEntrega,
        numeroRevision: revision.numeroRevision };
    });
    let rendered: ReturnType<ProjectClosureReportService['renderOfficial']>;
    try {
      rendered = this.report.renderOfficial(phaseOne.capture);
    } catch (error) {
      this.rethrowExternalFailure(error, 'No fue posible generar el informe oficial');
    }
    let uploaded: Awaited<ReturnType<ProjectClosureDocumentsService['uploadGenerated']>>;
    try {
      uploaded = await this.documents.uploadGenerated(phaseOne.documentId, projectId, rendered.pdf);
    } catch (error) {
      this.rethrowExternalFailure(error, 'No fue posible almacenar y verificar el informe oficial');
    }
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
    return this.projectTx.run(projectId, actorId, 'closure.approve.finalize', async ({ tx, project, effects }) => {
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      await this.policy.assertWriteTx(tx, project, 'CIERRE_VEREDICTO', actorId);
      const revision = await tx.revisionCierreProyecto.findFirst({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId },
        select: { idRevisionCierre: true, numeroRevision: true, estadoRevision: true, fingerprintEntrega: true },
      });
      if (!revision || revision.estadoRevision !== 'ENVIADA' ||
          revision.fingerprintEntrega !== dto.expectedFingerprint ||
          revision.fingerprintEntrega !== phaseOne.deliveryFingerprint) {
        throw new ConflictException('La revisión o su entrega cambiaron');
      }
      await this.readiness.assertReady(tx, projectId, { phase: 'APPROVE', revisionId: dto.revisionId });
      const rebuilt = await this.report.buildOfficialModelTx(tx, {
        projectId, revisionId: dto.revisionId, adminId: actorId, fechaAprobacion,
      });
      if (rebuilt.fingerprintEjecucion !== phaseOne.capture.fingerprintEjecucion ||
          rebuilt.fingerprintModelo !== phaseOne.capture.fingerprintModelo ||
          canonicalJson(rebuilt.contexto) !== canonicalJson(phaseOne.capture.contexto)) {
        throw new ConflictException('El contexto oficial cambió durante la aprobación');
      }
      const expectedHours = phaseOne.capture.targetHours.map((row) => ({
        idRegistroHoras: row.idRegistroHoras, idParticipacion: row.idParticipacion, horasCalculadas: row.horasCalculadas,
      }));
      const currentHours = await tx.horasParticipacion.findMany({
        where: { participacion: { rolProyecto: { idProyecto: projectId } }, estadoHoras: 'PENDIENTE' },
        orderBy: { idRegistroHoras: 'asc' },
        select: { idRegistroHoras: true, idParticipacion: true, horasCalculadas: true, idSprint: true },
      });
      if (currentHours.some((row) => row.horasCalculadas === null || row.idSprint === null) ||
          canonicalJson(currentHours.map((row) => ({ idRegistroHoras: row.idRegistroHoras,
            idParticipacion: row.idParticipacion, horasCalculadas: row.horasCalculadas?.toFixed(2) }))) !== canonicalJson(expectedHours)) {
        throw new ConflictException('Las horas objetivo cambiaron durante la aprobación');
      }
      const document = await tx.documentoCierre.findFirst({
        where: { idDocumentoCierre: phaseOne.documentId, idProyecto: projectId, idRevisionOrigen: dto.revisionId,
          tipoDocumento: 'INFORME_OFICIAL_FINAL', estadoDocumento: 'EN_CARGA' },
      });
      if (!document || document.idAutor !== actorId || document.externalId !== uploaded.identidad.publicId ||
          document.proveedor !== uploaded.identidad.proveedor || document.resourceType !== uploaded.identidad.resourceType ||
          document.deliveryType !== uploaded.identidad.deliveryType || document.assetId !== (uploaded.identidad.assetId ?? null) ||
          document.versionRemota !== (uploaded.identidad.version ?? null) || Number(document.tamanoBytes) !== uploaded.tamanoBytes ||
          Number(document.tamanoCifradoBytes) !== uploaded.tamanoCifradoBytes || document.checksumSha256 !== uploaded.checksumSha256 ||
          document.checksumCifradoSha256 !== uploaded.checksumCifradoSha256 ||
          canonicalJson(document.cryptoMetadata) !== canonicalJson(uploaded.metadata) ||
          document.fingerprintEjecucion !== rebuilt.fingerprintEjecucion || document.fingerprintModelo !== rebuilt.fingerprintModelo ||
          canonicalJson(document.contextoReporte) !== canonicalJson(rebuilt.contexto)) {
        throw new ConflictException('El resultado del proveedor no corresponde a la reserva oficial');
      }

      let credited = 0;
      if (expectedHours.length > 0) {
        credited = await tx.$executeRaw(Prisma.sql`
          UPDATE horas_participacion
          SET horas_aprobadas = horas_calculadas,
              estado_horas = 'APROBADA',
              aprobado_por = ${actorId},
              fecha_aprobacion = ${fechaAprobacion}
          WHERE id_registro_horas IN (${Prisma.join(expectedHours.map((row) => row.idRegistroHoras))})
            AND estado_horas = 'PENDIENTE'
            AND horas_calculadas IS NOT NULL
        `);
      }
      if (credited !== expectedHours.length) throw new ConflictException('La acreditación no alcanzó el conteo exacto');

      const participations = await tx.participacionProyecto.findMany({
        where: { rolProyecto: { idProyecto: projectId } },
        orderBy: { idParticipacion: 'asc' }, select: { idParticipacion: true, idUsuario: true, estadoParticipacion: true },
      });
      const activeIds = participations.filter((row) => row.estadoParticipacion === 'ACTIVO').map((row) => row.idParticipacion);
      const completed = activeIds.length === 0 ? { count: 0 } : await tx.participacionProyecto.updateMany({
        where: { idParticipacion: { in: activeIds }, estadoParticipacion: 'ACTIVO' }, data: { estadoParticipacion: 'COMPLETADO' },
      });
      if (completed.count !== activeIds.length) throw new ConflictException('La compleción no alcanzó el conteo exacto');

      const available = await tx.documentoCierre.updateMany({
        where: { idDocumentoCierre: phaseOne.documentId, estadoDocumento: 'EN_CARGA' },
        data: { estadoDocumento: 'DISPONIBLE', disponibleEn: fechaAprobacion },
      });
      const approved = await tx.revisionCierreProyecto.updateMany({
        where: { idRevisionCierre: dto.revisionId, idProyecto: projectId, estadoRevision: 'ENVIADA', fingerprintEntrega: dto.expectedFingerprint },
        data: { estadoRevision: 'APROBADA', idRevisor: actorId, resueltaEn: fechaAprobacion,
          comentarioRevisor: dto.comentario?.trim() || null, idDocumentoOficial: phaseOne.documentId },
      });
      const closed = await tx.proyecto.updateMany({
        where: { idProyecto: projectId, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null },
        data: { estadoProyecto: 'CERRADO' },
      });
      if (available.count !== 1 || approved.count !== 1 || closed.count !== 1) {
        throw new ConflictException('La finalización atómica no alcanzó el conteo exacto');
      }

      await this.audit.registrarEvento({ tx, tipoEvento: TipoEventoBitacora.PROJECT_CLOSE_REVIEW_APPROVED,
        idActor: actorId, idProyecto: projectId, tipoEntidad: 'REVISION_CIERRE', idEntidad: dto.revisionId,
        valorAnterior: { estadoRevision: 'ENVIADA' }, valorNuevo: { estadoRevision: 'APROBADA',
          documentoOficialId: phaseOne.documentId, fechaAprobacion, fingerprintModelo: rebuilt.fingerprintModelo } });
      await this.audit.registrarEvento({ tx, tipoEvento: TipoEventoBitacora.PROJECT_HOURS_CREDITED,
        idActor: actorId, idProyecto: projectId, tipoEntidad: 'PROYECTO', idEntidad: projectId,
        valorAnterior: null, valorNuevo: { ids: expectedHours.map((row) => row.idRegistroHoras), cantidad: credited, fechaAprobacion } });
      const { tituloProyecto: projectTitle } = await tx.proyecto.findUniqueOrThrow({ where: { idProyecto: projectId } });
      const historicalUsers = [...new Set([project.creadoPor, ...participations.map((row) => row.idUsuario)])];
      await this.notifications.persistTemplateTx(tx, historicalUsers, 'CIERRE_APROBADO', { projectId, projectTitle }, effects);
      for (const userId of [...new Set(participations.map((row) => row.idUsuario))]) {
        const participationIds = new Set(participations.filter((row) => row.idUsuario === userId).map((row) => row.idParticipacion));
        const total = expectedHours.filter((row) => participationIds.has(row.idParticipacion))
          .reduce((sum, row) => sum.plus(row.horasCalculadas), new Prisma.Decimal(0));
        await this.notifications.persistTemplateTx(tx, [userId], 'HORAS_ACREDITADAS', {
          projectId, projectTitle, horasAcreditadas: total.toFixed(2),
        }, effects);
      }
      await this.notifications.deferClosureEventsTx(tx, effects, projectId, project.creadoPor, dto.revisionId, 'CERRADO');
      await this.beforeApprovalPhaseTwoCommit();
      return { projectId, estadoProyecto: 'CERRADO', revisionId: dto.revisionId,
        numeroRevision: revision.numeroRevision, fingerprintEntrega: revision.fingerprintEntrega,
        informeOficialId: phaseOne.documentId, cantidades: { horasAcreditadas: credited, participacionesCompletadas: completed.count } };
    }, { publish: (effects) => this.notifications.publishEffects(effects) });
  }

  protected async beforeApprovalPhaseTwoCommit(): Promise<void> {}

  private rethrowExternalFailure(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException(message);
  }
}
