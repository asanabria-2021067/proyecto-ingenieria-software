import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ProjectHoursSummaryService } from '../src/sprints/project-hours-summary.service';
import type { MisHorasView } from '../src/sprints/project-hours-summary.service';

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
          .map((p) => ({ rolProyecto: { proyecto: proyectoFila(proyecto(p.idProyecto)) } }));
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

// ─── forUserBreakdown (Mis Horas) ─────────────────────────────────────────

const servicio = (mundo: Mundo) => new ProjectHoursSummaryService(prismaDe(mundo).prisma);
const proyectoDe = (vista: MisHorasView, id: number) => vista.proyectos.find((p) => p.idProyecto === id)!;
const suma = (valores: string[]) => valores.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0)).toFixed(2);

/** Invariantes de consistencia entre niveles (INV-H03…H06, H12) para cualquier respuesta. */
function expectInvariantes(vista: MisHorasView) {
  const abiertos = vista.proyectos.filter((p) => p.abierto);
  // INV-H03: los proyectos abiertos componen las registradas y el legacy abiertos.
  expect(suma(abiertos.map((p) => p.registradas))).toBe(vista.totales.registradasEnProyectosAbiertos);
  expect(suma(abiertos.map((p) => p.legacy))).toBe(vista.totales.legacyEnProyectosAbiertos);
  // INV-H04: todos los proyectos componen propuestas y acreditadas.
  expect(suma(vista.proyectos.map((p) => p.propuestasPendientes))).toBe(vista.totales.propuestasPendientes);
  expect(suma(vista.proyectos.map((p) => p.acreditadas))).toBe(vista.totales.acreditadas);
  // INV-H05: en cada proyecto abierto, sus tareas componen sus registradas y su legacy.
  for (const p of abiertos) {
    expect(suma(p.tareas.map((t) => t.registradas)), `registradas de ${p.tituloProyecto}`).toBe(p.registradas);
    expect(suma(p.tareas.map((t) => t.legacy)), `legacy de ${p.tituloProyecto}`).toBe(p.legacy);
  }
  // INV-H06 / INV-H12: porTipo trae siempre los tres tipos, en orden, y compone los totales.
  expect(vista.porTipo.map((t) => t.tipoProyecto)).toEqual([
    'ACADEMICO_HORAS_BECA',
    'EXTRACURRICULAR_EXTENSION',
    'ACADEMICO_EXPERIENCIA',
  ]);
  expect(suma(vista.porTipo.map((t) => t.registradasEnProyectosAbiertos))).toBe(vista.totales.registradasEnProyectosAbiertos);
  expect(suma(vista.porTipo.map((t) => t.propuestasPendientes))).toBe(vista.totales.propuestasPendientes);
  expect(suma(vista.porTipo.map((t) => t.acreditadas))).toBe(vista.totales.acreditadas);
  // Los proyectos que no están abiertos no exponen tareas.
  for (const p of vista.proyectos.filter((x) => !x.abierto)) expect(p.tareas).toEqual([]);
}

/** Todos los importes de la respuesta, con su ruta, para validar el formato. */
function importes(vista: MisHorasView): Array<[string, string]> {
  const out: Array<[string, string]> = Object.entries(vista.totales).map(([k, v]) => [`totales.${k}`, v]);
  for (const t of vista.porTipo) {
    out.push([`porTipo.${t.tipoProyecto}.registradas`, t.registradasEnProyectosAbiertos]);
    out.push([`porTipo.${t.tipoProyecto}.propuestas`, t.propuestasPendientes]);
    out.push([`porTipo.${t.tipoProyecto}.acreditadas`, t.acreditadas]);
  }
  for (const p of vista.proyectos) {
    for (const k of ['registradas', 'legacy', 'propuestasPendientes', 'acreditadas'] as const) {
      out.push([`proyecto ${p.idProyecto}.${k}`, p[k]]);
    }
    for (const t of p.tareas) {
      out.push([`tarea ${t.idTarea}.registradas`, t.registradas]);
      out.push([`tarea ${t.idTarea}.legacy`, t.legacy]);
    }
  }
  return out;
}

