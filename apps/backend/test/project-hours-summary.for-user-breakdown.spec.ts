import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProjectHoursSummaryService } from '../src/sprints/project-hours-summary.service';

/**
 * HU-158 (T-231): lecturas de horas de UN usuario sobre un mundo en memoria.
 *
 * El doble de Prisma aplica los filtros que la base aplicaría (usuario,
 * proyecto abierto o eliminado, tramos revocados, estado de las horas) y
 * lanza ante cualquier filtro que no conozca: si el servicio cambia una
 * consulta, la prueba lo detecta en vez de ignorar el filtro en silencio.
 * Las cifras esperadas son literales calculados a mano, nunca con el mismo
 * algoritmo que se prueba.
 */

// ─── Mundo ────────────────────────────────────────────────────────────────

type Tipo = 'ACADEMICO_HORAS_BECA' | 'EXTRACURRICULAR_EXTENSION' | 'ACADEMICO_EXPERIENCIA';
type EstadoProyecto =
  | 'BORRADOR'
  | 'PUBLICADO'
  | 'EN_PROGRESO'
  | 'EN_SOLICITUD_CIERRE'
  | 'CERRADO'
  | 'CANCELADO';

interface ProyectoFx {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: Tipo;
  estadoProyecto: EstadoProyecto;
  creadoPor: number;
  eliminado?: boolean;
}
interface SprintFx {
  idSprint: number;
  idProyecto: number;
  numero: number;
  estado: 'ACTIVO' | 'EN_FINALIZACION' | 'CERRADO';
}
interface TareaFx {
  idTarea: number;
  idProyecto: number;
  idSprint: number | null;
  tituloTarea: string;
  estadoTarea: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';
  eliminada?: boolean;
}
interface TramoFx {
  idAsignacion: number;
  idTarea: number;
  idUsuario: number;
  origenReporte: 'GRANULAR' | 'LEGACY' | 'POR_CONCILIAR';
  horasReales: string | null;
  registros: Array<{ horas: string; revocado?: boolean }>;
}
interface ParticipacionFx {
  idParticipacion: number;
  idUsuario: number;
  idProyecto: number;
  estadoParticipacion: 'ACTIVO' | 'RETIRADO' | 'COMPLETADO';
}
interface HorasFx {
  idHorasParticipacion: number;
  idParticipacion: number;
  estadoHoras: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  horasCalculadas: string | null;
  horasAprobadas: string | null;
}
interface PerfilFx {
  idUsuario: number;
  horasBecaRequeridas: number | null;
  horasExtensionRequeridas: number | null;
}

interface Mundo {
  proyectos: ProyectoFx[];
  sprints: SprintFx[];
  tareas: TareaFx[];
  tramos: TramoFx[];
  participaciones: ParticipacionFx[];
  horas: HorasFx[];
  perfiles: PerfilFx[];
}

const ELIMINADO_EN = new Date('2026-08-01T00:00:00Z');
const dec = (valor: string | null): Prisma.Decimal | null => (valor === null ? null : new Prisma.Decimal(valor));

// ─── Doble estricto de Prisma ─────────────────────────────────────────────

type Where = Record<string, unknown>;

function soloClaves(objeto: unknown, permitidas: string[], donde: string): Where {
  const where = (objeto ?? {}) as Where;
  for (const clave of Object.keys(where)) {
    if (!permitidas.includes(clave)) throw new Error(`Filtro no soportado por el doble: ${donde}.${clave}`);
  }
  return where;
}

/** `proyecto` de un `where`: solo `eliminadoEn: null` y `estadoProyecto: { in }`. */
function cumpleProyecto(proyecto: ProyectoFx, filtro: unknown, donde: string): boolean {
  const where = soloClaves(filtro, ['eliminadoEn', 'estadoProyecto'], donde);
  if ('eliminadoEn' in where) {
    if (where.eliminadoEn !== null) throw new Error(`${donde}.eliminadoEn solo admite null`);
    if (proyecto.eliminado) return false;
  }
  if ('estadoProyecto' in where) {
    const estado = soloClaves(where.estadoProyecto, ['in'], `${donde}.estadoProyecto`);
    if (!(estado.in as string[]).includes(proyecto.estadoProyecto)) return false;
  }
  return true;
}

