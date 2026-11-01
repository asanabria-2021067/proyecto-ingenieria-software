import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorasSemestreService } from '../src/horas-semestre/horas-semestre.service';
import { buildHorasCsv, renderHorasPdf } from '../src/exports/horas-central-report.builder';

type Aprobada = { idUsuario: number; tipo: string; horas: number; fecha?: Date };

function crearServicio(opts: {
  usuarios: Array<{ id: number; registro?: Partial<Record<string, number | null>> }>;
  aprobadas?: Aprobada[];
}) {
  const aprobadas = opts.aprobadas ?? [];
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) => (where.idUsuario === 1 ? { id: 1 } : null)) },
    usuario: {
      findMany: vi.fn(async ({ where, take }: { where: { idUsuario: { gt: number } }; take: number }) =>
        opts.usuarios
          .filter((u) => u.id > where.idUsuario.gt)
          .slice(0, take)
          .map((u) => ({
            idUsuario: u.id,
            nombre: `N${u.id}`,
            apellido: `A${u.id}`,
            perfil: { carne: `c${u.id}`, idCarrera: 1, carrera: { nombreCarrera: 'Computacion' } },
            registrosHorasSemestre: u.registro ? [u.registro] : [],
          })),
      ),
    },
    horasParticipacion: {
      findMany: vi.fn(async ({ where }: { where: { participacion: { idUsuario: number | { in: number[] } } } }) => {
        const filtro = where.participacion.idUsuario;
        return aprobadas
          .filter((a) => (typeof filtro === 'number' ? a.idUsuario === filtro : filtro.in.includes(a.idUsuario)))
          .map((a) => ({
            horasAprobadas: a.horas,
            fechaAprobacion: a.fecha ?? new Date(),
            participacion: {
              idUsuario: a.idUsuario,
              rolProyecto: { proyecto: { tipoProyecto: a.tipo } },
            },
          }));
      }),
    },
    registroHorasSemestre: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  };
  return { service: new HorasSemestreService(prisma as never), prisma };
}

