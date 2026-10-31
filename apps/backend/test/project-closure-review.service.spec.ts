import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectClosureReviewService } from '../src/project-closure/project-closure-review.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { INSIGNIAS_EVENTO } from '../src/insignias/insignias.catalog';

const D = (v: string | number) => new Prisma.Decimal(v);

const uploaded = {
  identidad: { publicId: 'pub', proveedor: 'cloudinary', resourceType: 'raw', deliveryType: 'authenticated', assetId: 'a1', version: '3' },
  tamanoBytes: 100,
  tamanoCifradoBytes: 120,
  checksumSha256: 'sha',
  checksumCifradoSha256: 'shac',
  metadata: { iv: 'x' },
};

const capture = {
  fingerprintEjecucion: 'fe',
  fingerprintModelo: 'fm',
  contexto: { a: 1 },
  targetHours: [{ idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: '2.50' }],
};

function okDocument() {
  return {
    idAutor: 5, externalId: 'pub', proveedor: 'cloudinary', resourceType: 'raw', deliveryType: 'authenticated',
    assetId: 'a1', versionRemota: '3', tamanoBytes: BigInt(100), tamanoCifradoBytes: BigInt(120),
    checksumSha256: 'sha', checksumCifradoSha256: 'shac', cryptoMetadata: { iv: 'x' },
    fingerprintEjecucion: 'fe', fingerprintModelo: 'fm', contextoReporte: { a: 1 },
  };
}