interface Llamada {
  modelo: string;
  args: Record<string, unknown>;
}

function prismaDe(mundo: Mundo) {
  const llamadas: Llamada[] = [];
  const proyecto = (id: number) => mundo.proyectos.find((p) => p.idProyecto === id)!;
  const tarea = (id: number) => mundo.tareas.find((t) => t.idTarea === id)!;
  const sprint = (id: number | null) => (id === null ? null : mundo.sprints.find((s) => s.idSprint === id)!);
  const participacion = (id: number) => mundo.participaciones.find((p) => p.idParticipacion === id)!;

  const proyectoFila = (p: ProyectoFx) => ({
    idProyecto: p.idProyecto,
    tituloProyecto: p.tituloProyecto,
    tipoProyecto: p.tipoProyecto,
    estadoProyecto: p.estadoProyecto,
    creadoPor: p.creadoPor,
    eliminadoEn: p.eliminado ? ELIMINADO_EN : null,
  });

  const prisma = {
    asignacionTarea: {
      findMany: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: 'asignacionTarea.findMany', args });
        const where = soloClaves(args.where, ['idUsuario', 'tarea'], 'asignacionTarea');
        const filtroTarea = soloClaves(where.tarea, ['proyecto'], 'asignacionTarea.tarea');
        const select = (args.select ?? {}) as Record<string, { where?: Where } | boolean>;
        const registrosSelect = select.registrosTiempo as { where?: Where } | undefined;
        const filtroRegistros = soloClaves(registrosSelect?.where, ['revocadoEn'], 'registrosTiempo');
        if ('revocadoEn' in filtroRegistros && filtroRegistros.revocadoEn !== null) {
          throw new Error('registrosTiempo.revocadoEn solo admite null');
        }
        return mundo.tramos
          .filter((t) => where.idUsuario === undefined || t.idUsuario === where.idUsuario)
          .filter((t) =>
            filtroTarea.proyecto === undefined
              ? true
              : cumpleProyecto(proyecto(tarea(t.idTarea).idProyecto), filtroTarea.proyecto, 'asignacionTarea.tarea.proyecto'),
          )
          .map((t) => {
            const ta = tarea(t.idTarea);
            const sp = sprint(ta.idSprint);
            return {
              idAsignacion: t.idAsignacion,
              idTarea: t.idTarea,
              idUsuario: t.idUsuario,
              origenReporte: t.origenReporte,
              horasReales: dec(t.horasReales),
              registrosTiempo: t.registros
                .filter((r) => !('revocadoEn' in filtroRegistros) || !r.revocado)
                .map((r) => ({ horas: new Prisma.Decimal(r.horas) })),
              tarea: {
                idTarea: ta.idTarea,
                idProyecto: ta.idProyecto,
                tituloTarea: ta.tituloTarea,
                estadoTarea: ta.estadoTarea,
                eliminadoEn: ta.eliminada ? ELIMINADO_EN : null,
                sprint: sp ? { idSprint: sp.idSprint, numero: sp.numero, estado: sp.estado } : null,
                proyecto: proyectoFila(proyecto(ta.idProyecto)),
              },
            };
          });
      },
    },
    horasParticipacion: {
      findMany: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: 'horasParticipacion.findMany', args });
        const where = soloClaves(args.where, ['participacion', 'estadoHoras'], 'horasParticipacion');
        const filtroParticipacion = soloClaves(where.participacion, ['idUsuario'], 'horasParticipacion.participacion');
        return mundo.horas
          .filter((h) => filtroParticipacion.idUsuario === undefined || participacion(h.idParticipacion).idUsuario === filtroParticipacion.idUsuario)
          .filter((h) => where.estadoHoras === undefined || h.estadoHoras === where.estadoHoras)
          .map((h) => {
            const pa = participacion(h.idParticipacion);
            return {
              idParticipacion: h.idParticipacion,
              estadoHoras: h.estadoHoras,
              horasCalculadas: dec(h.horasCalculadas),
              horasAprobadas: dec(h.horasAprobadas),
              participacion: {
                idUsuario: pa.idUsuario,
                rolProyecto: { proyecto: proyectoFila(proyecto(pa.idProyecto)) },
              },
            };
          });
      },
    },
    participacionProyecto: {
      findMany: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: 'participacionProyecto.findMany', args });
        const where = soloClaves(args.where, ['idUsuario', 'estadoParticipacion'], 'participacionProyecto');
        return mundo.participaciones
          .filter((p) => where.idUsuario === undefined || p.idUsuario === where.idUsuario)
          .filter((p) => where.estadoParticipacion === undefined || p.estadoParticipacion === where.estadoParticipacion)
          .map((p) => ({ rolProyecto: { idProyecto: p.idProyecto } }));
      },
    },
    perfilEstudiante: {
      findUnique: async (args: Record<string, unknown>) => {
        llamadas.push({ modelo: 'perfilEstudiante.findUnique', args });
        const where = soloClaves(args.where, ['idUsuario'], 'perfilEstudiante');
        const perfil = mundo.perfiles.find((p) => p.idUsuario === where.idUsuario);
        return perfil
          ? { horasBecaRequeridas: perfil.horasBecaRequeridas, horasExtensionRequeridas: perfil.horasExtensionRequeridas }
          : null;
      },
    },
  };
  return { prisma: prisma as unknown as PrismaService, llamadas };
}