describe('ProjectHoursSummaryService.forUserBreakdown', () => {
  it('usuario sin datos: ceros como "0.00", tres tipos, sin proyectos y sin metas', async () => {
    const vista = await servicio(mundoVacio()).forUserBreakdown(ESTUDIANTE);

    expect(vista).toEqual({
      idUsuario: ESTUDIANTE,
      requisitos: { horasBecaRequeridas: null, horasExtensionRequeridas: null },
      totales: {
        registradasEnProyectosAbiertos: '0.00',
        legacyEnProyectosAbiertos: '0.00',
        propuestasPendientes: '0.00',
        acreditadas: '0.00',
      },
      porTipo: [
        { tipoProyecto: 'ACADEMICO_HORAS_BECA', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
        { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
        { tipoProyecto: 'ACADEMICO_EXPERIENCIA', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
      ],
      proyectos: [],
    });
  });

  it('totales, metas y desglose por tipo del mundo base', async () => {
    const vista = await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE);

    expect(vista.requisitos).toEqual({ horasBecaRequeridas: 40, horasExtensionRequeridas: 20 });
    expect(vista.totales).toEqual({
      // 5.50 Tutorías + 1.25 Huerto + 0.75 Radio (retirado); sin Archivo (cerrado) ni Borrado (eliminado).
      registradasEnProyectosAbiertos: '7.50',
      legacyEnProyectosAbiertos: '2.00',
      // Solo la PENDIENTE de Tutorías; la RECHAZADA no suma.
      propuestasPendientes: '4.00',
      // Archivo (cerrado) + Borrado (eliminado).
      acreditadas: '7.50',
    });
    expect(vista.porTipo).toEqual([
      { tipoProyecto: 'ACADEMICO_HORAS_BECA', registradasEnProyectosAbiertos: '5.50', propuestasPendientes: '4.00', acreditadas: '6.00' },
      { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', registradasEnProyectosAbiertos: '2.00', propuestasPendientes: '0.00', acreditadas: '1.50' },
      { tipoProyecto: 'ACADEMICO_EXPERIENCIA', registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
    ]);
    expectInvariantes(vista);
  });

  it('coincide con el dashboard en registradas abiertas y acreditadas para el mismo usuario (INV-H07)', async () => {
    const mundo = mundoBase();
    const [vista, dashboard] = await Promise.all([
      servicio(mundo).forUserBreakdown(ESTUDIANTE),
      servicio(mundo).forUserOpenProjects(ESTUDIANTE),
    ]);

    expect(vista.totales.registradasEnProyectosAbiertos).toBe(dashboard.reportadasGranulares);
    expect(vista.totales.acreditadas).toBe(dashboard.acreditadas);
    expect(vista.totales.legacyEnProyectosAbiertos).toBe(dashboard.legacy);
  });

  it('granular: suma los registros efectivos de la tarea y excluye los revocados', async () => {
    const tutorias = proyectoDe(await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE), 1);

    const disenar = tutorias.tareas.find((t) => t.idTarea === 101)!;
    // 3.50 + 2.00; las 5.00 revocadas no cuentan y el caché horasReales tampoco se usa.
    expect(disenar.registradas).toBe('5.50');
    expect(disenar.legacy).toBe('0.00');
    // Las 9.00 de OTRO en la misma tarea no son del estudiante.
    expect(tutorias.registradas).toBe('5.50');
  });

  it('legacy: se informa aparte y nunca se suma a las registradas', async () => {
    const tutorias = proyectoDe(await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE), 1);

    const agenda = tutorias.tareas.find((t) => t.idTarea === 102)!;
    expect(agenda).toMatchObject({ registradas: '0.00', legacy: '2.00' });
    expect(tutorias).toMatchObject({ registradas: '5.50', legacy: '2.00' });
  });

  it('POR_CONCILIAR: aporta sus registros pero no genera legacy', async () => {
    const huerto = proyectoDe(await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE), 2);

    expect(huerto).toMatchObject({ registradas: '1.25', legacy: '0.00' });
    expect(huerto.tareas).toEqual([
      { idTarea: 201, tituloTarea: 'Riego', estadoTarea: 'POR_HACER', eliminada: false, sprint: null, registradas: '1.25', legacy: '0.00' },
    ]);
  });

  it('propuesta, acreditada y rechazada quedan separadas por proyecto', async () => {
    const vista = await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 1)).toMatchObject({ propuestasPendientes: '4.00', acreditadas: '0.00' });
    expect(proyectoDe(vista, 3)).toMatchObject({ propuestasPendientes: '0.00', acreditadas: '6.00' });
  });

  it('proyecto abierto frente a cerrado: el cerrado conserva sus cifras y cuenta tareas, pero no las lista', async () => {
    const vista = await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 1)).toMatchObject({ abierto: true, estadoProyecto: 'EN_PROGRESO', tareasDistintas: 2 });
    expect(proyectoDe(vista, 5)).toMatchObject({ abierto: true, estadoProyecto: 'EN_SOLICITUD_CIERRE' });
    expect(proyectoDe(vista, 3)).toEqual({
      idProyecto: 3,
      tituloProyecto: 'Archivo',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'CERRADO',
      abierto: false,
      eliminado: false,
      esLider: false,
      participacionActiva: false,
      registradas: '6.00',
      legacy: '0.00',
      propuestasPendientes: '0.00',
      acreditadas: '6.00',
      tareasDistintas: 1,
      tareas: [],
    });
  });

  it('retirado: sus tramos en un proyecto abierto siguen contando, con la participación marcada como no activa', async () => {
    const radio = proyectoDe(await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE), 5);

    expect(radio).toMatchObject({ abierto: true, participacionActiva: false, esLider: false, registradas: '0.75' });
    expect(radio.tareas.map((t) => t.idTarea)).toEqual([501]);
  });

  it('líder sin participación: su proyecto aparece con esLider y sus horas cuentan', async () => {
    const mundo = mundoBase();
    mundo.proyectos.push({ idProyecto: 6, tituloProyecto: 'Mentorías', tipoProyecto: 'ACADEMICO_EXPERIENCIA', estadoProyecto: 'EN_PROGRESO', creadoPor: ESTUDIANTE });
    mundo.tareas.push({ idTarea: 601, idProyecto: 6, idSprint: null, tituloTarea: 'Plan', estadoTarea: 'EN_PROGRESO' });
    mundo.tramos.push({ idAsignacion: 1601, idTarea: 601, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '2.00', registros: [{ horas: '2.00' }] });

    const vista = await servicio(mundo).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 6)).toMatchObject({ esLider: true, participacionActiva: false, registradas: '2.00' });
    // Experiencia también acumula en su tipo, aunque no tenga meta.
    expect(vista.porTipo[2]).toEqual({
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      registradasEnProyectosAbiertos: '2.00',
      propuestasPendientes: '0.00',
      acreditadas: '0.00',
    });
    expect(vista.totales.registradasEnProyectosAbiertos).toBe('9.50');
    expectInvariantes(vista);
  });

  it('tarea eliminada: sus horas siguen contando y la tarea queda marcada', async () => {
    const mundo = mundoBase();
    mundo.tareas.push({ idTarea: 103, idProyecto: 1, idSprint: 11, tituloTarea: 'Borrador', estadoTarea: 'POR_HACER', eliminada: true });
    mundo.tramos.push({ idAsignacion: 1103, idTarea: 103, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '1.00', registros: [{ horas: '1.00' }] });

    const vista = await servicio(mundo).forUserBreakdown(ESTUDIANTE);
    const tutorias = proyectoDe(vista, 1);

    expect(tutorias.tareas.find((t) => t.idTarea === 103)).toMatchObject({ eliminada: true, registradas: '1.00' });
    expect(tutorias.registradas).toBe('6.50');
    expect(tutorias.tareasDistintas).toBe(3);
    expect(vista.totales.registradasEnProyectosAbiertos).toBe('8.50');
    expectInvariantes(vista);
  });

  it('proyecto eliminado con acreditadas: sigue representado y marcado como eliminado', async () => {
    const vista = await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 4)).toMatchObject({
      tituloProyecto: 'Borrado',
      eliminado: true,
      abierto: false,
      // Sus tramos no se leen: solo cuenta lo acreditado.
      registradas: '0.00',
      acreditadas: '1.50',
      tareas: [],
    });
  });

  it('participante activo sin horas ve su proyecto en cero; un proyecto solo con horas rechazadas no aparece', async () => {
    const mundo = mundoBase();
    mundo.proyectos.push(
      { idProyecto: 7, tituloProyecto: 'Nuevo', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'PUBLICADO', creadoPor: LIDER_AJENO },
      { idProyecto: 8, tituloProyecto: 'Rechazos', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'CERRADO', creadoPor: LIDER_AJENO },
    );
    mundo.participaciones.push(
      { idParticipacion: 97, idUsuario: ESTUDIANTE, idProyecto: 7, estadoParticipacion: 'ACTIVO' },
      { idParticipacion: 98, idUsuario: ESTUDIANTE, idProyecto: 8, estadoParticipacion: 'COMPLETADO' },
    );
    mundo.horas.push({ idHorasParticipacion: 6, idParticipacion: 98, estadoHoras: 'RECHAZADA', horasCalculadas: '5.00', horasAprobadas: null });

    const vista = await servicio(mundo).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 7)).toMatchObject({
      abierto: true,
      participacionActiva: true,
      registradas: '0.00',
      legacy: '0.00',
      propuestasPendientes: '0.00',
      acreditadas: '0.00',
      tareasDistintas: 0,
      tareas: [],
    });
    expect(vista.proyectos.map((p) => p.idProyecto)).not.toContain(8);
    expectInvariantes(vista);
  });

  it('ordena los proyectos: abiertos primero, luego por título en español y por id', async () => {
    const vista = await servicio(mundoBase()).forUserBreakdown(ESTUDIANTE);
    expect(vista.proyectos.map((p) => p.tituloProyecto)).toEqual(['Huerto', 'Radio', 'Tutorías', 'Archivo', 'Borrado']);

    const mundo = mundoVacio();
    const abierto = (idProyecto: number, tituloProyecto: string) => {
      mundo.proyectos.push({ idProyecto, tituloProyecto, tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_PROGRESO', creadoPor: LIDER_AJENO });
      mundo.participaciones.push({ idParticipacion: 900 + idProyecto, idUsuario: ESTUDIANTE, idProyecto, estadoParticipacion: 'ACTIVO' });
    };
    abierto(1, 'Zoología');
    abierto(2, 'árboles');
    abierto(3, 'Biblioteca');
    abierto(5, 'Árboles');
    abierto(4, 'Árboles');
    const orden = await servicio(mundo).forUserBreakdown(ESTUDIANTE);
    // La tilde no manda la palabra al final (localeCompare 'es'); empate de título → idProyecto.
    expect(orden.proyectos.map((p) => `${p.tituloProyecto}#${p.idProyecto}`)).toEqual([
      'árboles#2',
      'Árboles#4',
      'Árboles#5',
      'Biblioteca#3',
      'Zoología#1',
    ]);
  });

  it('ordena las tareas: Sprint más reciente primero, sin Sprint al final y luego por título', async () => {
    const mundo = mundoBase();
    mundo.tareas.push(
      { idTarea: 104, idProyecto: 1, idSprint: 12, tituloTarea: 'Alertas', estadoTarea: 'POR_HACER' },
      { idTarea: 105, idProyecto: 1, idSprint: null, tituloTarea: 'Backlog', estadoTarea: 'POR_HACER' },
      { idTarea: 106, idProyecto: 1, idSprint: null, tituloTarea: 'Ámbito', estadoTarea: 'POR_HACER' },
    );
    for (const idTarea of [104, 105, 106]) {
      mundo.tramos.push({ idAsignacion: 2000 + idTarea, idTarea, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '0.50', registros: [{ horas: '0.50' }] });
    }

    const tutorias = proyectoDe(await servicio(mundo).forUserBreakdown(ESTUDIANTE), 1);

    expect(tutorias.tareas.map((t) => `${t.sprint?.numero ?? '-'} ${t.tituloTarea}`)).toEqual([
      '2 Agenda',
      '2 Alertas',
      '1 Diseñar sesiones',
      '- Ámbito',
      '- Backlog',
    ]);
    expect(tutorias.tareas[0].sprint).toEqual({ idSprint: 12, numero: 2, estado: 'ACTIVO' });
  });

  it('agrupa varios tramos de la misma tarea en una sola fila', async () => {
    const mundo = mundoBase();
    // Reasignación: segundo tramo del estudiante sobre la misma tarea 101.
    mundo.tramos.push({ idAsignacion: 1010, idTarea: 101, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '1.50', registros: [{ horas: '1.50' }] });

    const tutorias = proyectoDe(await servicio(mundo).forUserBreakdown(ESTUDIANTE), 1);

    expect(tutorias.tareas.filter((t) => t.idTarea === 101)).toHaveLength(1);
    expect(tutorias.tareas.find((t) => t.idTarea === 101)!.registradas).toBe('7.00');
    expect(tutorias.tareasDistintas).toBe(2);
  });

  it('todos los importes son strings con dos decimales y sin error de coma flotante (INV-H10)', async () => {
    const mundo = mundoBase();
    mundo.tramos.push({ idAsignacion: 1100, idTarea: 102, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '0.30', registros: [{ horas: '0.10' }, { horas: '0.20' }] });

    const vista = await servicio(mundo).forUserBreakdown(ESTUDIANTE);

    expect(proyectoDe(vista, 1).tareas.find((t) => t.idTarea === 102)!.registradas).toBe('0.30');
    for (const [ruta, valor] of importes(vista)) {
      expect(typeof valor, ruta).toBe('string');
      expect(valor, ruta).toMatch(/^\d+\.\d{2}$/);
    }
    expectInvariantes(vista);
  });

  it('hace exactamente cuatro consultas fijas con el usuario autenticado, sin importar cuántos proyectos y tareas haya (INV-H09)', async () => {
    const mundo = mundoBase();
    for (let p = 0; p < 25; p += 1) {
      const idProyecto = 100 + p;
      mundo.proyectos.push({ idProyecto, tituloProyecto: `Proyecto ${p}`, tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'EN_PROGRESO', creadoPor: LIDER_AJENO });
      for (let t = 0; t < 6; t += 1) {
        const idTarea = idProyecto * 100 + t;
        mundo.tareas.push({ idTarea, idProyecto, idSprint: null, tituloTarea: `Tarea ${t}`, estadoTarea: 'HECHO' });
        mundo.tramos.push({ idAsignacion: idTarea, idTarea, idUsuario: ESTUDIANTE, origenReporte: 'GRANULAR', horasReales: '1.00', registros: [{ horas: '1.00' }] });
      }
    }
    const { prisma, llamadas } = prismaDe(mundo);

    const vista = await new ProjectHoursSummaryService(prisma).forUserBreakdown(ESTUDIANTE);

    expect(vista.proyectos).toHaveLength(30);
    expect(llamadas.map((l) => l.modelo).sort()).toEqual([
      'asignacionTarea.findMany',
      'horasParticipacion.findMany',
      'participacionProyecto.findMany',
      'perfilEstudiante.findUnique',
    ]);
    const where = Object.fromEntries(llamadas.map((l) => [l.modelo, l.args.where]));
    expect(where).toEqual({
      'perfilEstudiante.findUnique': { idUsuario: ESTUDIANTE },
      'asignacionTarea.findMany': { idUsuario: ESTUDIANTE, tarea: { proyecto: { eliminadoEn: null } } },
      'horasParticipacion.findMany': { participacion: { idUsuario: ESTUDIANTE } },
      'participacionProyecto.findMany': { idUsuario: ESTUDIANTE, estadoParticipacion: 'ACTIVO' },
    });
    // El líder se deduce de `creadoPor`, así que las tres lecturas de proyecto lo seleccionan.
    expect(JSON.stringify(llamadas.find((l) => l.modelo === 'asignacionTarea.findMany')!.args.select)).toContain('"creadoPor":true');
    expect(JSON.stringify(llamadas.find((l) => l.modelo === 'horasParticipacion.findMany')!.args.select)).toContain('"creadoPor":true');
    expect(JSON.stringify(llamadas.find((l) => l.modelo === 'participacionProyecto.findMany')!.args.select)).toContain('"creadoPor":true');
  });

  it('lanza las cuatro consultas a la vez, sin esperar ninguna antes de pedir la siguiente', async () => {
    const { prisma, llamadas } = prismaDe(mundoBase());
    let liberar!: () => void;
    const barrera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    // Cada consulta queda bloqueada hasta liberar la barrera.
    const retenido = prisma as unknown as Record<string, Record<string, (args: unknown) => Promise<unknown>>>;
    for (const [modelo, metodo] of [
      ['perfilEstudiante', 'findUnique'],
      ['asignacionTarea', 'findMany'],
      ['horasParticipacion', 'findMany'],
      ['participacionProyecto', 'findMany'],
    ]) {
      const original = retenido[modelo][metodo];
      retenido[modelo][metodo] = async (args) => {
        const resultado = original(args);
        await barrera;
        return resultado;
      };
    }

    const pendiente = new ProjectHoursSummaryService(prisma).forUserBreakdown(ESTUDIANTE);
    await Promise.resolve();
    expect(llamadas).toHaveLength(4);
    liberar();
    await expect(pendiente).resolves.toMatchObject({ idUsuario: ESTUDIANTE });
    expect(llamadas).toHaveLength(4);
  });
});
