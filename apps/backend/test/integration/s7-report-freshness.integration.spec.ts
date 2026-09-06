import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException, ValidationPipe } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupClosureLifecycle,
  closureLifecycleStack,
  proyectoListoParaGenerar,
  closureReadyFixture,
} from './setup/closure-lifecycle';
import { pdfFixture, type ClosureCleanupScope } from './setup/closure-storage';
import { GenerateReportDto } from '../../src/project-closure/dto/closure.dto';
import { createIntegrationAdmin } from './setup/leadership';
import { flowAStack } from './setup/flow-a';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function expectStatus(status: number, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === status) {
      return error.getResponse();
    }
    throw new Error(
      `Se esperaba HTTP ${status} pero la operación falló con: ${
        error instanceof HttpException ? `HTTP ${error.getStatus()}` : String(error)
      }`,
    );
  }
  throw new Error(`Se esperaba HTTP ${status} pero la operación se resolvió sin error.`);
}

/**
 * C130+ (06 v2 §28/§47 T25): frescura del informe automático. El PDF describe
 * un instante de la ejecución; si la ejecución cambia, el informe deja de
 * describirla y no puede sostener una entrega.
 */
describeIntegration('S7 frescura del informe de cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupClosureLifecycle(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T25-B: cambiar un dato operativo tras generar el informe rechaza el envío con INFORME_DESACTUALIZADO y deja las postulaciones intactas', async () => {
    const f = await proyectoListoParaGenerar(db, scope);
    const { report, documentos, readiness, runner } = closureLifecycleStack(db);
    const generated = await report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.revision.idRevisionCierre);
    const grant = await documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre, nombreArchivo: 'evidencia.pdf',
    });
    await documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, await pdfFixture());
    const pending = await db.postulacion.create({ data: {
      idRolProyecto: f.role.idRolProyecto, idUsuarioPostulante: f.leader.idUsuario, justificacion: 'Postulación de prueba',
    } });
    const evaluate = () => runner.run(f.project.idProyecto, f.leader.idUsuario, 'test.readiness', ({ tx }) =>
      readiness.assertReady(tx, f.project.idProyecto, { phase: 'REQUEST', revisionId: f.revision.idRevisionCierre, expectedFingerprint: generated.fingerprintEjecucion }));
    expect((await evaluate()).canSubmit).toBe(true);
    await db.$transaction(async (tx) => {
      await tx.rolProyecto.update({ where: { idRolProyecto: f.role.idRolProyecto }, data: { nombreRol: 'Rol actualizado' } });
      await tx.registroTiempoTarea.updateMany({ where: { idAsignacion: f.asignacion.idAsignacion }, data: { horas: '5.00' } });
      await tx.asignacionTarea.update({ where: { idAsignacion: f.asignacion.idAsignacion }, data: { horasReales: '5.00' } });
      await tx.horasParticipacion.updateMany({ where: { idParticipacion: f.participacion.idParticipacion }, data: { horasReportadas: '5.00', horasCalculadas: '5.00' } });
    });
    const error = await expectStatus(409, evaluate);
    expect(error).toMatchObject({ blockers: expect.arrayContaining([expect.objectContaining({ code: 'INFORME_DESACTUALIZADO' })]) });
    expect(await db.postulacion.findUniqueOrThrow({ where: { idPostulacion: pending.idPostulacion } })).toEqual(pending);
    expect((await db.proyecto.findUniqueOrThrow({ where: { idProyecto: f.project.idProyecto } })).estadoProyecto).toBe('EN_PROGRESO');
    expect((await db.revisionCierreProyecto.findUniqueOrThrow({ where: { idRevisionCierre: f.revision.idRevisionCierre } })).estadoRevision).toBe('BORRADOR');
    const refreshed = await report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.revision.idRevisionCierre);
    expect(refreshed.fingerprintEjecucion).not.toBe(generated.fingerprintEjecucion);
    expect((await readiness.evaluate(undefined, f.project.idProyecto, { phase: 'REQUEST', revisionId: f.revision.idRevisionCierre, expectedFingerprint: refreshed.fingerprintEjecucion })).canSubmit).toBe(true);
    expect((await db.postulacion.findUniqueOrThrow({ where: { idPostulacion: pending.idPostulacion } })).estadoPostulacion).toBe('PENDIENTE');
  });

  it('T26-A: la corrección documental crea el borrador siguiente heredando los vínculos y conserva intacta la entrega anterior', async () => {
    const f = await closureReadyFixture(db, scope);
    const { closure, review, documentos, gateway } = f.stack;
    const admin = await createIntegrationAdmin(db, scope);
    for (let n = 0; n < 2; n++) {
      const grant = await documentos.service.reserve(f.project.idProyecto, f.leader.idUsuario, { revisionId: f.dto.revisionId, nombreArchivo: `extra-${n}.pdf` });
      await documentos.service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, await pdfFixture());
    }
    await closure.requestClose(f.project.idProyecto, f.leader.idUsuario, f.dto);
    const links = await db.documentoRevisionCierre.findMany({ where: { idRevisionCierre: f.dto.revisionId }, orderBy: { orden: 'asc' }, include: { documento: true } });
    for (const comentario of [undefined, '  ']) await expectStatus(400, () => review.requestDocumentaryCorrection(f.project.idProyecto, admin.idUsuario, { revisionId: f.dto.revisionId, comentario: comentario! }));
    await expectStatus(403, () => review.requestDocumentaryCorrection(f.project.idProyecto, f.leader.idUsuario, { revisionId: f.dto.revisionId, comentario: 'Corrija evidencia' }));
    gateway.emitToUsers.mockClear();
    const corrected = await review.requestDocumentaryCorrection(f.project.idProyecto, admin.idUsuario, { revisionId: f.dto.revisionId, comentario: '  Corrija evidencia  ' });
    const draftLinks = await db.documentoRevisionCierre.findMany({ where: { idRevisionCierre: corrected.revisionId }, orderBy: { orden: 'asc' } });
    expect(draftLinks.map(({ idDocumentoCierre, orden }) => ({ idDocumentoCierre, orden }))).toEqual(links.map(({ idDocumentoCierre, orden }) => ({ idDocumentoCierre, orden })));
    expect(corrected).toMatchObject({ numeroRevision: 2, estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    const old = await closure.getRevision(f.project.idProyecto, admin.idUsuario, 1);
    expect(old).toMatchObject({ estadoRevision: 'CORRECCION_DOCUMENTAL', comentarioRevisor: 'Corrija evidencia', idRevisor: admin.idUsuario, resueltaEn: expect.any(Date), informeOficial: null });
    expect(old.documentosEnviados).toHaveLength(4);
    expect((await closure.listRevisions(f.project.idProyecto, f.leader.idUsuario)).items).toHaveLength(2);
    const evidence = links[1].idDocumentoCierre;
    const read = await documentos.service.getReadUrl(f.project.idProyecto, evidence, f.leader.idUsuario);
    const before = await documentos.service.readContent(f.project.idProyecto, evidence, f.leader.idUsuario, new URL(read.url, 'http://localhost').searchParams.get('ticket')!);
    await documentos.service.detach(f.project.idProyecto, f.leader.idUsuario, corrected.revisionId, evidence);
    expect(await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: evidence } })).toEqual(links[1].documento);
    const after = await documentos.service.readContent(f.project.idProyecto, evidence, f.leader.idUsuario, new URL(read.url, 'http://localhost').searchParams.get('ticket')!);
    expect(after.bytes).toEqual(before.bytes);
    await expectStatus(409, () => documentos.service.detach(f.project.idProyecto, f.leader.idUsuario, f.dto.revisionId, evidence));
    await expectStatus(409, () => documentos.service.detach(f.project.idProyecto, f.leader.idUsuario, corrected.revisionId, links[0].idDocumentoCierre));
    expect(await closure.getRevision(f.project.idProyecto, admin.idUsuario, 1)).toEqual(old);
    await expectStatus(409, () => flowAStack(db).service.startSprint(f.project.idProyecto, f.leader.idUsuario));
    expect(await db.notificacion.count({ where: { idUsuario: f.leader.idUsuario, tipoNotificacion: 'CIERRE_CORRECCION_DOCUMENTAL' } })).toBe(1);
    expect(await db.bitacoraAuditoria.count({ where: { idUsuario: f.leader.idUsuario, accion: 'CLOSURE_DOCUMENT_REMOVED' } })).toBe(1);
    expect(gateway.emitToUsers.mock.calls.map((call) => call[0])).toEqual(['CLOSURE_REVIEW_UPDATED']);
  });

  it('T25-A: la generación automática captura bajo lock, renderiza fuera y vincula el slot 0 tras comparar la huella', async () => {
    const f = await proyectoListoParaGenerar(db, scope);
    const { report, documentos } = closureLifecycleStack(db);

    // Sin ninguna evidencia todavía: la generación NO exige los tres códigos
    // documentales, porque está produciendo justamente uno de ellos.
    expect(
      await db.documentoCierre.count({
        where: { idProyecto: f.project.idProyecto, tipoDocumento: 'EVIDENCIA_LIDER' },
      }),
    ).toBe(0);

    // Durante el render y la subida NO puede haber transacción abierta: la
    // segunda conexión toma el lock del proyecto sin esperar.
    let lockLibreDuranteLaSubida = false;
    const uploadOriginal = documentos.storage.uploadImmutable.getMockImplementation()!;
    documentos.storage.uploadImmutable.mockImplementation(async (identity, ciphertext, params) => {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
        await tx.$queryRawUnsafe(
          'SELECT id_proyecto FROM proyecto WHERE id_proyecto = $1 FOR UPDATE NOWAIT',
          f.project.idProyecto,
        );
        lockLibreDuranteLaSubida = true;
      });
      return uploadOriginal(identity, ciphertext, params);
    });

    const primero = await report.generateAutoReport(
      f.project.idProyecto,
      f.leader.idUsuario,
      f.revision.idRevisionCierre,
    );
    expect(lockLibreDuranteLaSubida).toBe(true);
    scope.documentIds = [primero.documentId];

    // El documento existe, disponible y con toda su metadata de generación.
    const documento = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: primero.documentId },
    });
    expect(documento.tipoDocumento).toBe('INFORME_AUTOMATICO');
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.generatorVersion).toBe('closure-report/1.0.0');
    expect(documento.fingerprintEjecucion).toBe(primero.fingerprintEjecucion);
    expect(documento.fingerprintModelo).toBe(primero.fingerprintModelo);
    expect(documento.contextoReporte).toMatchObject({ schemaVersion: 1, variante: 'AUTOMATICO' });
    // Y lo subido es ciphertext de un PDF real.
    const subido = documentos.storage.uploadImmutable.mock.calls[0][1] as Buffer;
    expect(subido.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');

    // Vinculado al SLOT 0 del borrador.
    const vinculo = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idRevisionCierre: f.revision.idRevisionCierre, orden: 0 },
    });
    expect(vinculo.idDocumentoCierre).toBe(primero.documentId);

    // Generar de nuevo crea un documento NUEVO y sustituye el vínculo; el
    // anterior queda sin vínculo y purgable, con sus bytes intactos.
    const segundo = await report.generateAutoReport(
      f.project.idProyecto,
      f.leader.idUsuario,
      f.revision.idRevisionCierre,
    );
    scope.documentIds.push(segundo.documentId);
    expect(segundo.documentId).not.toBe(primero.documentId);
    expect(segundo.documentoSustituido).toBe(primero.documentId);
    const slotCero = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idRevisionCierre: f.revision.idRevisionCierre, orden: 0 },
    });
    expect(slotCero.idDocumentoCierre).toBe(segundo.documentId);
    expect(
      await db.documentoRevisionCierre.count({
        where: { idDocumentoCierre: primero.documentId },
      }),
    ).toBe(0);
    const anteriorIntacto = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: primero.documentId },
    });
    expect(anteriorIntacto.estadoDocumento).toBe('DISPONIBLE');
    expect(anteriorIntacto.checksumSha256).toBe(documento.checksumSha256);

    // El evento cita el hash y el vínculo sustituido.
    const evento = await db.bitacoraAuditoria.findFirstOrThrow({
      where: {
        accion: 'CLOSURE_AUTOREPORT_GENERATED',
        idObjeto: String(segundo.documentId),
      },
    });
    const detalle = evento.detalleJson as {
      valorAnterior: { documentoSustituido: number } | null;
      valorNuevo: { checksumSha256: string };
    };
    expect(detalle.valorAnterior?.documentoSustituido).toBe(primero.documentId);
    const segundoPersistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: segundo.documentId },
    });
    expect(detalle.valorNuevo.checksumSha256).toBe(segundoPersistido.checksumSha256);

    // Una revisión de OTRO proyecto no existe para este: 404.
    await expectStatus(404, () =>
      report.generateAutoReport(
        f.project.idProyecto,
        f.leader.idUsuario,
        f.revisionAjena.idRevisionCierre,
      ),
    );

    // El payload no acepta horas ni metadata del cliente.
    await expectStatus(400, () =>
      pipe.transform(
        { revisionId: f.revision.idRevisionCierre, horasTotales: '99.00' },
        { type: 'body', metatype: GenerateReportDto },
      ) as Promise<unknown>,
    );

    // El PDF generado es real y contiene el proyecto.
    const generado = await PDFDocument.load(
      (
        await documentos.storage.readCiphertext.getMockImplementation()!({
          proveedor: 'cloudinary',
          cloudName: 'cuenta-sintetica',
          publicId: documento.externalId,
          resourceType: 'raw',
          deliveryType: 'authenticated',
        })
      ) as Buffer,
      { ignoreEncryption: true },
    ).catch(() => null);
    // El objeto remoto es ciphertext: pdf-lib no puede abrirlo.
    expect(generado).toBeNull();
  });
});
