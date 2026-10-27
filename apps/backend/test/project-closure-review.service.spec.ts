import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProjectClosureReviewService } from '../src/project-closure/project-closure-review.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { INSIGNIAS_EVENTO } from '../src/insignias/insignias.catalog';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { ProjectCloseReadinessService } from '../src/project-closure/project-close-readiness.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { ProjectClosureReportService } from '../src/project-closure/project-closure-report.service';
import type { ProjectClosureDocumentsService } from '../src/project-closure/project-closure-documents.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { makeProjectPolicyDouble, makeProjectTransactionDouble } from './helpers/project-policy.double';

/**
 * IESUC-568 (RTF 2 · 3.1): los tres veredictos administrativos del cierre
 * (C127). Todo colaborador es un doble: se prueban las reglas de negocio,
 * los permisos, los estados inválidos, la acreditación de horas y las rutas
 * de error del servicio, no Prisma ni el proveedor de almacenamiento.
 */

const PROJECT_ID = 12;
const ADMIN_ID = 1;
const LEADER_ID = 4;
const REVISION_ID = 30;
const DOCUMENT_ID = 70;
const FINGERPRINT = 'a'.repeat(64);

function setup(options: { project?: null; withEvents?: boolean } = {}) {
  const tx = {
    revisionCierreProyecto: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi.fn().mockResolvedValue({ _max: { numeroRevision: 2 } }),
      create: vi.fn().mockResolvedValue({ idRevisionCierre: REVISION_ID + 1, numeroRevision: 3 }),
      count: vi.fn().mockResolvedValue(1),
    },
    proyecto: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ tituloProyecto: 'Huerto UVG' }),
    },
    horasParticipacion: { findMany: vi.fn().mockResolvedValue([]) },
    documentoCierre: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
    },
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const projectTx = makeProjectTransactionDouble({
    tx,
    project:
      options.project === null
        ? () => null
        : { creadoPor: LEADER_ID, estadoProyecto: 'EN_SOLICITUD_CIERRE' },
  });
  const policy = makeProjectPolicyDouble();
  const readiness = { assertReady: vi.fn().mockResolvedValue(undefined) };
  const audit = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const notifications = {
    persistTemplateTx: vi.fn().mockResolvedValue(undefined),
    deferClosureEventsTx: vi.fn().mockResolvedValue(undefined),
    publishEffects: vi.fn().mockResolvedValue(undefined),
  };
  const report = { buildOfficialModelTx: vi.fn(), renderOfficial: vi.fn() };
  const documents = { reserveGeneratedTx: vi.fn(), uploadGenerated: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new ProjectClosureReviewService(
    {} as PrismaService,
    projectTx,
    policy,
    readiness as unknown as ProjectCloseReadinessService,
    audit as unknown as BitacoraEventosService,
    notifications as unknown as NotificationsService,
    report as unknown as ProjectClosureReportService,
    documents as unknown as ProjectClosureDocumentsService,
    options.withEvents === false ? undefined : (events as unknown as EventEmitter2),
  );
  return { service, tx, projectTx, policy, readiness, audit, notifications, report, documents, events };
}

