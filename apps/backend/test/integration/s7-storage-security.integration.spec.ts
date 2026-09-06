import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { useSecondClient } from './setup/concurrency';
import {
  cleanupClosureFixture,
  closureConfig,
  closureDocumentsStack,
  closureDraftFixture,
  pdfCifradoPorElUsuario,
  pdfFixture,
  pdfSinPaginas,
  type ClosureCleanupScope,
} from './setup/closure-storage';
import { ClosurePdfValidationService } from '../../src/storage/closure-pdf-validation.service';
import { MAX_DOCUMENT_SIZE } from '../../src/project-closure/project-closure-documents.service';

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

describeIntegration('S7 seguridad del almacenamiento de cierre', () => {
  let db: PrismaClient;
  let scope: ClosureCleanupScope;
  const second = useSecondClient();

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
  });
  beforeEach(() => {
    scope = {};
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupClosureFixture(db, scope);
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it('T30-A: un ticket consumido no puede reutilizarse y el reintento del mismo actor es idempotente sin volver a subir', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, tickets, storage } = closureDocumentsStack(db);
    const pdf = await pdfFixture();

    // La reserva entrega un permiso de aplicación, no una firma del proveedor.
    const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'evidencia final.pdf',
    });
    scope.documentIds = [grant.documentId];
    expect(grant.documentId).toBeGreaterThan(0);
    expect(grant.uploadUrl).toBe(`/proyectos/${f.project.idProyecto}/cierre/documentos`);
    expect(grant.maxBytes).toBe(MAX_DOCUMENT_SIZE);
    expect(grant.maxBytes).toBe(10485760);
    expect(grant.expiraEn.getTime()).toBeGreaterThan(Date.now());
    const grantSerializado = JSON.stringify(grant);
    expect(grantSerializado).not.toContain('secreto-sintetico-de-prueba');
    expect(grantSerializado).not.toContain('signature');
    expect(grantSerializado).not.toContain('api_key');
    expect(grantSerializado).not.toContain('cloudinary');

    const reservado = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    expect(reservado.estadoDocumento).toBe('RESERVADO');
    expect(reservado.externalId).toMatch(/^uvgenius\/cierre\/\d+\/[0-9a-f-]{36}\.enc$/);

    // Durante la transmisión NO puede haber una transacción abierta sobre el
    // proyecto: la segunda conexión toma su lock sin esperar.
    let lockLibreDuranteLaCarga = false;
    const uploadOriginal = storage.uploadImmutable.getMockImplementation()!;
    storage.uploadImmutable.mockImplementation(async (identity, ciphertext, params) => {
      await second().$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
        await tx.$queryRawUnsafe(
          'SELECT id_proyecto FROM proyecto WHERE id_proyecto = $1 FOR UPDATE NOWAIT',
          f.project.idProyecto,
        );
        lockLibreDuranteLaCarga = true;
      });
      return uploadOriginal(identity, ciphertext, params);
    });

    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      grant.ticket,
      pdf,
    );
    expect(lockLibreDuranteLaCarga).toBe(true);
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.tamanoBytes).toBe(pdf.length);
    expect(documento.assetId).not.toBeNull();
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);

    // Lo subido es CIPHERTEXT: nunca el PDF en claro.
    const subido = storage.uploadImmutable.mock.calls[0][1] as Buffer;
    expect(subido.length).toBe(pdf.length);
    expect(subido.equals(pdf)).toBe(false);
    expect(subido.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');

    // El vínculo con el borrador y el evento existen.
    const vinculo = await db.documentoRevisionCierre.findFirstOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    expect(vinculo.idRevisionCierre).toBe(f.revision.idRevisionCierre);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'CLOSURE_DOCUMENT_ADDED', idObjeto: String(grant.documentId) },
      }),
    ).toBe(1);

    // La metadata criptográfica se guardó sin ninguna clave en claro.
    const persistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: grant.documentId },
    });
    const metadata = persistido.cryptoMetadata as Record<string, string>;
    expect(Object.keys(metadata).sort()).toEqual(
      ['format', 'iv', 'keyId', 'tag', 'wrapIv', 'wrapTag', 'wrappedDek'].sort(),
    );
    expect(JSON.stringify(metadata)).not.toContain(Buffer.alloc(32, 3).toString('base64'));

    // Reintento del MISMO actor: mismo resultado, sin segunda carga.
    const repetido = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      grant.ticket,
      pdf,
    );
    expect(repetido).toEqual(documento);
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);
    expect(await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: grant.documentId } })).toBe(1);

    // Otro actor con el mismo ticket: conflicto, sin carga ni vínculo nuevo.
    await expectStatus(409, () =>
      service.uploadAndAttach(f.project.idProyecto, f.otro.idUsuario, grant.ticket, pdf),
    );
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);

    // Tres reservas seguidas sin consumir: la tercera se rechaza.
    const primera = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'otra.pdf',
    });
    const segunda = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'otra-mas.pdf',
    });
    scope.documentIds.push(primera.documentId, segunda.documentId);
    const tercera = await expectStatus(409, () =>
      service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre,
        nombreArchivo: 'tercera.pdf',
      }),
    );
    expect(tercera).toMatchObject({ code: 'RESERVA_NO_DISPONIBLE' });

    // Ticket expirado y ticket manipulado: 401 y ninguna escritura.
    const documentosAntes = await db.documentoCierre.count({
      where: { idProyecto: f.project.idProyecto },
    });
    const vencido = tickets.sign(
      {
        purpose: 'upload',
        documentId: primera.documentId,
        projectId: f.project.idProyecto,
        revisionId: f.revision.idRevisionCierre,
        actorId: f.leader.idUsuario,
      },
      -10,
    );
    await expectStatus(401, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, vencido.ticket, pdf),
    );
    const manipulado = `${primera.ticket.slice(0, -2)}${primera.ticket.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
    await expectStatus(401, () =>
      service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, manipulado, pdf),
    );
    expect(await db.documentoCierre.count({ where: { idProyecto: f.project.idProyecto } })).toBe(
      documentosAntes,
    );
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: primera.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    expect(storage.uploadImmutable).toHaveBeenCalledTimes(1);
  });

  it('T30-B: un 200 que devuelve el asset anterior no confirma el documento y produce ASSET_NO_COINCIDE', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, storage } = closureDocumentsStack(db);
    const pdf = await pdfFixture();
    scope.documentIds = [];

    const reservar = async (nombre: string) => {
      const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
        revisionId: f.revision.idRevisionCierre,
        nombreArchivo: nombre,
      });
      scope.documentIds!.push(grant.documentId);
      return grant;
    };

    // Un documento correcto y ya DISPONIBLE: es el histórico que no debe
    // alterarse pase lo que pase después.
    const bueno = await reservar('historico.pdf');
    const historico = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      bueno.ticket,
      pdf,
    );
    expect(historico.estadoDocumento).toBe('DISPONIBLE');
    const historicoPersistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: bueno.documentId },
    });
    const uploadsTrasElHistorico = storage.uploadImmutable.mock.calls.length;

    const originalUpload = storage.uploadImmutable.getMockImplementation()!;
    const originalVerify = storage.verifyAsset.getMockImplementation()!;
    const originalRead = storage.readCiphertext.getMockImplementation()!;
    const restaurar = () => {
      storage.uploadImmutable.mockImplementation(originalUpload);
      storage.verifyAsset.mockImplementation(originalVerify);
      storage.readCiphertext.mockImplementation(originalRead);
    };

    // Cuatro formas de que el objeto remoto NO sea el que se envió.
    const escenarios: Array<[string, () => void]> = [
      [
        'el proveedor conservó el asset anterior con bytes distintos del mismo tamaño',
        () => {
          storage.uploadImmutable.mockImplementation(async (identity, ciphertext, params) => {
            // 200 «correcto», pero lo almacenado es otro contenido igual de largo.
            const suplantado = Buffer.alloc((ciphertext as Buffer).length, 0x41);
            return originalUpload(identity, suplantado, params);
          });
        },
      ],
      [
        'api.resource devuelve otra modalidad de entrega',
        () => {
          storage.verifyAsset.mockImplementation(async (identity) => ({
            ...(await originalVerify(identity)),
            deliveryType: 'upload',
          }));
        },
      ],
      [
        'la descarga devuelve un SHA-256 distinto',
        () => {
          storage.readCiphertext.mockImplementation(async (identity) => {
            const bytes = (await originalRead(identity)) as Buffer;
            const alterado = Buffer.from(bytes);
            alterado[0] ^= 0xff;
            return alterado;
          });
        },
      ],
      [
        'el assetId no cruza con la respuesta del upload',
        () => {
          storage.verifyAsset.mockImplementation(async (identity) => ({
            ...(await originalVerify(identity)),
            assetId: 'asset-de-otro-objeto',
          }));
        },
      ],
    ];

    for (const [caso, programar] of escenarios) {
      restaurar();
      programar();
      const grant = await reservar(`fallido-${escenarios.indexOf(escenarios.find(([c]) => c === caso)!)}.pdf`);
      const respuesta = await expectStatus(409, () =>
        service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, pdf),
      );
      expect(respuesta, caso).toMatchObject({ code: 'ASSET_NO_COINCIDE' });

      const fallido = await db.documentoCierre.findUniqueOrThrow({
        where: { idDocumentoCierre: grant.documentId },
      });
      // No llega a DISPONIBLE y no se vincula al borrador.
      expect(fallido.estadoDocumento, caso).not.toBe('DISPONIBLE');
      expect(fallido.disponibleEn, caso).toBeNull();
      expect(
        await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: grant.documentId } }),
        caso,
      ).toBe(0);
      expect(
        await db.bitacoraAuditoria.count({
          where: { accion: 'CLOSURE_DOCUMENT_ADDED', idObjeto: String(grant.documentId) },
        }),
        caso,
      ).toBe(0);

      // Nunca se reintenta con overwrite, ni se reutiliza el publicId, ni se
      // destruye el objeto para forzar la carga.
      for (const llamada of storage.uploadImmutable.mock.calls) {
        expect((llamada[2] as { overwrite: boolean }).overwrite, caso).toBe(false);
      }
      expect(storage.destroy, caso).not.toHaveBeenCalled();
      const identificadores = storage.uploadImmutable.mock.calls.map(
        (llamada) => (llamada[0] as { publicId: string }).publicId,
      );
      expect(new Set(identificadores).size, caso).toBe(identificadores.length);

      // El documento histórico queda EXACTAMENTE como estaba.
      const historicoAhora = await db.documentoCierre.findUniqueOrThrow({
        where: { idDocumentoCierre: bueno.documentId },
      });
      expect(historicoAhora.checksumSha256, caso).toBe(historicoPersistido.checksumSha256);
      expect(historicoAhora.assetId, caso).toBe(historicoPersistido.assetId);
      expect(historicoAhora.versionRemota, caso).toBe(historicoPersistido.versionRemota);
      expect(historicoAhora.estadoDocumento, caso).toBe('DISPONIBLE');

      // La reserva fallida queda como candidata a purga, no se reaprovecha.
      await db.documentoCierre.delete({ where: { idDocumentoCierre: grant.documentId } });
      scope.documentIds = scope.documentIds!.filter((id) => id !== grant.documentId);
    }

    // Y con el proveedor comportándose, la carga sí se confirma.
    restaurar();
    const correcto = await reservar('correcto.pdf');
    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      correcto.ticket,
      pdf,
    );
    expect(documento.estadoDocumento).toBe('DISPONIBLE');
    expect(documento.assetId).not.toBeNull();
    expect(documento.versionRemota).not.toBeNull();
    expect(storage.verifyAsset).toHaveBeenCalled();
    expect(storage.readCiphertext).toHaveBeenCalled();
    expect(storage.uploadImmutable.mock.calls.length).toBeGreaterThan(uploadsTrasElHistorico);

    // El etag no es el hash del PDF: nunca se persiste como checksum.
    const persistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: correcto.documentId },
    });
    expect(persistido.checksumSha256).not.toBe('etag-sintetico');
    expect(persistido.checksumCifradoSha256).not.toBe('etag-sintetico');
    // Y no existe ninguna columna etag en el modelo.
    expect(Object.keys(persistido)).not.toContain('etag');
  });

  it('T30-C: contenido no PDF, PDF cifrado por el usuario o ilegible se rechaza con 422 sin vincular ni sustituir el documento enviado', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, storage } = closureDocumentsStack(db);
    scope.documentIds = [];
    const pdfValido = await pdfFixture();

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

    // Un documento ya enviado en una revisión anterior: nada de lo que siga
    // puede tocarlo.
    const enviado = await reservar('enviado.pdf');
    const documentoEnviado = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      enviado.ticket,
      pdfValido,
    );
    const enviadoPersistido = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: enviado.documentId },
    });
    const subidasTrasElEnviado = storage.uploadImmutable.mock.calls.length;

    // Cuatro contenidos que NO son un PDF utilizable.
    const textoPlano = Buffer.from('esto no es un pdf, es texto plano\n', 'utf8');
    const cuerpoCorrupto = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      Buffer.from('contenido que no forma un documento\n'.repeat(20), 'latin1'),
    ]);
    // Cifrado por el USUARIO, no por nosotros: se rechaza en vez de intentar
    // abrirlo de todos modos.
    const cifradoPorElUsuario = await pdfCifradoPorElUsuario();
    const sinPaginas = pdfSinPaginas();

    const invalidos: Array<[string, Buffer]> = [
      ['texto plano', textoPlano],
      ['cuerpo corrupto', cuerpoCorrupto],
      ['cifrado por el usuario', cifradoPorElUsuario],
      ['cero páginas', sinPaginas],
    ];

    for (const [caso, contenido] of invalidos) {
      const grant = await reservar(`invalido-${caso}.pdf`);
      await expectStatus(422, () =>
        service.uploadAndAttach(f.project.idProyecto, f.leader.idUsuario, grant.ticket, contenido),
      );
      const fila = await db.documentoCierre.findUniqueOrThrow({
        where: { idDocumentoCierre: grant.documentId },
      });
      // La reserva no avanza ni se vincula, y nada llegó al proveedor.
      expect(fila.estadoDocumento, caso).toBe('RESERVADO');
      expect(
        await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: grant.documentId } }),
        caso,
      ).toBe(0);
      expect(storage.uploadImmutable.mock.calls.length, caso).toBe(subidasTrasElEnviado);
      await liberar(grant.documentId);
    }

    // El válido sí se acepta.
    const bueno = await reservar('valido.pdf');
    const aceptado = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      bueno.ticket,
      pdfValido,
    );
    expect(aceptado.estadoDocumento).toBe('DISPONIBLE');

    // Un parseo que se pasa del presupuesto se corta y devuelve 422 sin
    // colgar el proceso. El presupuesto se reduce a propósito: lo que se
    // verifica es el corte, no cuánto tarda un PDF concreto.
    const validadorImpaciente = new ClosurePdfValidationService(1, 2);
    const lento = closureDocumentsStack(db, closureConfig(), validadorImpaciente);
    const grantLento = await lento.service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'lento.pdf',
    });
    scope.documentIds.push(grantLento.documentId);
    await expectStatus(422, () =>
      lento.service.uploadAndAttach(
        f.project.idProyecto,
        f.leader.idUsuario,
        grantLento.ticket,
        pdfValido,
      ),
    );
    expect(
      (await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: grantLento.documentId } }))
        .estadoDocumento,
    ).toBe('RESERVADO');
    await liberar(grantLento.documentId);

    // Tres validaciones simultáneas: como mucho dos parsean a la vez.
    const validadorConcurrente = new ClosurePdfValidationService(10_000, 2);
    const resultados = await Promise.all([
      validadorConcurrente.assertValidPdf(pdfValido),
      validadorConcurrente.assertValidPdf(pdfValido),
      validadorConcurrente.assertValidPdf(pdfValido),
    ]);
    expect(resultados.every((resultado) => resultado.paginas >= 1)).toBe(true);
    expect(validadorConcurrente.maxSimultaneos).toBeLessThanOrEqual(2);

    // El documento enviado conserva bytes, checksum y vínculo: el original
    // nunca se reescribe.
    const enviadoAhora = await db.documentoCierre.findUniqueOrThrow({
      where: { idDocumentoCierre: enviado.documentId },
    });
    expect(enviadoAhora.checksumSha256).toBe(enviadoPersistido.checksumSha256);
    expect(enviadoAhora.tamanoBytes).toBe(enviadoPersistido.tamanoBytes);
    expect(enviadoAhora.estadoDocumento).toBe('DISPONIBLE');
    expect(documentoEnviado.checksumSha256).toBe(enviadoPersistido.checksumSha256);
    expect(
      await db.documentoRevisionCierre.count({ where: { idDocumentoCierre: enviado.documentId } }),
    ).toBe(1);
  });

  it('T29-A: el contenido protegido exige ticket vigente y el mismo usuario autenticado, y nunca redirige al origen', async () => {
    const f = await closureDraftFixture(db, scope);
    const { service, tickets, storage } = closureDocumentsStack(db);
    scope.documentIds = [];
    const pdf = await pdfFixture();

    const grant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'evidencia protegida.pdf',
    });
    scope.documentIds.push(grant.documentId);
    const documento = await service.uploadAndAttach(
      f.project.idProyecto,
      f.leader.idUsuario,
      grant.ticket,
      pdf,
    );
    expect(documento.estadoDocumento).toBe('DISPONIBLE');

    // El permiso de lectura es una URL DEL BACKEND que caduca a los 300 s.
    const antes = Date.now();
    const lectura = await service.getReadUrl(
      f.project.idProyecto,
      grant.documentId,
      f.leader.idUsuario,
    );
    const ttl = (lectura.expiraEn.getTime() - antes) / 1000;
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
    expect(lectura.url.startsWith(`/proyectos/${f.project.idProyecto}/cierre/documentos/`)).toBe(true);
    expect(lectura.url).toContain('/contenido?ticket=');
    // Ni una URL del proveedor, ni una firma, ni un secreto.
    for (const prohibido of ['cloudinary', 'res.cloudinary.com', 'http://', 'https://', 'signature', 'api_key']) {
      expect(lectura.url).not.toContain(prohibido);
    }
    const ticketLectura = decodeURIComponent(lectura.url.split('ticket=')[1]);

    // Único caso autorizado: mismo usuario, ticket vigente.
    const contenido = await service.readContent(
      f.project.idProyecto,
      grant.documentId,
      f.leader.idUsuario,
      ticketLectura,
    );
    // Bytes descifrados y VERIFICADOS contra la huella registrada.
    expect(contenido.bytes.equals(pdf)).toBe(true);
    expect(contenido.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(contenido.nombreArchivo).toBe('evidencia protegida.pdf');
    // Lo que viajó del proveedor era ciphertext, no el PDF.
    const leidoDelProveedor = await storage.readCiphertext.mock.results.at(-1)!.value;
    expect((leidoDelProveedor as Buffer).equals(pdf)).toBe(false);

    // Otro usuario autenticado con el ticket del líder: sin bytes.
    await expectStatus(401, () =>
      service.readContent(f.project.idProyecto, grant.documentId, f.otro.idUsuario, ticketLectura),
    );
    // Un usuario cualquiera con SU propio ticket tampoco: los permisos
    // actuales se consultan además del ticket.
    const suTicket = tickets.sign({
      purpose: 'read',
      documentId: grant.documentId,
      projectId: f.project.idProyecto,
      revisionId: f.revision.idRevisionCierre,
      actorId: f.otro.idUsuario,
      checksum: documento.checksumSha256 ?? '',
    });
    await expectStatus(403, () =>
      service.readContent(f.project.idProyecto, grant.documentId, f.otro.idUsuario, suTicket.ticket),
    );

    // Ticket expirado, manipulado y de otro propósito: nada de bytes.
    const expirado = tickets.sign(
      {
        purpose: 'read',
        documentId: grant.documentId,
        projectId: f.project.idProyecto,
        revisionId: f.revision.idRevisionCierre,
        actorId: f.leader.idUsuario,
        checksum: documento.checksumSha256 ?? '',
      },
      -1,
    );
    const manipulado = `${ticketLectura.slice(0, -2)}${ticketLectura.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
    const deSubida = tickets.sign({
      purpose: 'upload',
      documentId: grant.documentId,
      projectId: f.project.idProyecto,
      revisionId: f.revision.idRevisionCierre,
      actorId: f.leader.idUsuario,
    });
    for (const [caso, valor] of [
      ['expirado', expirado.ticket],
      ['manipulado', manipulado],
      ['de propósito upload', deSubida.ticket],
    ] as const) {
      const respuesta = await expectStatus(401, () =>
        service.readContent(f.project.idProyecto, grant.documentId, f.leader.idUsuario, valor),
      );
      expect(JSON.stringify(respuesta), caso).not.toContain('%PDF');
    }

    // Un ticket de OTRO documento tampoco sirve para este.
    const otroGrant = await service.reserve(f.project.idProyecto, f.leader.idUsuario, {
      revisionId: f.revision.idRevisionCierre,
      nombreArchivo: 'otro.pdf',
    });
    scope.documentIds.push(otroGrant.documentId);
    const ticketDeOtro = tickets.sign({
      purpose: 'read',
      documentId: otroGrant.documentId,
      projectId: f.project.idProyecto,
      revisionId: f.revision.idRevisionCierre,
      actorId: f.leader.idUsuario,
      checksum: '',
    });
    await expectStatus(401, () =>
      service.readContent(
        f.project.idProyecto,
        grant.documentId,
        f.leader.idUsuario,
        ticketDeOtro.ticket,
      ),
    );

    // Un documento que no está DISPONIBLE no se lee.
    await expectStatus(409, () =>
      service.getReadUrl(f.project.idProyecto, otroGrant.documentId, f.leader.idUsuario),
    );

    // La respuesta del servicio son BYTES, no una redirección ni una URL.
    expect(Buffer.isBuffer(contenido.bytes)).toBe(true);
    expect(JSON.stringify(Object.keys(contenido))).not.toContain('url');
    expect(JSON.stringify(Object.keys(contenido))).not.toContain('location');
  });
});