function setup() {
  const tx = {
    revisionCierreProyecto: {
      findFirst: vi.fn().mockResolvedValue({ idRevisionCierre: 9, estadoRevision: 'ENVIADA', fingerprintEntrega: 'fp', numeroRevision: 2, numeroRevision_: 0, documentos: [{ idDocumentoCierre: 1, orden: 1 }, { idDocumentoCierre: 2, orden: 2 }] }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      aggregate: vi.fn().mockResolvedValue({ _max: { numeroRevision: 2 } }),
      create: vi.fn().mockResolvedValue({ idRevisionCierre: 10, numeroRevision: 3 }),
      count: vi.fn().mockResolvedValue(1),
    },
    proyecto: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ tituloProyecto: 'Proyecto X' }),
    },
    documentoCierre: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(okDocument()),
    },
    horasParticipacion: {
      findMany: vi.fn().mockResolvedValue([{ idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: D('2.5'), idSprint: 3 }]),
    },
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue([
        { idParticipacion: 5, idUsuario: 20, estadoParticipacion: 'ACTIVO' },
        { idParticipacion: 6, idUsuario: 21, estadoParticipacion: 'ABANDONADO' },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const effects = { add: vi.fn() };
  let project: unknown = { idProyecto: 1, creadoPor: 77, estadoProyecto: 'EN_SOLICITUD_CIERRE', eliminadoEn: null };
  const opts: unknown[] = [];
  const projectTx = {
    run: vi.fn(async (_p: number, _a: number, _op: string, cb: (c: unknown) => unknown, o?: unknown) => {
      opts.push(o);
      return cb({ tx, project, effects });
    }),
  };
  const policy = { assertWriteTx: vi.fn().mockResolvedValue(undefined) };
  const readiness = { assertReady: vi.fn().mockResolvedValue(undefined) };
  const audit = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const notifications = {
    persistTemplateTx: vi.fn().mockResolvedValue(undefined),
    deferClosureEventsTx: vi.fn().mockResolvedValue(undefined),
    publishEffects: vi.fn(),
  };
  const report = {
    buildOfficialModelTx: vi.fn().mockResolvedValue(capture),
    renderOfficial: vi.fn().mockReturnValue({ pdf: Buffer.from('pdf') }),
  };
  const documents = {
    reserveGeneratedTx: vi.fn().mockResolvedValue({ idDocumentoCierre: 50 }),
    uploadGenerated: vi.fn().mockResolvedValue(uploaded),
  };
  const events = { emit: vi.fn() };
  const svc = new ProjectClosureReviewService(
    {} as never, projectTx as never, policy as never, readiness as never, audit as never,
    notifications as never, report as never, documents as never, events as never,
  );
  return { svc, tx, effects, opts, policy, readiness, audit, notifications, report, documents, events, projectTx, setProject: (p: unknown) => { project = p; } };
}

describe('ProjectClosureReviewService.requestDocumentaryCorrection', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('resuelve la revision, crea borrador heredando vinculos y notifica al lider', async () => {
    const out = await s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: '  falta firma  ' } as never);
    expect(s.policy.assertWriteTx).toHaveBeenCalledWith(s.tx, expect.anything(), 'CIERRE_VEREDICTO', 5);
    expect(s.tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoRevision: 'CORRECCION_DOCUMENTAL', idRevisor: 5, comentarioRevisor: 'falta firma' }),
    }));
    expect(s.tx.revisionCierreProyecto.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numeroRevision: 3 }) });
    expect(s.audit.registrarEvento.mock.calls.map((c) => c[0].tipoEvento)).toEqual([
      TipoEventoBitacora.PROJECT_CLOSE_REVIEW_DOC_CORRECTION, TipoEventoBitacora.CLOSURE_DRAFT_CREATED,
    ]);
    expect(s.notifications.persistTemplateTx).toHaveBeenCalledWith(s.tx, [77], 'CIERRE_CORRECCION_DOCUMENTAL', expect.objectContaining({ projectTitle: 'Proyecto X' }), s.effects);
    expect(out).toMatchObject({ estadoProyecto: 'EN_SOLICITUD_CIERRE', revisionId: 10, numeroRevision: 3, cantidades: { vinculosHeredados: 2 } });
    s.opts[0] && (s.opts[0] as { publish: (e: unknown) => void }).publish('E');
    expect(s.notifications.publishEffects).toHaveBeenCalledWith('E');
  });

  it.each([[undefined], ['   '], ['x'.repeat(5001)]])('comentario invalido (%s) -> 400', async (c) => {
    await expect(s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: c } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.tx.revisionCierreProyecto.updateMany).not.toHaveBeenCalled();
  });

  it('comentario de 5000 caracteres es el limite valido', async () => {
    await expect(s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: 'x'.repeat(5000) } as never)).resolves.toBeDefined();
  });

  it('revision no ENVIADA -> 409; CAS perdido -> 409', async () => {
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValue(null);
    await expect(s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toThrow('ya no está vigente');
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValue({ documentos: [] });
    s.tx.revisionCierreProyecto.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(s.tx.revisionCierreProyecto.create).not.toHaveBeenCalled();
  });

  it('no administrador (lider, integrante, ajeno): la politica lo rechaza', async () => {
    s.policy.assertWriteTx.mockRejectedValue(new ForbiddenException());
    await expect(s.svc.requestDocumentaryCorrection(1, 77, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.tx.revisionCierreProyecto.findFirst).not.toHaveBeenCalled();
  });

  it('proyecto ausente -> 404', async () => {
    s.setProject(null);
    await expect(s.svc.requestDocumentaryCorrection(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectClosureReviewService.returnToExecution', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('devuelve a ejecucion: revision DEVUELTA, proyecto EN_PROGRESO', async () => {
    const out = await s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: 'rehacer' } as never);
    expect(s.tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoRevision: 'DEVUELTA_A_EJECUCION' }),
    }));
    expect(s.tx.proyecto.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estadoProyecto: 'EN_PROGRESO' } }));
    expect(s.audit.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ tipoEvento: TipoEventoBitacora.PROJECT_CLOSE_RETURNED_TO_EXECUTION }));
    expect(out).toMatchObject({ estadoProyecto: 'EN_PROGRESO', revisionId: 9, cantidades: { revisionesDevueltas: 1 } });
  });

  it('modo legacy sin revisiones: no toca revisiones y devuelve numero 0', async () => {
    s.tx.revisionCierreProyecto.count.mockResolvedValue(0);
    const out = await s.svc.returnToExecution(1, 5, { legacy: true, comentario: 'c' } as never);
    expect(s.tx.revisionCierreProyecto.findFirst).not.toHaveBeenCalled();
    expect(out).toMatchObject({ revisionId: null, numeroRevision: 0, fingerprintEntrega: null, cantidades: { revisionesDevueltas: 0 } });
    expect(s.notifications.persistTemplateTx.mock.calls[0][3]).not.toHaveProperty('revisionId');
  });

  it('legacy con revisiones existentes -> 409', async () => {
    await expect(s.svc.returnToExecution(1, 5, { legacy: true, comentario: 'c' } as never)).rejects.toThrow('legacy');
  });

  it('legacy con revisionId se trata como no legacy', async () => {
    await s.svc.returnToExecution(1, 5, { legacy: true, revisionId: 9, comentario: 'c' } as never);
    expect(s.tx.revisionCierreProyecto.findFirst).toHaveBeenCalled();
  });

  it('sin revisionId entero -> 400', async () => {
    await expect(s.svc.returnToExecution(1, 5, { comentario: 'c' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 1.5, comentario: 'c' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revision no vigente, CAS de revision perdido y proyecto en otro estado -> 409', async () => {
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(null);
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(ConflictException);
    s.tx.revisionCierreProyecto.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toThrow('La revisión cambió');
    s.tx.proyecto.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toThrow('El proyecto cambió');
  });

  it('comentario vacio -> 400; politica rechaza -> 403; sin proyecto -> 404', async () => {
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: '' } as never)).rejects.toBeInstanceOf(BadRequestException);
    s.policy.assertWriteTx.mockRejectedValueOnce(new ForbiddenException());
    await expect(s.svc.returnToExecution(1, 99, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    s.setProject(undefined);
    await expect(s.svc.returnToExecution(1, 5, { revisionId: 9, comentario: 'c' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectClosureReviewService.approveClosure', () => {
  let s: ReturnType<typeof setup>;
  const dto = { revisionId: 9, expectedFingerprint: 'fp', comentario: '  bien  ' } as never;
  beforeEach(() => { s = setup(); });

  it('camino feliz: acredita horas, completa participaciones, cierra y emite insignias', async () => {
    const out = await s.svc.approveClosure(1, 5, dto);
    expect(s.projectTx.run.mock.calls.map((c) => c[2])).toEqual(['closure.approve.capture', 'closure.approve.record-upload', 'closure.approve.finalize']);
    expect(s.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(s.tx.participacionProyecto.updateMany).toHaveBeenCalledWith({ where: { idParticipacion: { in: [5] }, estadoParticipacion: 'ACTIVO' }, data: { estadoParticipacion: 'COMPLETADO' } });
    expect(s.tx.proyecto.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estadoProyecto: 'CERRADO' } }));
    expect(s.tx.revisionCierreProyecto.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estadoRevision: 'APROBADA', comentarioRevisor: 'bien', idDocumentoOficial: 50 }),
    }));
    expect(s.audit.registrarEvento.mock.calls.map((c) => c[0].tipoEvento)).toEqual([
      TipoEventoBitacora.PROJECT_CLOSE_REVIEW_APPROVED, TipoEventoBitacora.PROJECT_HOURS_CREDITED,
    ]);
    // notificaciones: historicos (lider + todos los integrantes) y horas por usuario con Decimal
    const calls = s.notifications.persistTemplateTx.mock.calls;
    expect(calls[0][1]).toEqual([77, 20, 21]);
    const horas = calls.filter((c) => c[2] === 'HORAS_ACREDITADAS');
    expect(horas.map((c) => [c[1], c[3].horasAcreditadas])).toEqual([[[20], '2.50'], [[21], '0.00']]);
    expect(out).toMatchObject({ estadoProyecto: 'CERRADO', informeOficialId: 50, cantidades: { horasAcreditadas: 1, participacionesCompletadas: 1 } });
    expect(s.events.emit).toHaveBeenCalledWith(INSIGNIAS_EVENTO, { claves: ['horas', 'cerrados', 'liderados'], idProyecto: 1 });
  });

  it('sin horas pendientes ni participantes activos: no ejecuta SQL de acreditacion', async () => {
    s.report.buildOfficialModelTx.mockResolvedValue({ ...capture, targetHours: [] });
    s.tx.horasParticipacion.findMany.mockResolvedValue([]);
    s.tx.participacionProyecto.findMany.mockResolvedValue([{ idParticipacion: 6, idUsuario: 21, estadoParticipacion: 'ABANDONADO' }]);
    const out = await s.svc.approveClosure(1, 5, dto);
    expect(s.tx.$executeRaw).not.toHaveBeenCalled();
    expect(s.tx.participacionProyecto.updateMany).not.toHaveBeenCalled();
    expect(out.cantidades).toEqual({ horasAcreditadas: 0, participacionesCompletadas: 0 });
  });

  it('funciona sin EventEmitter2 y con comentario ausente', async () => {
    const x = new ProjectClosureReviewService({} as never, s.projectTx as never, s.policy as never, s.readiness as never, s.audit as never, s.notifications as never, s.report as never, s.documents as never);
    await expect(x.approveClosure(1, 5, { revisionId: 9, expectedFingerprint: 'fp' } as never)).resolves.toMatchObject({ estadoProyecto: 'CERRADO' });
    expect(s.tx.revisionCierreProyecto.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ comentarioRevisor: null }) }));
  });

  it('permiso denegado: no genera informe ni sube nada', async () => {
    s.policy.assertWriteTx.mockRejectedValue(new ForbiddenException());
    await expect(s.svc.approveClosure(1, 77, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.report.renderOfficial).not.toHaveBeenCalled();
    expect(s.documents.uploadGenerated).not.toHaveBeenCalled();
  });

  it('fase 1: sin proyecto 404, revision inexistente 404, no enviada 409, fingerprint distinto 409', async () => {
    s.setProject(null);
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(NotFoundException);
    s.setProject({ idProyecto: 1, creadoPor: 77 });
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(null);
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(NotFoundException);
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({ estadoRevision: 'APROBADA', fingerprintEntrega: 'fp' });
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('no está enviada');
    s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce({ estadoRevision: 'ENVIADA', fingerprintEntrega: 'otro' });
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('La entrega cambió');
  });

  it('readiness incompleto aborta antes de reservar documento', async () => {
    s.readiness.assertReady.mockRejectedValue(new ConflictException('no listo'));
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('no listo');
    expect(s.documents.reserveGeneratedTx).not.toHaveBeenCalled();
  });

  it('fallo al renderizar: HttpException se propaga, otro error -> 503', async () => {
    s.report.renderOfficial.mockImplementationOnce(() => { throw new BadRequestException('mal'); });
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(BadRequestException);
    s.report.renderOfficial.mockImplementationOnce(() => { throw new Error('pdf'); });
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fallo de almacenamiento: otro error -> 503 y no se finaliza', async () => {
    s.documents.uploadGenerated.mockRejectedValue(new Error('cdn'));
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.projectTx.run).toHaveBeenCalledTimes(1);
    s.documents.uploadGenerated.mockRejectedValue(new ConflictException('dup'));
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserva oficial cambiada al registrar la subida -> 409', async () => {
    s.tx.documentoCierre.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('La reserva oficial cambió');
  });

  describe('fase 3 (finalize) detecta cambios concurrentes', () => {
    // La fase 1 consume el primer findFirst; la fase 3 el segundo.
    const finalizeRevision = (v: unknown) => {
      const base = { idRevisionCierre: 9, estadoRevision: 'ENVIADA', fingerprintEntrega: 'fp', numeroRevision: 2 };
      s.tx.revisionCierreProyecto.findFirst.mockResolvedValueOnce(base).mockResolvedValueOnce(v);
    };

    it('revision ya no enviada / fingerprint distinto / nula', async () => {
      finalizeRevision(null);
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('cambiaron');
      finalizeRevision({ idRevisionCierre: 9, estadoRevision: 'DEVUELTA_A_EJECUCION', fingerprintEntrega: 'fp' });
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('cambiaron');
      finalizeRevision({ idRevisionCierre: 9, estadoRevision: 'ENVIADA', fingerprintEntrega: 'otro' });
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('cambiaron');
    });

    it('sin proyecto en la fase 3 -> 404', async () => {
      s.projectTx.run
        .mockImplementationOnce(async (_p, _a, _o, cb) => cb({ tx: s.tx, project: { idProyecto: 1, creadoPor: 77 }, effects: s.effects }))
        .mockImplementationOnce(async (_p, _a, _o, cb) => cb({ tx: s.tx, project: {}, effects: s.effects }))
        .mockImplementationOnce(async (_p, _a, _o, cb) => cb({ tx: s.tx, project: null, effects: s.effects }));
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['fingerprint de ejecucion', { ...capture, fingerprintEjecucion: 'zz' }],
      ['fingerprint de modelo', { ...capture, fingerprintModelo: 'zz' }],
      ['contexto', { ...capture, contexto: { a: 2 } }],
    ])('contexto oficial cambiado (%s) -> 409', async (_n, rebuilt) => {
      s.report.buildOfficialModelTx.mockResolvedValueOnce(capture).mockResolvedValueOnce(rebuilt);
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('contexto oficial');
    });

    it.each([
      ['horas con valor nulo', [{ idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: null, idSprint: 3 }]],
      ['horas sin sprint', [{ idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: D('2.5'), idSprint: null }]],
      ['importe distinto (Decimal)', [{ idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: D('2.51'), idSprint: 3 }]],
      ['registro nuevo', [
        { idRegistroHoras: 1, idParticipacion: 5, horasCalculadas: D('2.5'), idSprint: 3 },
        { idRegistroHoras: 2, idParticipacion: 5, horasCalculadas: D('1'), idSprint: 3 },
      ]],
    ])('horas objetivo cambiadas (%s) -> 409', async (_n, rows) => {
      s.tx.horasParticipacion.findMany.mockResolvedValue(rows);
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('horas objetivo');
    });

    it.each([
      ['documento ausente', null],
      ['autor distinto', { ...okDocument(), idAutor: 99 }],
      ['externalId distinto', { ...okDocument(), externalId: 'otro' }],
      ['tamano distinto', { ...okDocument(), tamanoBytes: BigInt(1) }],
      ['checksum distinto', { ...okDocument(), checksumSha256: 'x' }],
      ['cripto distinta', { ...okDocument(), cryptoMetadata: { iv: 'y' } }],
      ['contexto del reporte distinto', { ...okDocument(), contextoReporte: { a: 9 } }],
    ])('resultado del proveedor no corresponde (%s) -> 409', async (_n, doc) => {
      s.tx.documentoCierre.findFirst.mockResolvedValue(doc);
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('proveedor');
    });

    it('acreditacion con conteo distinto -> 409', async () => {
      s.tx.$executeRaw.mockResolvedValue(0);
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('acreditación');
    });

    it('compleccion con conteo distinto -> 409', async () => {
      s.tx.participacionProyecto.updateMany.mockResolvedValue({ count: 0 });
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('compleción');
    });

    it.each(['documentoCierre', 'revisionCierreProyecto', 'proyecto'] as const)('finalizacion atomica falla si %s no afecta 1 fila', async (tabla) => {
      // Las llamadas previas de updateMany devuelven count 1; solo falla la ultima de la tabla.
      const mock = s.tx[tabla].updateMany;
      const base = mock.getMockImplementation();
      mock.mockImplementation(async (args: { data?: { estadoDocumento?: string; estadoRevision?: string; estadoProyecto?: string } }) => {
        const d = args?.data ?? {};
        const falla = (tabla === 'documentoCierre' && d.estadoDocumento === 'DISPONIBLE')
          || (tabla === 'revisionCierreProyecto' && d.estadoRevision === 'APROBADA')
          || (tabla === 'proyecto' && d.estadoProyecto === 'CERRADO');
        return { count: falla ? 0 : 1 };
      });
      void base;
      await expect(s.svc.approveClosure(1, 5, dto)).rejects.toThrow('finalización atómica');
      expect(s.audit.registrarEvento).not.toHaveBeenCalled();
    });
  });
});