describe('ProjectClosureReviewService.requestDocumentaryCorrection (E114)', () => {
  const dto = { revisionId: REVISION_ID, comentario: '  Falta el acta firmada  ' };

  it('rechaza con 404 si el proyecto no existe', async () => {
    const { service, policy } = setup({ project: null });

    await expect(service.requestDocumentaryCorrection(PROJECT_ID, ADMIN_ID, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(policy.assertWriteTx).not.toHaveBeenCalled();
  });

  it('exige el permiso CIERRE_VEREDICTO', async () => {
    const { service, policy, tx } = setup();
    policy.assertWriteTx.mockRejectedValueOnce(new ForbiddenException());

    await expect(service.requestDocumentaryCorrection(PROJECT_ID, LEADER_ID, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(policy.assertWriteTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ idProyecto: PROJECT_ID }),
      'CIERRE_VEREDICTO',
      LEADER_ID,
    );
    expect(tx.revisionCierreProyecto.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['vacío', '   '],
    ['ausente', undefined],
    ['de más de 5000 caracteres', 'x'.repeat(5001)],
  ])('rechaza con 400 un comentario %s', async (_caso, comentario) => {
    const { service, tx } = setup();

    await expect(
      service.requestDocumentaryCorrection(PROJECT_ID, ADMIN_ID, {
        revisionId: REVISION_ID,
        comentario: comentario as string,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.revisionCierreProyecto.findFirst).not.toHaveBeenCalled();
  });

  it('responde 409 si la revisión ya no está ENVIADA', async () => {
    const { service, tx } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(null);

    await expect(service.requestDocumentaryCorrection(PROJECT_ID, ADMIN_ID, dto)).rejects.toThrow(
      'La revisión enviada ya no está vigente',
    );
  });

  it('responde 409 si la revisión cambió entre la lectura y el CAS', async () => {
    const { service, tx } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({ documentos: [] });
    tx.revisionCierreProyecto.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.requestDocumentaryCorrection(PROJECT_ID, ADMIN_ID, dto)).rejects.toThrow(
      'La revisión cambió',
    );
    expect(tx.revisionCierreProyecto.create).not.toHaveBeenCalled();
  });

  it('resuelve la revisión, crea el borrador siguiente heredando documentos y avisa al líder', async () => {
    const { service, tx, audit, notifications } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({
      documentos: [
        { idDocumentoCierre: 5, orden: 1 },
        { idDocumentoCierre: 6, orden: 2 },
      ],
    });

    const result = await service.requestDocumentaryCorrection(PROJECT_ID, ADMIN_ID, dto);

    expect(tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith({
      where: { idRevisionCierre: REVISION_ID, idProyecto: PROJECT_ID, estadoRevision: 'ENVIADA' },
      data: expect.objectContaining({
        estadoRevision: 'CORRECCION_DOCUMENTAL',
        idRevisor: ADMIN_ID,
        comentarioRevisor: 'Falta el acta firmada',
      }),
    });
    expect(tx.revisionCierreProyecto.create).toHaveBeenCalledWith({
      data: {
        idProyecto: PROJECT_ID,
        numeroRevision: 3,
        documentos: {
          create: [
            { idDocumentoCierre: 5, orden: 1 },
            { idDocumentoCierre: 6, orden: 2 },
          ],
        },
      },
    });
    expect(audit.registrarEvento.mock.calls.map(([e]) => e.tipoEvento)).toEqual([
      TipoEventoBitacora.PROJECT_CLOSE_REVIEW_DOC_CORRECTION,
      TipoEventoBitacora.CLOSURE_DRAFT_CREATED,
    ]);
    expect(notifications.persistTemplateTx).toHaveBeenCalledWith(
      tx,
      [LEADER_ID],
      'CIERRE_CORRECCION_DOCUMENTAL',
      expect.objectContaining({ projectTitle: 'Huerto UVG', numeroRevision: 3, comentario: 'Falta el acta firmada' }),
      expect.anything(),
    );
    expect(notifications.deferClosureEventsTx).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      PROJECT_ID,
      LEADER_ID,
      REVISION_ID + 1,
    );
    expect(notifications.publishEffects).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      projectId: PROJECT_ID,
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
      revisionId: REVISION_ID + 1,
      numeroRevision: 3,
      fingerprintEntrega: null,
      informeOficialId: null,
      cantidades: { vinculosHeredados: 2 },
    });
  });
});

describe('ProjectClosureReviewService.returnToExecution (E115)', () => {
  it('rechaza con 404 si el proyecto no existe', async () => {
    const { service } = setup({ project: null });

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: REVISION_ID, comentario: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige revisionId fuera del modo legacy', async () => {
    const { service, tx } = setup();

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: null, comentario: 'x' }),
    ).rejects.toThrow('revisionId es obligatorio');
    expect(tx.proyecto.updateMany).not.toHaveBeenCalled();
  });

  it('el modo legacy solo aplica a proyectos sin revisiones', async () => {
    const { service, tx } = setup();
    tx.revisionCierreProyecto.count.mockResolvedValueOnce(2);

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: null, legacy: true, comentario: 'x' }),
    ).rejects.toThrow('El modo legacy solo aplica a proyectos sin revisiones de cierre');
  });

  it('responde 409 si la revisión ya no está vigente', async () => {
    const { service, tx } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: REVISION_ID, comentario: 'x' }),
    ).rejects.toThrow('La revisión enviada ya no está vigente');
  });

  it('responde 409 si pierde el CAS de la revisión', async () => {
    const { service, tx } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({
      idRevisionCierre: REVISION_ID,
      numeroRevision: 2,
      fingerprintEntrega: FINGERPRINT,
    });
    tx.revisionCierreProyecto.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: REVISION_ID, comentario: 'x' }),
    ).rejects.toThrow('La revisión cambió');
    expect(tx.proyecto.updateMany).not.toHaveBeenCalled();
  });

  it('responde 409 si el proyecto ya no está EN_SOLICITUD_CIERRE', async () => {
    const { service, tx, audit } = setup();
    tx.revisionCierreProyecto.count.mockResolvedValueOnce(0);
    tx.proyecto.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.returnToExecution(PROJECT_ID, ADMIN_ID, { revisionId: null, legacy: true, comentario: 'x' }),
    ).rejects.toThrow('El proyecto cambió');
    expect(audit.registrarEvento).not.toHaveBeenCalled();
  });

  it('devuelve la revisión enviada y reabre el proyecto sin tocar horas', async () => {
    const { service, tx, audit, notifications } = setup();
    tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({
      idRevisionCierre: REVISION_ID,
      numeroRevision: 2,
      fingerprintEntrega: FINGERPRINT,
    });

    const result = await service.returnToExecution(PROJECT_ID, ADMIN_ID, {
      revisionId: REVISION_ID,
      comentario: ' Faltan tareas ',
    });

    expect(tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith({
      where: { idRevisionCierre: REVISION_ID, idProyecto: PROJECT_ID, estadoRevision: 'ENVIADA' },
      data: expect.objectContaining({ estadoRevision: 'DEVUELTA_A_EJECUCION', comentarioRevisor: 'Faltan tareas' }),
    });
    expect(tx.proyecto.updateMany).toHaveBeenCalledWith({
      where: { idProyecto: PROJECT_ID, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null },
      data: { estadoProyecto: 'EN_PROGRESO' },
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.horasParticipacion.findMany).not.toHaveBeenCalled();
    expect(audit.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoEvento: TipoEventoBitacora.PROJECT_CLOSE_RETURNED_TO_EXECUTION,
        valorAnterior: { estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: REVISION_ID },
        valorNuevo: { estadoProyecto: 'EN_PROGRESO', legacy: false, comentario: 'Faltan tareas' },
      }),
    );
    expect(notifications.persistTemplateTx).toHaveBeenCalledWith(
      tx,
      [LEADER_ID],
      'CIERRE_DEVUELTO_A_EJECUCION',
      expect.objectContaining({ revisionId: REVISION_ID }),
      expect.anything(),
    );
    expect(notifications.deferClosureEventsTx).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      PROJECT_ID,
      LEADER_ID,
      REVISION_ID,
      'EN_PROGRESO',
    );
    expect(result).toEqual({
      projectId: PROJECT_ID,
      estadoProyecto: 'EN_PROGRESO',
      revisionId: REVISION_ID,
      numeroRevision: 2,
      fingerprintEntrega: FINGERPRINT,
      informeOficialId: null,
      cantidades: { revisionesDevueltas: 1 },
    });
  });

  it('en modo legacy reabre el proyecto sin revisión', async () => {
    const { service, tx, notifications } = setup();
    tx.revisionCierreProyecto.count.mockResolvedValueOnce(0);

    const result = await service.returnToExecution(PROJECT_ID, ADMIN_ID, {
      revisionId: null,
      legacy: true,
      comentario: 'P-07',
    });

    expect(tx.revisionCierreProyecto.findFirst).not.toHaveBeenCalled();
    expect(notifications.persistTemplateTx.mock.calls[0][3]).not.toHaveProperty('revisionId');
    expect(result).toMatchObject({
      revisionId: null,
      numeroRevision: 0,
      fingerprintEntrega: null,
      cantidades: { revisionesDevueltas: 0 },
    });
  });
});

