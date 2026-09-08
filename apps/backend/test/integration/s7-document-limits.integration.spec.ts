import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  cleanupClosureFixture,
  closureDocumentsStack,
  closureDraftFixture,
  pdfDeTamanoExacto,
  type ClosureCleanupScope,
} from './setup/closure-storage';
import {
  MAX_DOCUMENT_SIZE,
  MULTIPART_OVERHEAD_BYTES,
} from '../../src/project-closure/project-closure-documents.service';
import {
  cleanupClosureLifecycle,
  closureLifecycleStack,
  proyectoListoParaGenerar,
} from './setup/closure-lifecycle';

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
 * C116 (06 v2 §25/§26/§47 TC01): el límite de tamaño de un documento de
 * cierre. Es inclusivo y exacto: 10485760 bytes se aceptan y 10485761 no.
 */
describeIntegration('S7 límites de documentos de cierre', () => {
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
    // El ciclo de cierre borra primero sus agregados de horas: sin eso, el
    // barrido genérico intentaría borrar Sprints todavía referenciados.
    await cleanupClosureLifecycle(db, scope);
    await cleanupClosureFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('TC01-A: un PDF de 10485760 bytes se acepta y uno de 10485761 devuelve 413 antes de subir', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, storage } = closureDocumentsStack(db);
    scope.documentIds = [];

    const reservar = async (nombre: string) => {
      const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre,
        nombreArchivo: nombre,
      });
      scope.documentIds!.push(grant.documentId);
      return grant;
    };
    const liberar = async (documentId: number) => {
      await db.documentoCierre.delete({ where: { idDocumentoCierre: documentId } });
      scope.documentIds = scope.documentIds!.filter((id) => id !== documentId);
    };

    // El número del contrato, sin interpretaciones.
    expect(MAX_DOCUMENT_SIZE).toBe(10485760);
    expect(MULTIPART_OVERHEAD_BYTES).toBe(65536);

    const justo = await pdfDeTamanoExacto(MAX_DOCUMENT_SIZE);
    const unoDeMas = await pdfDeTamanoExacto(MAX_DOCUMENT_SIZE + 1);
    expect(justo.length).toBe(10485760);
    expect(unoDeMas.length).toBe(10485761);

    // El permiso de carga anuncia el mismo número que el servidor aplica.
    const enElLimite = await reservar('exacto.pdf');
    expect(enElLimite.maxBytes).toBe(MAX_DOCUMENT_SIZE);

    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      enElLimite.ticket,
      justo,
    );
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.tamanoBytes).toBe(MAX_DOCUMENT_SIZE);

    // El ciphertext mide EXACTAMENTE lo mismo: IV y tag van aparte, así que
    // el límite no necesita ningún margen criptográfico.
    const subido = storage.uploadImmutable.mock.calls[0][1] as Buffer;
    expect(subido.length).toBe(MAX_DOCUMENT_SIZE);
    const persistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: enElLimite.documentId },
    });
    expect(Number(persistido.tamanoCifradoBytes)).toBe(MAX_DOCUMENT_SIZE);
    const metadata = persistido.cryptoMetadata as Record<string, string>;
    expect(Buffer.from(metadata.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(metadata.tag, 'base64')).toHaveLength(16);

    const subidasTrasElLimite = storage.uploadImmutable.mock.calls.length;

    // Un byte más: 413 ANTES de contactar al proveedor.
    const excedido = await reservar('excedido.pdf');
    const respuesta = await expectStatus(413, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, excedido.ticket, unoDeMas),
    );
    expect(respuesta).toMatchObject({ code: 'DOCUMENTO_DEMASIADO_GRANDE' });
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: excedido.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    await liberar(excedido.documentId);

    // Cero bytes tampoco es un documento.
    const vacio = await reservar('vacio.pdf');
    await expectStatus(400, () =>
      service.uploadAndAttach(
        f.project.idProyecto,
        f.leader.idUsuario,
        vacio.ticket,
        Buffer.alloc(0),
      ),
    );
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    await liberar(vacio.documentId);

    // Un tamaño DECLARADO menor que los bytes reales no permite colarse: lo
    // que se mide es el buffer recibido, no lo que dijo el cliente.
    const mentiroso = await reservar('mentiroso.pdf');
    const conTamanoFalso = Object.assign(Buffer.from(unoDeMas), { size: 10 });
    await expectStatus(413, () =>
      service.uploadAndAttach(
        f.project.idProyecto,
        f.leader.idUsuario,
        mentiroso.ticket,
        conTamanoFalso,
      ),
    );
    expect(storage.uploadImmutable.mock.calls.length).toBe(subidasTrasElLimite);
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: mentiroso.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    await liberar(mentiroso.documentId);

    // Ningún exceso produjo un documento disponible ni un vínculo.
    expect(
      await db.documentoCierre.count({
        where: { idProyecto: f.project.idProyecto, estadoDocumento: 'DISPONIBLE' },
      }),
    ).toBe(1);
    expect(
      await db.documentoRevisionCierre.count({
        where: { idRevisionCierre: f.revision.idRevisionCierre },
      }),
    ).toBe(1);
  });

  it('TC01-B: un informe generado que excede 10485760 bytes devuelve 413, no se vincula y no permite cerrar', async () => {
    const f = await proyectoListoParaGenerar(db, scope);
    const { report, readiness, documentos } = closureLifecycleStack(db);

    // Un informe válido primero: deja el slot 0 con un vínculo real.
    const valido = await report.generateAutoReport(
      f.project.idProyecto,
      f.leader.idUsuario,
      f.revision.idRevisionCierre,
    );
    scope.documentIds = [valido.documentId];
    const slotAntes = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idRevisionCierre: f.revision.idRevisionCierre, orden: 0 },
    });
    expect(slotAntes.idDocumentoCierre).toBe(valido.documentId);
    const subidasAntes = documentos.storage.uploadImmutable.mock.calls.length;
    const documentosAntes = await db.documentoCierre.count({
      where: { idProyecto: f.project.idProyecto },
    });

    // El renderer produce un documento por encima del límite. Se interviene
    // el render —no el modelo— justamente porque el contrato prohíbe recortar
    // contribuciones para caber: lo que se prueba es el rechazo del Buffer.
    const renderOriginal = report.render.bind(report);
    const modeloRenderizado: Array<{ filas: number }> = [];
    vi.spyOn(report, 'render').mockImplementation((modelo, contexto) => {
      const resultado = renderOriginal(modelo, contexto);
      modeloRenderizado.push({ filas: resultado.resumen.filasContribucion });
      return {
        resumen: resultado.resumen,
        pdf: Buffer.concat([
          resultado.pdf,
          Buffer.alloc(MAX_DOCUMENT_SIZE + 1 - resultado.pdf.length, 0x20),
        ]),
      };
    });

    const respuesta = await expectStatus(413, () =>
      report.generateAutoReport(
        f.project.idProyecto,
        f.leader.idUsuario,
        f.revision.idRevisionCierre,
      ),
    );
    expect(respuesta).toMatchObject({ code: 'DOCUMENTO_DEMASIADO_GRANDE' });

    // Ni una llamada al proveedor: el rechazo ocurre antes de cifrar y subir.
    expect(documentos.storage.uploadImmutable.mock.calls.length).toBe(subidasAntes);
    // Ninguna contribución se omitió para intentar que cupiera.
    expect(modeloRenderizado).toHaveLength(1);
    expect(modeloRenderizado[0].filas).toBe(1);

    // La reserva quedó sin llegar a DISPONIBLE y el slot 0 conserva el
    // vínculo anterior: la entrega no se degradó.
    const reservaFallida = await db.documentoCierre.findFirst({
      where: {
        idProyecto: f.project.idProyecto,
        tipoDocumento: 'INFORME_AUTOMATICO',
        estadoDocumento: 'RESERVADO',
      },
    });
    expect(reservaFallida).not.toBeNull();
    scope.documentIds.push(reservaFallida!.idDocumentoCierre);
    expect(await db.documentoCierre.count({ where: { idProyecto: f.project.idProyecto } })).toBe(
      documentosAntes + 1,
    );
    const slotDespues = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idRevisionCierre: f.revision.idRevisionCierre, orden: 0 },
    });
    expect(slotDespues.idDocumentoCierre).toBe(valido.documentId);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CLOSURE_AUTOREPORT_GENERATED',
          idObjeto: String(reservaFallida!.idDocumentoCierre),
        },
      }),
    ).toBe(0);

    // Con el render de vuelta a la normalidad la generación funciona.
    vi.restoreAllMocks();
    // La reserva fallida bloquea el índice parcial hasta que el barrido la
    // retire; se libera aquí para poder observar la generación siguiente.
    await db.documentoCierre.delete({
      where: { idDocumentoCierre: reservaFallida!.idDocumentoCierre },
    });
    scope.documentIds = scope.documentIds.filter(
      (id) => id !== reservaFallida!.idDocumentoCierre,
    );
    const reintento = await report.generateAutoReport(
      f.project.idProyecto,
      f.leader.idUsuario,
      f.revision.idRevisionCierre,
    );
    scope.documentIds.push(reintento.documentId);
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: reintento.documentId } }))
        .estadoDocumento,
    ).toBe('DISPONIBLE');

    // Y sin evidencias el proyecto sigue sin poder solicitar su cierre.
    const resumen = await readiness.evaluate(undefined, f.project.idProyecto, {
      phase: 'REQUEST',
      revisionId: f.revision.idRevisionCierre,
    });
    expect(resumen.canSubmit).toBe(false);
    expect(resumen.blockers.map((blocker) => blocker.code)).toContain('EVIDENCIAS_INVALIDAS');
  });
});