describe('HorasSemestreService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('listarCentral pagina con cursor y calcula falta con declaradas + acreditadas', async () => {
    const { service } = crearServicio({
      usuarios: [
        { id: 1, registro: { metaBeca: 100, becaDeclarada: 10, metaExtension: null, extensionDeclarada: 0 } },
        { id: 2 },
        { id: 3 },
      ],
      aprobadas: [{ idUsuario: 1, tipo: 'ACADEMICO_HORAS_BECA', horas: 20 }],
    });
    const p1 = await service.listarCentral(1, { limit: 2 });
    expect(p1.filas.map((f) => f.idUsuario)).toEqual([1, 2]);
    expect(p1.siguienteCursor).toBe(2);
    expect(p1.filas[0]).toMatchObject({ becaDeclarada: 10, becaAcreditada: 20, faltaBeca: 70, faltaExtension: null });
    const p2 = await service.listarCentral(1, { limit: 2, cursor: p1.siguienteCursor! });
    expect(p2.filas.map((f) => f.idUsuario)).toEqual([3]);
    expect(p2.siguienteCursor).toBeNull();
  });

  it('el filtro enRiesgo salta a los que no lo estan y mantiene el cursor', async () => {
    // 1-abr: 50 % del semestre; en riesgo si avance < 30 %
    const { service } = crearServicio({
      usuarios: [
        { id: 1, registro: { metaBeca: 100, becaDeclarada: 80 } },
        { id: 2, registro: { metaBeca: 100, becaDeclarada: 10 } },
        { id: 3, registro: { metaBeca: 100, becaDeclarada: 90 } },
        { id: 4, registro: { metaBeca: 100, becaDeclarada: 5 } },
        { id: 5 },
      ],
    });
    const p1 = await service.listarCentral(1, { enRiesgo: true, limit: 1 });
    expect(p1.filas.map((f) => f.idUsuario)).toEqual([2]);
    expect(p1.siguienteCursor).toBe(2);
    const p2 = await service.listarCentral(1, { enRiesgo: true, limit: 1, cursor: 2 });
    expect(p2.filas.map((f) => f.idUsuario)).toEqual([4]);
    expect(p2.siguienteCursor).toBeNull();
  });

  it('solo cuenta horas aprobadas dentro del semestre consultado', async () => {
    const { service, prisma } = crearServicio({ usuarios: [{ id: 1 }] });
    await service.listarCentral(1, { anio: 2025, periodo: 2 });
    const where = prisma.horasParticipacion.findMany.mock.calls[0][0].where as unknown as {
      fechaAprobacion: { gte: Date; lt: Date };
    };
    expect(where.fechaAprobacion.gte.toISOString()).toBe('2025-07-01T06:00:00.000Z');
    expect(where.fechaAprobacion.lt.toISOString()).toBe('2026-01-01T06:00:00.000Z');
  });

  it('rechaza a quien no es administrador', async () => {
    const { service } = crearServicio({ usuarios: [{ id: 1 }] });
    await expect(service.listarCentral(2, {})).rejects.toThrow('administradores');
    await expect(service.totales(2, {})).rejects.toThrow('administradores');
    await expect(service.todasLasFilas(2, {})).rejects.toThrow('administradores');
  });

  it('totales agrupa por carrera', async () => {
    const { service } = crearServicio({
      usuarios: [
        { id: 1, registro: { metaBeca: 100, becaDeclarada: 10 } },
        { id: 2, registro: { metaBeca: 50, becaDeclarada: 5 } },
      ],
    });
    const { porCarrera } = await service.totales(1, {});
    expect(porCarrera).toHaveLength(1);
    expect(porCarrera[0]).toMatchObject({ estudiantes: 2, metaBeca: 150, becaDeclarada: 15, faltaBeca: 135 });
  });

  it('getProgreso separa declaradas de acreditadas y proyecta la fecha', async () => {
    const { service, prisma } = crearServicio({
      usuarios: [],
      aprobadas: [{ idUsuario: 7, tipo: 'EXTRACURRICULAR_EXTENSION', horas: 5 }],
    });
    prisma.registroHorasSemestre.findUnique.mockResolvedValue({
      metaBeca: 40,
      becaDeclarada: 10,
      metaExtension: 20,
      extensionDeclarada: 5,
    } as never);
    const r = await service.getProgreso(7);
    expect(r.beca).toMatchObject({ declaradas: 10, acreditadas: 0, avance: 10, falta: 30 });
    expect(r.extension).toMatchObject({ declaradas: 5, acreditadas: 5, avance: 10, falta: 10 });
    expect(r.beca.fechaProyectada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getHistorial agrupa por semestre, mas reciente primero', async () => {
    const { service, prisma } = crearServicio({
      usuarios: [],
      aprobadas: [
        { idUsuario: 7, tipo: 'ACADEMICO_HORAS_BECA', horas: 8, fecha: new Date('2025-09-10T12:00:00Z') },
        { idUsuario: 7, tipo: 'ACADEMICO_HORAS_BECA', horas: 2, fecha: new Date('2026-02-10T12:00:00Z') },
      ],
    });
    prisma.registroHorasSemestre.findMany.mockResolvedValue([
      { anio: 2025, periodo: 2, metaBeca: 30, becaDeclarada: 4, metaExtension: null, extensionDeclarada: 0 },
    ] as never);
    const h = await service.getHistorial(7);
    expect(h.map((x) => `${x.semestre.anio}-${x.semestre.periodo}`)).toEqual(['2026-1', '2025-2']);
    expect(h[1]).toMatchObject({ metaBeca: 30, becaDeclarada: 4, becaAcreditada: 8 });
  });

  it('getActual pide registro cuando no hay uno del semestre', async () => {
    const { service } = crearServicio({ usuarios: [] });
    expect((await service.getActual(1)).necesitaRegistro).toBe(true);
  });
});

describe('reportes de horas', () => {
  const fila = {
    nombre: '=Ana',
    apellido: 'Perez',
    carne: '123',
    carrera: 'Computacion',
    metaBeca: 100,
    becaDeclarada: 10,
    becaAcreditada: 20,
    faltaBeca: 70,
    metaExtension: null,
    extensionDeclarada: 0,
    extensionAcreditada: 0,
    faltaExtension: null,
    enRiesgo: true,
  };

  it('CSV con cabecera, celdas vacias para metas nulas y formulas neutralizadas', () => {
    const lineas = buildHorasCsv([fila]).split('\r\n');
    expect(lineas[0]).toContain('Falta beca');
    expect(lineas[1]).toBe("'=Ana Perez;123;Computacion;100;10;20;70;;0;0;;Sí");
  });

  it('PDF genera un documento valido', () => {
    expect(renderHorasPdf('Titulo', [fila]).subarray(0, 4).toString()).toBe('%PDF');
  });
});