/** Escenario de aprobación consistente: cada prueba rompe UNA condición. */
function approvalScenario() {
  const ctx = setup();
  const { tx, report, documents } = ctx;
  const revision = {
    idRevisionCierre: REVISION_ID,
    estadoRevision: 'ENVIADA',
    fingerprintEntrega: FINGERPRINT,
    numeroRevision: 2,
  };
  const capture = {
    fingerprintEjecucion: 'e'.repeat(64),
    fingerprintModelo: 'm'.repeat(64),
    contexto: { titulo: 'Huerto UVG', horas: 7 },
    targetHours: [
      { idRegistroHoras: 501, idParticipacion: 801, horasCalculadas: '4.50' },
      { idRegistroHoras: 502, idParticipacion: 802, horasCalculadas: '2.50' },
      { idRegistroHoras: 503, idParticipacion: 803, horasCalculadas: '1.00' },
    ],
  };
  const uploaded = {
    identidad: {
      publicId: 'closure/informe-12-30',
      proveedor: 'CLOUDINARY',
      resourceType: 'raw',
      deliveryType: 'authenticated',
      assetId: 'asset-1',
      version: 3,
    },
    tamanoBytes: 2048,
    tamanoCifradoBytes: 2100,
    checksumSha256: 'c'.repeat(64),
    checksumCifradoSha256: 'd'.repeat(64),
    metadata: { alg: 'AES-256-GCM', iv: 'abc' },
  };
  const storedDocument = {
    idAutor: ADMIN_ID,
    externalId: uploaded.identidad.publicId,
    proveedor: uploaded.identidad.proveedor,
    resourceType: uploaded.identidad.resourceType,
    deliveryType: uploaded.identidad.deliveryType,
    assetId: uploaded.identidad.assetId,
    versionRemota: uploaded.identidad.version,
    tamanoBytes: BigInt(uploaded.tamanoBytes),
    tamanoCifradoBytes: BigInt(uploaded.tamanoCifradoBytes),
    checksumSha256: uploaded.checksumSha256,
    checksumCifradoSha256: uploaded.checksumCifradoSha256,
    cryptoMetadata: { ...uploaded.metadata },
    fingerprintEjecucion: capture.fingerprintEjecucion,
    fingerprintModelo: capture.fingerprintModelo,
    contextoReporte: { ...capture.contexto },
  };
  tx.revisionCierreProyecto.findFirst.mockResolvedValue(revision);
  report.buildOfficialModelTx.mockResolvedValue(capture);
  report.renderOfficial.mockReturnValue({ pdf: Buffer.from('%PDF') });
  documents.reserveGeneratedTx.mockResolvedValue({ idDocumentoCierre: DOCUMENT_ID });
  documents.uploadGenerated.mockResolvedValue(uploaded);
  tx.documentoCierre.findFirst.mockResolvedValue(storedDocument);
  tx.horasParticipacion.findMany.mockResolvedValue(
    capture.targetHours.map((row) => ({
      idRegistroHoras: row.idRegistroHoras,
      idParticipacion: row.idParticipacion,
      horasCalculadas: new Prisma.Decimal(row.horasCalculadas),
      idSprint: 9,
    })),
  );
  tx.$executeRaw.mockResolvedValue(3);
  // Usuario 20 tiene dos participaciones (801 activa, 802 ya retirada); 21 una.
  tx.participacionProyecto.findMany.mockResolvedValue([
    { idParticipacion: 801, idUsuario: 20, estadoParticipacion: 'ACTIVO' },
    { idParticipacion: 802, idUsuario: 20, estadoParticipacion: 'RETIRADO' },
    { idParticipacion: 803, idUsuario: 21, estadoParticipacion: 'ACTIVO' },
  ]);
  tx.participacionProyecto.updateMany.mockResolvedValue({ count: 2 });
  const dto = { revisionId: REVISION_ID, expectedFingerprint: FINGERPRINT, comentario: '  Aprobado  ' };
  return { ...ctx, revision, capture, uploaded, storedDocument, dto };
}