// ─── Mundo compartido ─────────────────────────────────────────────────────

const ESTUDIANTE = 10;
const OTRO = 20;
const LIDER_AJENO = 30;

/**
 * Proyectos del ESTUDIANTE:
 *  1 Tutorías       beca       EN_PROGRESO          activo   granular 5.50 (+5.00 revocadas) y legacy 2.00
 *  2 Huerto         extensión  PUBLICADO            activo   POR_CONCILIAR: 1.25 registradas, sin legacy
 *  3 Archivo        beca       CERRADO              completo 6.00 registradas; 6.00 acreditadas
 *  4 Borrado        extensión  EN_PROGRESO eliminado          3.00 registradas; 1.50 acreditadas
 *  5 Radio          extensión  EN_SOLICITUD_CIERRE  retirado 0.75 registradas
 * Además: OTRO registra 9.00 en Tutorías y tiene 10.00 acreditadas; Tutorías
 * tiene una propuesta PENDIENTE de 4.00 y una RECHAZADA de 3.00 del ESTUDIANTE.
 */
function mundoBase(): Mundo {
  return {
    proyectos: [
      { idProyecto: 1, tituloProyecto: 'Tutorías', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_PROGRESO', creadoPor: LIDER_AJENO },
      { idProyecto: 2, tituloProyecto: 'Huerto', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'PUBLICADO', creadoPor: LIDER_AJENO },
      { idProyecto: 3, tituloProyecto: 'Archivo', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'CERRADO', creadoPor: LIDER_AJENO },
      { idProyecto: 4, tituloProyecto: 'Borrado', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'EN_PROGRESO', creadoPor: LIDER_AJENO, eliminado: true },
      { idProyecto: 5, tituloProyecto: 'Radio', tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'EN_SOLICITUD_CIERRE', creadoPor: LIDER_AJENO },
    ],
    sprints: [
      { idSprint: 11, idProyecto: 1, numero: 1, estado: 'CERRADO' },
      { idSprint: 12, idProyecto: 1, numero: 2, estado: 'ACTIVO' },
      { idSprint: 31, idProyecto: 3, numero: 1, estado: 'CERRADO' },
    ],
    tareas: [
      { idTarea: 101, idProyecto: 1, idSprint: 11, tituloTarea: 'Diseñar sesiones', estadoTarea: 'HECHO' },
      { idTarea: 102, idProyecto: 1, idSprint: 12, tituloTarea: 'Agenda', estadoTarea: 'EN_PROGRESO' },
      { idTarea: 201, idProyecto: 2, idSprint: null, tituloTarea: 'Riego', estadoTarea: 'POR_HACER' },
      { idTarea: 301, idProyecto: 3, idSprint: 31, tituloTarea: 'Inventario', estadoTarea: 'HECHO' },
      { idTarea: 401, idProyecto: 4, idSprint: null, tituloTarea: 'Fantasma', estadoTarea: 'EN_PROGRESO' },
      { idTarea: 501, idProyecto: 5, idSprint: null, tituloTarea: 'Guion', estadoTarea: 'EN_REVISION' },
    ],
    tramos: [
      {
        idAsignacion: 1001, idTarea: 101, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '5.50',
        registros: [{ horas: '3.50' }, { horas: '2.00' }, { horas: '5.00', revocado: true }],
      },
      { idAsignacion: 1002, idTarea: 102, idUsuario: ESTUDIANTE, origenReporte: 'LEGACY', horasReales: '2.00', registros: [] },
      { idAsignacion: 1003, idTarea: 201, idUsuario: ESTUDIANTE, origenReporte: 'POR_CONCILIAR', horasReales: '4.00', registros: [{ horas: '1.25' }] },
      { idAsignacion: 1004, idTarea: 301, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '6.00', registros: [{ horas: '6.00' }] },
      { idAsignacion: 1005, idTarea: 401, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '3.00', registros: [{ horas: '3.00' }] },
      { idAsignacion: 1006, idTarea: 501, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '0.75', registros: [{ horas: '0.75' }] },
      { idAsignacion: 1007, idTarea: 101, idUsuario: OTRO, origenReporte: 'GRANULAR', horasReales: '9.00', registros: [{ horas: '9.00' }] },
    ],
    participaciones: [
      { idParticipacion: 91, idUsuario: ESTUDIANTE, idProyecto: 1, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 92, idUsuario: ESTUDIANTE, idProyecto: 2, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 93, idUsuario: ESTUDIANTE, idProyecto: 3, estadoParticipacion: 'COMPLETADO' },
      { idParticipacion: 94, idUsuario: ESTUDIANTE, idProyecto: 4, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 95, idUsuario: ESTUDIANTE, idProyecto: 5, estadoParticipacion: 'RETIRADO' },
      { idParticipacion: 96, idUsuario: OTRO, idProyecto: 1, estadoParticipacion: 'ACTIVO' },
    ],
    horas: [
      { idHorasParticipacion: 1, idParticipacion: 93, estadoHoras: 'APROBADA', horasCalculadas: '6.00', horasAprobadas: '6.00' },
      { idHorasParticipacion: 2, idParticipacion: 94, estadoHoras: 'APROBADA', horasCalculadas: '1.50', horasAprobadas: '1.50' },
      { idHorasParticipacion: 3, idParticipacion: 91, estadoHoras: 'PENDIENTE', horasCalculadas: '4.00', horasAprobadas: null },
      { idHorasParticipacion: 4, idParticipacion: 91, estadoHoras: 'RECHAZADA', horasCalculadas: '3.00', horasAprobadas: null },
      { idHorasParticipacion: 5, idParticipacion: 96, estadoHoras: 'APROBADA', horasCalculadas: '10.00', horasAprobadas: '10.00' },
    ],
    perfiles: [{ idUsuario: ESTUDIANTE, horasBecaRequeridas: 40, horasExtensionRequeridas: 20 }],
  };
}

const mundoVacio = (): Mundo => ({
  proyectos: [], sprints: [], tareas: [], tramos: [], participaciones: [], horas: [], perfiles: [],
});

// ─── forUserOpenProjects (dashboard): regresión del refactor G02-C01 ─────

describe('ProjectHoursSummaryService.forUserOpenProjects — regresión', () => {
  it('suma registradas y legacy SOLO de proyectos abiertos y no eliminados, y acredita todas las APROBADA', async () => {
    const { prisma } = prismaDe(mundoBase());
    const resultado = await new ProjectHoursSummaryService(prisma).forUserOpenProjects(ESTUDIANTE);

    expect(resultado).toEqual({
      idUsuario: ESTUDIANTE,
      // 5.50 (Tutorías, sin las 5.00 revocadas) + 1.25 (Huerto) + 0.75 (Radio, retirado).
      // Fuera: Archivo (CERRADO), Borrado (eliminado) y las 9.00 de OTRO.
      reportadasGranulares: '7.50',
      // Solo el tramo LEGACY de Tutorías; el POR_CONCILIAR de Huerto no aporta legacy.
      legacy: '2.00',
      // 6.00 (Archivo, cerrado) + 1.50 (Borrado, eliminado): la acreditación no se filtra por proyecto.
      // Fuera: PENDIENTE 4.00, RECHAZADA 3.00 y las 10.00 de OTRO.
      acreditadas: '7.50',
      proyectos: [
        { projectId: 1, reportadasGranulares: '5.50', legacy: '2.00' },
        { projectId: 2, reportadasGranulares: '1.25', legacy: '0.00' },
        { projectId: 5, reportadasGranulares: '0.75', legacy: '0.00' },
      ],
    });
  });

  it('un usuario sin tramos ni horas recibe ceros como strings de dos decimales', async () => {
    const { prisma } = prismaDe(mundoVacio());
    const resultado = await new ProjectHoursSummaryService(prisma).forUserOpenProjects(ESTUDIANTE);

    expect(resultado).toEqual({
      idUsuario: ESTUDIANTE,
      reportadasGranulares: '0.00',
      legacy: '0.00',
      acreditadas: '0.00',
      proyectos: [],
    });
  });

  it('conserva las dos consultas del dashboard: tramos de proyectos abiertos y agregados APROBADA del usuario', async () => {
    const { prisma, llamadas } = prismaDe(mundoBase());
    await new ProjectHoursSummaryService(prisma).forUserOpenProjects(ESTUDIANTE);

    expect(llamadas.map((l) => l.modelo)).toEqual(['asignacionTarea.findMany', 'horasParticipacion.findMany']);
    expect(llamadas[0].args.where).toEqual({
      idUsuario: ESTUDIANTE,
      tarea: {
        proyecto: {
          eliminadoEn: null,
          estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE'] },
        },
      },
    });
    expect(llamadas[0].args.select).toMatchObject({
      registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
    });
    expect(llamadas[1].args.where).toEqual({ participacion: { idUsuario: ESTUDIANTE }, estadoHoras: 'APROBADA' });
  });

  it('los importes salen siempre como strings con dos decimales, sin pérdida de precisión', async () => {
    const mundo = mundoBase();
    // 0.10 + 0.20 en coma flotante sería 0.30000000000000004.
    mundo.tramos.push({
      idAsignacion: 1100, idTarea: 102, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '0.30',
      registros: [{ horas: '0.10' }, { horas: '0.20' }],
    });
    const { prisma } = prismaDe(mundo);
    const resultado = await new ProjectHoursSummaryService(prisma).forUserOpenProjects(ESTUDIANTE);

    expect(resultado.reportadasGranulares).toBe('7.80');
    expect(resultado.proyectos[0]).toEqual({ projectId: 1, reportadasGranulares: '5.80', legacy: '2.00' });
    for (const valor of [resultado.reportadasGranulares, resultado.legacy, resultado.acreditadas]) {
      expect(valor).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