describe('ProjectClosureReviewService.approveClosure (E112) — camino feliz', () => {
  it('cierra el proyecto, acredita las horas exactas y completa las participaciones activas', async () => {
    const s = approvalScenario();

    const result = await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    expect(result).toEqual({
      projectId: PROJECT_ID,
      estadoProyecto: 'CERRADO',
      revisionId: REVISION_ID,
      numeroRevision: 2,
      fingerprintEntrega: FINGERPRINT,
      informeOficialId: DOCUMENT_ID,
      cantidades: { horasAcreditadas: 3, participacionesCompletadas: 2 },
    });
    expect(s.projectTx.run.mock.calls.map((call) => call[2])).toEqual([
      'closure.approve.capture',
      'closure.approve.record-upload',
      'closure.approve.finalize',
    ]);
    expect(s.readiness.assertReady).toHaveBeenCalledTimes(2);
    expect(s.readiness.assertReady).toHaveBeenCalledWith(s.tx, PROJECT_ID, {
      phase: 'APPROVE',
      revisionId: REVISION_ID,
    });
    expect(s.documents.reserveGeneratedTx).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({
        tipoDocumento: 'INFORME_OFICIAL_FINAL',
        nombreArchivo: `informe-oficial-${PROJECT_ID}-${REVISION_ID}.pdf`,
        fingerprintModelo: s.capture.fingerprintModelo,
      }),
    );
    expect(s.documents.uploadGenerated).toHaveBeenCalledWith(DOCUMENT_ID, PROJECT_ID, Buffer.from('%PDF'));
  });

  it('registra la carga con tamaños y huellas del proveedor', async () => {
    const s = approvalScenario();

    await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    const recordCall = s.tx.documentoCierre.updateMany.mock.calls[0][0];
    expect(recordCall.where).toMatchObject({ idDocumentoCierre: DOCUMENT_ID, estadoDocumento: 'RESERVADO' });
    expect(recordCall.data).toMatchObject({
      estadoDocumento: 'EN_CARGA',
      assetId: 'asset-1',
      versionRemota: 3,
      tamanoBytes: BigInt(2048),
      tamanoCifradoBytes: BigInt(2100),
    });
  });

  it('acredita solo los registros objetivo y notifica el total por usuario', async () => {
    const s = approvalScenario();

    await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    const sql = s.tx.$executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain("estado_horas = 'APROBADA'");
    expect(sql.values).toEqual(expect.arrayContaining([ADMIN_ID, 501, 502, 503]));
    expect(s.tx.participacionProyecto.updateMany).toHaveBeenCalledWith({
      where: { idParticipacion: { in: [801, 803] }, estadoParticipacion: 'ACTIVO' },
      data: { estadoParticipacion: 'COMPLETADO' },
    });
    const horas = s.notifications.persistTemplateTx.mock.calls
      .filter((call) => call[2] === 'HORAS_ACREDITADAS')
      .map((call) => [call[1], call[3].horasAcreditadas]);
    // Usuario 20 suma sus dos participaciones (4.50 + 2.50); 21 solo la suya.
    expect(horas).toEqual([
      [[20], '7.00'],
      [[21], '1.00'],
    ]);
    const aprobado = s.notifications.persistTemplateTx.mock.calls.find((call) => call[2] === 'CIERRE_APROBADO');
    expect(aprobado?.[1]).toEqual([LEADER_ID, 20, 21]);
  });

  it('aprueba la revisión con comentario recortado, cierra el proyecto y audita', async () => {
    const s = approvalScenario();

    await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    expect(s.tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith({
      where: {
        idRevisionCierre: REVISION_ID,
        idProyecto: PROJECT_ID,
        estadoRevision: 'ENVIADA',
        fingerprintEntrega: FINGERPRINT,
      },
      data: expect.objectContaining({
        estadoRevision: 'APROBADA',
        comentarioRevisor: 'Aprobado',
        idDocumentoOficial: DOCUMENT_ID,
      }),
    });
    expect(s.tx.proyecto.updateMany).toHaveBeenCalledWith({
      where: { idProyecto: PROJECT_ID, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null },
      data: { estadoProyecto: 'CERRADO' },
    });
    expect(s.audit.registrarEvento.mock.calls.map(([e]) => e.tipoEvento)).toEqual([
      TipoEventoBitacora.PROJECT_CLOSE_REVIEW_APPROVED,
      TipoEventoBitacora.PROJECT_HOURS_CREDITED,
    ]);
    expect(s.notifications.deferClosureEventsTx).toHaveBeenCalledWith(
      s.tx,
      expect.anything(),
      PROJECT_ID,
      LEADER_ID,
      REVISION_ID,
      'CERRADO',
    );
  });

  it('dispara el recálculo de insignias solo después de confirmar', async () => {
    const s = approvalScenario();

    await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    expect(s.events.emit).toHaveBeenCalledWith(INSIGNIAS_EVENTO, {
      claves: ['horas', 'cerrados', 'liderados'],
      idProyecto: PROJECT_ID,
    });
  });

  it('sin comentario guarda null y sin emisor de eventos no falla', async () => {
    const s = approvalScenario();
    const sinEventos = new ProjectClosureReviewService(
      {} as PrismaService,
      s.projectTx,
      s.policy,
      s.readiness as unknown as ProjectCloseReadinessService,
      s.audit as unknown as BitacoraEventosService,
      s.notifications as unknown as NotificationsService,
      s.report as unknown as ProjectClosureReportService,
      s.documents as unknown as ProjectClosureDocumentsService,
    );

    await sinEventos.approveClosure(PROJECT_ID, ADMIN_ID, { revisionId: REVISION_ID, expectedFingerprint: FINGERPRINT });

    expect(s.tx.revisionCierreProyecto.updateMany.mock.calls[0][0].data.comentarioRevisor).toBeNull();
  });

  it('un proyecto sin horas pendientes no ejecuta la acreditación ni completa a nadie', async () => {
    const s = approvalScenario();
    s.capture.targetHours = [];
    s.tx.horasParticipacion.findMany.mockResolvedValue([]);
    s.tx.participacionProyecto.findMany.mockResolvedValue([]);
    s.tx.participacionProyecto.updateMany.mockClear();

    const result = await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    expect(s.tx.$executeRaw).not.toHaveBeenCalled();
    expect(s.tx.participacionProyecto.updateMany).not.toHaveBeenCalled();
    expect(result.cantidades).toEqual({ horasAcreditadas: 0, participacionesCompletadas: 0 });
  });
});

describe('ProjectClosureReviewService.approveClosure (E112) — fase 1 (captura)', () => {
  it('rechaza con 404 si el proyecto no existe', async () => {
    const s = approvalScenario();
    const vacio = setup({ project: null });

    await expect(vacio.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige el permiso CIERRE_VEREDICTO', async () => {
    const s = approvalScenario();
    s.policy.assertWriteTx.mockRejectedValueOnce(new ForbiddenException());

    await expect(s.service.approveClosure(PROJECT_ID, LEADER_ID, s.dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.documents.reserveGeneratedTx).not.toHaveBeenCalled();
  });

  it('responde 404 si la revisión no existe', async () => {
    const s = approvalScenario();
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(null);

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'Revisión de cierre no encontrada',
    );
  });

  it('responde 409 si la revisión no está ENVIADA', async () => {
    const s = approvalScenario();
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({ ...s.revision, estadoRevision: 'APROBADA' });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow('La revisión no está enviada');
  });

  it('responde 409 si la huella de la entrega no coincide', async () => {
    const s = approvalScenario();

    await expect(
      s.service.approveClosure(PROJECT_ID, ADMIN_ID, { ...s.dto, expectedFingerprint: 'b'.repeat(64) }),
    ).rejects.toThrow('La entrega cambió');
    expect(s.readiness.assertReady).not.toHaveBeenCalled();
  });

  it('propaga el bloqueo de readiness sin reservar documento', async () => {
    const s = approvalScenario();
    s.readiness.assertReady.mockRejectedValueOnce(new ConflictException('Hay tareas abiertas'));

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow('Hay tareas abiertas');
    expect(s.documents.reserveGeneratedTx).not.toHaveBeenCalled();
  });
});

describe('ProjectClosureReviewService.approveClosure (E112) — I/O externo', () => {
  it('un fallo inesperado al renderizar se traduce a 503', async () => {
    const s = approvalScenario();
    s.report.renderOfficial.mockImplementationOnce(() => {
      throw new Error('fuente corrupta');
    });

    const promise = s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise).rejects.toThrow('No fue posible generar el informe oficial');
    expect(s.documents.uploadGenerated).not.toHaveBeenCalled();
  });

  it('una HttpException del render se propaga tal cual', async () => {
    const s = approvalScenario();
    const tooLarge = new BadRequestException('Informe demasiado grande');
    s.report.renderOfficial.mockImplementationOnce(() => {
      throw tooLarge;
    });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toBe(tooLarge);
  });

  it('un fallo del proveedor al subir se traduce a 503 y no finaliza', async () => {
    const s = approvalScenario();
    s.documents.uploadGenerated.mockRejectedValueOnce(new Error('timeout'));

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'No fue posible almacenar y verificar el informe oficial',
    );
    expect(s.projectTx.run).toHaveBeenCalledTimes(1);
    expect(s.tx.proyecto.updateMany).not.toHaveBeenCalled();
  });

  it('responde 409 si la reserva cambió antes de registrar la carga', async () => {
    const s = approvalScenario();
    s.tx.documentoCierre.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow('La reserva oficial cambió');
    expect(s.tx.proyecto.updateMany).not.toHaveBeenCalled();
  });

  it('registra null cuando el proveedor no devuelve assetId ni versión', async () => {
    const s = approvalScenario();
    s.uploaded.identidad.assetId = undefined as unknown as string;
    s.uploaded.identidad.version = undefined as unknown as number;
    s.storedDocument.assetId = null as unknown as string;
    s.storedDocument.versionRemota = null as unknown as number;

    await s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto);

    expect(s.tx.documentoCierre.updateMany.mock.calls[0][0].data).toMatchObject({ assetId: null, versionRemota: null });
  });
});

describe('ProjectClosureReviewService.approveClosure (E112) — fase 2 (finalización)', () => {
  it('rechaza con 404 si el proyecto desapareció antes de finalizar', async () => {
    const s = approvalScenario();
    let llamada = 0;
    s.projectTx.run.mockImplementation(async (projectId, actorId, operation, callback, options = {}) => {
      llamada += 1;
      const project = llamada === 3 ? null : { idProyecto: projectId, creadoPor: LEADER_ID, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null };
      const effects = { add: vi.fn(), drain: () => [] };
      const result = await callback({ tx: s.tx, project, effects, attempt: 1, actorId, operation });
      await options.publish?.([]);
      return result;
    });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['la revisión desapareció', (s: ReturnType<typeof approvalScenario>) => s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(s.revision).mockResolvedValueOnce(null)],
    ['la revisión ya no está ENVIADA', (s: ReturnType<typeof approvalScenario>) => s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(s.revision).mockResolvedValueOnce({ ...s.revision, estadoRevision: 'DEVUELTA_A_EJECUCION' })],
    ['la huella de la entrega cambió', (s: ReturnType<typeof approvalScenario>) => s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(s.revision).mockResolvedValueOnce({ ...s.revision, fingerprintEntrega: 'f'.repeat(64) })],
  ])('responde 409 si %s', async (_caso, romper) => {
    const s = approvalScenario();
    romper(s);

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'La revisión o su entrega cambiaron',
    );
    expect(s.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['la huella de ejecución', { fingerprintEjecucion: 'z'.repeat(64) }],
    ['la huella del modelo', { fingerprintModelo: 'y'.repeat(64) }],
    ['el contexto', { contexto: { titulo: 'Otro', horas: 7 } }],
  ])('responde 409 si cambió %s entre captura y finalización', async (_caso, cambio) => {
    const s = approvalScenario();
    s.report.buildOfficialModelTx
      .mockResolvedValueOnce(s.capture)
      .mockResolvedValueOnce({ ...s.capture, ...cambio });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'El contexto oficial cambió durante la aprobación',
    );
  });

  it.each([
    ['apareció un registro pendiente nuevo', (rows: Array<Record<string, unknown>>) => [...rows, { idRegistroHoras: 999, idParticipacion: 801, horasCalculadas: new Prisma.Decimal(1), idSprint: 9 }]],
    ['un registro perdió su cálculo', (rows: Array<Record<string, unknown>>) => rows.map((r, i) => (i === 0 ? { ...r, horasCalculadas: null } : r))],
    ['un registro no tiene sprint', (rows: Array<Record<string, unknown>>) => rows.map((r, i) => (i === 0 ? { ...r, idSprint: null } : r))],
    ['cambió un importe', (rows: Array<Record<string, unknown>>) => rows.map((r, i) => (i === 0 ? { ...r, horasCalculadas: new Prisma.Decimal('4.75') } : r))],
  ])('responde 409 si %s', async (_caso, mutar) => {
    const s = approvalScenario();
    const actuales = await s.tx.horasParticipacion.findMany();
    s.tx.horasParticipacion.findMany.mockResolvedValue(mutar(actuales));

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'Las horas objetivo cambiaron durante la aprobación',
    );
    expect(s.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('responde 409 si el documento en carga ya no existe', async () => {
    const s = approvalScenario();
    s.tx.documentoCierre.findFirst.mockResolvedValueOnce(null);

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'El resultado del proveedor no corresponde a la reserva oficial',
    );
  });

  it.each([
    ['otro autor', { idAutor: 99 }],
    ['otro publicId', { externalId: 'otro' }],
    ['otro proveedor', { proveedor: 'S3' }],
    ['otro resourceType', { resourceType: 'image' }],
    ['otro deliveryType', { deliveryType: 'upload' }],
    ['otro assetId', { assetId: 'asset-2' }],
    ['otra versión remota', { versionRemota: 4 }],
    ['otro tamaño', { tamanoBytes: BigInt(1) }],
    ['otro tamaño cifrado', { tamanoCifradoBytes: BigInt(1) }],
    ['otro checksum', { checksumSha256: '0'.repeat(64) }],
    ['otro checksum cifrado', { checksumCifradoSha256: '0'.repeat(64) }],
    ['otra metadata criptográfica', { cryptoMetadata: { alg: 'otro' } }],
    ['otra huella de ejecución', { fingerprintEjecucion: '0'.repeat(64) }],
    ['otra huella de modelo', { fingerprintModelo: '0'.repeat(64) }],
    ['otro contexto', { contextoReporte: { titulo: 'x' } }],
  ])('responde 409 si el documento guardado tiene %s', async (_caso, cambio) => {
    const s = approvalScenario();
    s.tx.documentoCierre.findFirst.mockResolvedValueOnce({ ...s.storedDocument, ...cambio });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'El resultado del proveedor no corresponde a la reserva oficial',
    );
    expect(s.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('responde 409 si la acreditación no alcanza el conteo exacto', async () => {
    const s = approvalScenario();
    s.tx.$executeRaw.mockResolvedValueOnce(2);

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'La acreditación no alcanzó el conteo exacto',
    );
    expect(s.tx.proyecto.updateMany).not.toHaveBeenCalled();
  });

  it('responde 409 si la compleción de participaciones no alcanza el conteo exacto', async () => {
    const s = approvalScenario();
    s.tx.participacionProyecto.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'La compleción no alcanzó el conteo exacto',
    );
  });

  it.each([
    ['el documento no pasó a DISPONIBLE', 'documento'],
    ['la revisión no se aprobó', 'revision'],
    ['el proyecto no se cerró', 'proyecto'],
  ])('responde 409 si %s', async (_caso, cual) => {
    const s = approvalScenario();
    if (cual === 'documento') {
      s.tx.documentoCierre.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    } else if (cual === 'revision') {
      s.tx.revisionCierreProyecto.updateMany.mockResolvedValueOnce({ count: 0 });
    } else {
      s.tx.proyecto.updateMany.mockResolvedValueOnce({ count: 0 });
    }

    await expect(s.service.approveClosure(PROJECT_ID, ADMIN_ID, s.dto)).rejects.toThrow(
      'La finalización atómica no alcanzó el conteo exacto',
    );
    expect(s.audit.registrarEvento).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });
});
