import { Injectable } from '@nestjs/common';
import {
  EstadoHoras,
  EstadoParticipacion,
  EstadoProyecto,
  EstadoSprint,
  EstadoTarea,
  OrigenReporteTramo,
  Prisma,
  TipoProyecto,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * C069 (06 v2 §40/§46 ProjectHoursSummary): proveedor de LECTURA de las horas
 * de un proyecto. No escribe, no emite sockets y no suplanta a nadie: acepta
 * el `tx` de una captura ya autorizada para que la foto sea coherente con el
 * resto de esa transacción, y lo omite en consultas informativas.
 *
 * Las cuatro magnitudes se mantienen SEPARADAS a propósito, porque §16/§46 no
 * las considera intercambiables:
 *   - `reportadasGranulares`: SUM de RegistroTiempoTarea efectivos.
 *   - `legacy`: importes históricos de tramos sin registros (§8), nunca
 *     presentados como si fueran una suma de registros.
 *   - `propuestasPendientes`: HorasParticipacion PENDIENTE — reconocidas por
 *     una consolidación, todavía NO acreditadas.
 *   - `acreditadas`: HorasParticipacion APROBADA, lo único que un
 *     administrador ya aprobó.
 *
 * `tareasDistintas` cuenta tareas, no horas: sumar tramos de una misma tarea
 * reasignada contaría dos veces la misma tarea, y esa confusión es justo la
 * que §46 pide evitar.
 */

export interface HorasPorUsuario {
  idUsuario: number;
  nombre: string;
  apellido: string;
  reportadasGranulares: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
}

export interface HorasPorParticipacionSprint {
  idParticipacion: number;
  idUsuario: number;
  idSprint: number | null;
  idRolProyecto: number;
  nombreRol: string;
  reportadasGranulares: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
}

export interface ProjectHoursSummary {
  projectId: number;
  reportadasGranulares: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
  porUsuario: HorasPorUsuario[];
  porParticipacionSprint: HorasPorParticipacionSprint[];
}

export interface UserOpenProjectsHours {
  idUsuario: number;
  /** Incluye proyectos abiertos donde el usuario ya no participa (§46 dashboard). */
  reportadasGranulares: string;
  legacy: string;
  acreditadas: string;
  proyectos: Array<{ projectId: number; reportadasGranulares: string; legacy: string }>;
}

export interface SprintMemberDetailHours {
  idSprint: number;
  idUsuario: number;
  reportadasGranulares: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
  tramos: Array<{
    idAsignacion: number;
    idTarea: number;
    idParticipacion: number | null;
    origen: string;
    abierto: boolean;
    reportadas: string;
    cache: string;
    ajuste: string | null;
    propuestas: string;
    reconocidoEn: Date | null;
  }>;
}

/**
 * HU-158 (T-231): desglose de las horas de UN usuario para «Mis Horas». Todos
 * los importes son strings de dos decimales calculados aquí: el frontend los
 * muestra, nunca los suma.
 */
export interface MisHorasTarea {
  idTarea: number;
  tituloTarea: string;
  estadoTarea: EstadoTarea;
  /** La tarea se eliminó; sus horas siguen contando. */
  eliminada: boolean;
  sprint: { idSprint: number; numero: number; estado: EstadoSprint } | null;
  registradas: string;
  legacy: string;
}

export interface MisHorasProyecto {
  idProyecto: number;
  tituloProyecto: string;
  tipoProyecto: TipoProyecto;
  estadoProyecto: EstadoProyecto;
  abierto: boolean;
  eliminado: boolean;
  /** El líder no tiene participación: sin esta marca parecería retirado de su propio proyecto. */
  esLider: boolean;
  participacionActiva: boolean;
  registradas: string;
  legacy: string;
  propuestasPendientes: string;
  acreditadas: string;
  tareasDistintas: number;
  /** Vacío en los proyectos que no están abiertos. */
  tareas: MisHorasTarea[];
}

export interface MisHorasPorTipo {
  tipoProyecto: TipoProyecto;
  registradasEnProyectosAbiertos: string;
  propuestasPendientes: string;
  acreditadas: string;
}

export interface MisHorasView {
  idUsuario: number;
  requisitos: { horasBecaRequeridas: number | null; horasExtensionRequeridas: number | null };
  totales: {
    /** Igual que `horasRegistradasEnProyectosAbiertos` del dashboard. */
    registradasEnProyectosAbiertos: string;
    legacyEnProyectosAbiertos: string;
    propuestasPendientes: string;
    /** Igual que `horasAcreditadas` del dashboard. */
    acreditadas: string;
  };
  /** Siempre los tres tipos, en este orden. */
  porTipo: MisHorasPorTipo[];
  proyectos: MisHorasProyecto[];
}

type Db = Prisma.TransactionClient | PrismaService;

const CERO = new Prisma.Decimal(0);
const dec2 = (value: Prisma.Decimal): string => value.toFixed(2);

/**
 * Reglas compartidas por todas las lecturas de horas (06 v2 §16/§46). Viven
 * aquí, una sola vez, para que el dashboard, el proyecto, el Sprint y Mis
 * Horas no puedan divergir en qué cuenta como abierto, legacy o acreditado.
 */

/** Un proyecto está abierto en estos estados (y además sin `eliminadoEn`). */
const ESTADOS_PROYECTO_ABIERTO: EstadoProyecto[] = [
  EstadoProyecto.PUBLICADO,
  EstadoProyecto.EN_PROGRESO,
  EstadoProyecto.EN_SOLICITUD_CIERRE,
];

/** Horas granulares de un tramo: sus registros efectivos (la consulta ya excluye los revocados). */
const sumarRegistros = (tramo: { registrosTiempo: Array<{ horas: Prisma.Decimal }> }): Prisma.Decimal =>
  tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), CERO);

/** Importe histórico del tramo; solo existe en tramos LEGACY (POR_CONCILIAR no aporta). */
const legacyDe = (tramo: { origenReporte: OrigenReporteTramo; horasReales: Prisma.Decimal | null }): Prisma.Decimal =>
  tramo.origenReporte === OrigenReporteTramo.LEGACY ? (tramo.horasReales ?? CERO) : CERO;

/** Horas reconocidas por una consolidación y todavía pendientes de aprobar. */
const propuestaDe = (fila: { estadoHoras: EstadoHoras; horasCalculadas: Prisma.Decimal | null }): Prisma.Decimal =>
  fila.estadoHoras === EstadoHoras.PENDIENTE ? (fila.horasCalculadas ?? CERO) : CERO;

/** Horas que un administrador ya aprobó; lo rechazado no cuenta en ningún nivel. */
const acreditadaDe = (fila: { estadoHoras: EstadoHoras; horasAprobadas: Prisma.Decimal | null }): Prisma.Decimal =>
  fila.estadoHoras === EstadoHoras.APROBADA ? (fila.horasAprobadas ?? CERO) : CERO;

const esAbierto = (proyecto: { estadoProyecto: EstadoProyecto; eliminadoEn: Date | null }): boolean =>
  proyecto.eliminadoEn === null && ESTADOS_PROYECTO_ABIERTO.includes(proyecto.estadoProyecto);

/** Orden fijo de `porTipo` en Mis Horas. */
const TIPOS_PROYECTO: TipoProyecto[] = [
  TipoProyecto.ACADEMICO_HORAS_BECA,
  TipoProyecto.EXTRACURRICULAR_EXTENSION,
  TipoProyecto.ACADEMICO_EXPERIENCIA,
];

const PROYECTO_MIS_HORAS = {
  idProyecto: true,
  tituloProyecto: true,
  tipoProyecto: true,
  estadoProyecto: true,
  creadoPor: true,
  eliminadoEn: true,
} satisfies Prisma.ProyectoSelect;

type ProyectoMisHoras = Prisma.ProyectoGetPayload<{ select: typeof PROYECTO_MIS_HORAS }>;

@Injectable()
export class ProjectHoursSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async forProject(tx: Prisma.TransactionClient | undefined, projectId: number): Promise<ProjectHoursSummary> {
    const db: Db = tx ?? this.prisma;
    const [tramos, agregados] = await Promise.all([
      db.asignacionTarea.findMany({
        where: { tarea: { idProyecto: projectId } },
        select: {
          idAsignacion: true,
          idTarea: true,
          idUsuario: true,
          idParticipacion: true,
          origenReporte: true,
          horasReales: true,
          usuario: { select: { idUsuario: true, nombre: true, apellido: true } },
          participacion: {
            select: {
              idParticipacion: true,
              idRolProyecto: true,
              rolProyecto: { select: { nombreRol: true } },
            },
          },
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
        },
      }),
      db.horasParticipacion.findMany({
        where: { participacion: { rolProyecto: { idProyecto: projectId } } },
        select: {
          idParticipacion: true,
          idSprint: true,
          horasCalculadas: true,
          horasAprobadas: true,
          estadoHoras: true,
          participacion: { select: { idUsuario: true } },
        },
      }),
    ]);

    const porUsuario = new Map<number, HorasPorUsuario & { tareas: Set<number> }>();
    const porParticipacion = new Map<string, HorasPorParticipacionSprint & { tareas: Set<number> }>();
    const tareasProyecto = new Set<number>();
    let reportadas = CERO;
    let legacy = CERO;

    for (const tramo of tramos) {
      const propias = sumarRegistros(tramo);
      const legacyTramo = legacyDe(tramo);
      reportadas = reportadas.plus(propias);
      legacy = legacy.plus(legacyTramo);
      tareasProyecto.add(tramo.idTarea);

      const usuario = porUsuario.get(tramo.idUsuario) ?? {
        idUsuario: tramo.idUsuario,
        nombre: tramo.usuario.nombre,
        apellido: tramo.usuario.apellido,
        reportadasGranulares: '0.00',
        legacy: '0.00',
        propuestasPendientes: '0.00',
        acreditadas: '0.00',
        tareasDistintas: 0,
        tareas: new Set<number>(),
      };
      usuario.reportadasGranulares = dec2(new Prisma.Decimal(usuario.reportadasGranulares).plus(propias));
      usuario.legacy = dec2(new Prisma.Decimal(usuario.legacy).plus(legacyTramo));
      usuario.tareas.add(tramo.idTarea);
      porUsuario.set(tramo.idUsuario, usuario);

      if (tramo.participacion) {
        const clave = `${tramo.participacion.idParticipacion}`;
        const fila = porParticipacion.get(clave) ?? {
          idParticipacion: tramo.participacion.idParticipacion,
          idUsuario: tramo.idUsuario,
          idSprint: null,
          idRolProyecto: tramo.participacion.idRolProyecto,
          nombreRol: tramo.participacion.rolProyecto.nombreRol,
          reportadasGranulares: '0.00',
          legacy: '0.00',
          propuestasPendientes: '0.00',
          acreditadas: '0.00',
          tareasDistintas: 0,
          tareas: new Set<number>(),
        };
        fila.reportadasGranulares = dec2(new Prisma.Decimal(fila.reportadasGranulares).plus(propias));
        fila.legacy = dec2(new Prisma.Decimal(fila.legacy).plus(legacyTramo));
        fila.tareas.add(tramo.idTarea);
        porParticipacion.set(clave, fila);
      }
    }

    let pendientes = CERO;
    let acreditadas = CERO;
    for (const agregado of agregados) {
      const propuesta = propuestaDe(agregado);
      const aprobada = acreditadaDe(agregado);
      pendientes = pendientes.plus(propuesta);
      acreditadas = acreditadas.plus(aprobada);

      const usuario = porUsuario.get(agregado.participacion.idUsuario);
      if (usuario) {
        usuario.propuestasPendientes = dec2(new Prisma.Decimal(usuario.propuestasPendientes).plus(propuesta));
        usuario.acreditadas = dec2(new Prisma.Decimal(usuario.acreditadas).plus(aprobada));
      }
      const fila = porParticipacion.get(`${agregado.idParticipacion}`);
      if (fila) {
        fila.idSprint = agregado.idSprint;
        fila.propuestasPendientes = dec2(new Prisma.Decimal(fila.propuestasPendientes).plus(propuesta));
        fila.acreditadas = dec2(new Prisma.Decimal(fila.acreditadas).plus(aprobada));
      }
    }

    return {
      projectId,
      reportadasGranulares: dec2(reportadas),
      legacy: dec2(legacy),
      propuestasPendientes: dec2(pendientes),
      acreditadas: dec2(acreditadas),
      tareasDistintas: tareasProyecto.size,
      porUsuario: [...porUsuario.values()]
        .map(({ tareas, ...resto }) => ({ ...resto, tareasDistintas: tareas.size }))
        .sort((a, b) => a.idUsuario - b.idUsuario),
      porParticipacionSprint: [...porParticipacion.values()]
        .map(({ tareas, ...resto }) => ({ ...resto, tareasDistintas: tareas.size }))
        .sort((a, b) => a.idParticipacion - b.idParticipacion),
    };
  }

  /**
   * Horas del usuario en proyectos todavía abiertos. Incluye tramos de
   * proyectos donde ya se retiró: lo que se registró se registró, y ocultarlo
   * porque la participación terminó falsearía su contribución.
   */
  async forUserOpenProjects(userId: number): Promise<UserOpenProjectsHours> {
    const tramos = await this.prisma.asignacionTarea.findMany({
      where: {
        idUsuario: userId,
        tarea: {
          proyecto: {
            eliminadoEn: null,
            estadoProyecto: { in: ESTADOS_PROYECTO_ABIERTO },
          },
        },
      },
      select: {
        origenReporte: true,
        horasReales: true,
        tarea: { select: { idProyecto: true } },
        registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
      },
    });

    const porProyecto = new Map<number, { reportadas: Prisma.Decimal; legacy: Prisma.Decimal }>();
    let reportadas = CERO;
    let legacy = CERO;
    for (const tramo of tramos) {
      const propias = sumarRegistros(tramo);
      const legacyTramo = legacyDe(tramo);
      reportadas = reportadas.plus(propias);
      legacy = legacy.plus(legacyTramo);
      const actual = porProyecto.get(tramo.tarea.idProyecto) ?? { reportadas: CERO, legacy: CERO };
      porProyecto.set(tramo.tarea.idProyecto, {
        reportadas: actual.reportadas.plus(propias),
        legacy: actual.legacy.plus(legacyTramo),
      });
    }

    // Solo APROBADA cuenta como acreditada (§46 dashboard).
    const aprobadas = await this.prisma.horasParticipacion.findMany({
      where: { participacion: { idUsuario: userId }, estadoHoras: EstadoHoras.APROBADA },
      select: { horasAprobadas: true },
    });

    return {
      idUsuario: userId,
      reportadasGranulares: dec2(reportadas),
      legacy: dec2(legacy),
      acreditadas: dec2(aprobadas.reduce((acc, fila) => acc.plus(fila.horasAprobadas ?? CERO), CERO)),
      proyectos: [...porProyecto.entries()]
        .map(([projectId, valores]) => ({
          projectId,
          reportadasGranulares: dec2(valores.reportadas),
          legacy: dec2(valores.legacy),
        }))
        .sort((a, b) => a.projectId - b.projectId),
    };
  }

  /**
   * HU-158 (T-231): todas las horas de un usuario, por proyecto, tarea y tipo,
   * con cuatro consultas fijas y sin ninguna consulta por proyecto o tarea.
   * Las reglas son las mismas del dashboard, así que sus dos totales comunes
   * (registradas en abiertos y acreditadas) coinciden siempre.
   */
  async forUserBreakdown(userId: number): Promise<MisHorasView> {
    const [perfil, tramos, agregados, participacionesActivas] = await Promise.all([
      this.prisma.perfilEstudiante.findUnique({
        where: { idUsuario: userId },
        select: { horasBecaRequeridas: true, horasExtensionRequeridas: true },
      }),
      // Todos los tramos del usuario, también los de participaciones retiradas
      // y los de tareas eliminadas; los de proyectos eliminados no se leen.
      this.prisma.asignacionTarea.findMany({
        where: { idUsuario: userId, tarea: { proyecto: { eliminadoEn: null } } },
        select: {
          origenReporte: true,
          horasReales: true,
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
          tarea: {
            select: {
              idTarea: true,
              tituloTarea: true,
              estadoTarea: true,
              eliminadoEn: true,
              sprint: { select: { idSprint: true, numero: true, estado: true } },
              proyecto: { select: PROYECTO_MIS_HORAS },
            },
          },
        },
      }),
      // Propuestas y acreditadas de cualquier proyecto, incluidos cerrados y
      // eliminados, igual que el dashboard.
      this.prisma.horasParticipacion.findMany({
        where: { participacion: { idUsuario: userId } },
        select: {
          estadoHoras: true,
          horasCalculadas: true,
          horasAprobadas: true,
          participacion: { select: { rolProyecto: { select: { proyecto: { select: PROYECTO_MIS_HORAS } } } } },
        },
      }),
      this.prisma.participacionProyecto.findMany({
        where: { idUsuario: userId, estadoParticipacion: EstadoParticipacion.ACTIVO },
        select: { rolProyecto: { select: { proyecto: { select: PROYECTO_MIS_HORAS } } } },
      }),
    ]);

    type TareaAcumulada = Omit<MisHorasTarea, 'registradas' | 'legacy'> & {
      registradas: Prisma.Decimal;
      legacy: Prisma.Decimal;
    };
    type ProyectoAcumulado = {
      proyecto: ProyectoMisHoras;
      registradas: Prisma.Decimal;
      legacy: Prisma.Decimal;
      propuestas: Prisma.Decimal;
      acreditadas: Prisma.Decimal;
      tareas: Map<number, TareaAcumulada>;
    };
    const proyectos = new Map<number, ProyectoAcumulado>();
    const acumulado = (proyecto: ProyectoMisHoras): ProyectoAcumulado => {
      const actual = proyectos.get(proyecto.idProyecto);
      if (actual) return actual;
      const nuevo = { proyecto, registradas: CERO, legacy: CERO, propuestas: CERO, acreditadas: CERO, tareas: new Map() };
      proyectos.set(proyecto.idProyecto, nuevo);
      return nuevo;
    };

    for (const tramo of tramos) {
      const propias = sumarRegistros(tramo);
      const legacyTramo = legacyDe(tramo);
      const fila = acumulado(tramo.tarea.proyecto);
      fila.registradas = fila.registradas.plus(propias);
      fila.legacy = fila.legacy.plus(legacyTramo);
      const tarea = fila.tareas.get(tramo.tarea.idTarea) ?? {
        idTarea: tramo.tarea.idTarea,
        tituloTarea: tramo.tarea.tituloTarea,
        estadoTarea: tramo.tarea.estadoTarea,
        eliminada: tramo.tarea.eliminadoEn !== null,
        sprint: tramo.tarea.sprint,
        registradas: CERO,
        legacy: CERO,
      };
      tarea.registradas = tarea.registradas.plus(propias);
      tarea.legacy = tarea.legacy.plus(legacyTramo);
      fila.tareas.set(tarea.idTarea, tarea);
    }

    for (const agregado of agregados) {
      const propuesta = propuestaDe(agregado);
      const acreditada = acreditadaDe(agregado);
      // Un agregado rechazado no aporta nada: no hace aparecer su proyecto.
      if (propuesta.isZero() && acreditada.isZero()) continue;
      const fila = acumulado(agregado.participacion.rolProyecto.proyecto);
      fila.propuestas = fila.propuestas.plus(propuesta);
      fila.acreditadas = fila.acreditadas.plus(acreditada);
    }

    // Un participante activo ve su proyecto aunque todavía no registre horas.
    const activos = new Set<number>();
    for (const { rolProyecto } of participacionesActivas) {
      activos.add(rolProyecto.proyecto.idProyecto);
      if (rolProyecto.proyecto.eliminadoEn === null) acumulado(rolProyecto.proyecto);
    }

    const totales = { registradas: CERO, legacy: CERO, propuestas: CERO, acreditadas: CERO };
    const porTipo = new Map(
      TIPOS_PROYECTO.map((tipo) => [tipo, { registradas: CERO, propuestas: CERO, acreditadas: CERO }]),
    );
    const vista: MisHorasProyecto[] = [];
    for (const fila of proyectos.values()) {
      const { proyecto } = fila;
      const abierto = esAbierto(proyecto);
      const tipo = porTipo.get(proyecto.tipoProyecto)!;
      if (abierto) {
        totales.registradas = totales.registradas.plus(fila.registradas);
        totales.legacy = totales.legacy.plus(fila.legacy);
        tipo.registradas = tipo.registradas.plus(fila.registradas);
      }
      totales.propuestas = totales.propuestas.plus(fila.propuestas);
      totales.acreditadas = totales.acreditadas.plus(fila.acreditadas);
      tipo.propuestas = tipo.propuestas.plus(fila.propuestas);
      tipo.acreditadas = tipo.acreditadas.plus(fila.acreditadas);

      vista.push({
        idProyecto: proyecto.idProyecto,
        tituloProyecto: proyecto.tituloProyecto,
        tipoProyecto: proyecto.tipoProyecto,
        estadoProyecto: proyecto.estadoProyecto,
        abierto,
        eliminado: proyecto.eliminadoEn !== null,
        esLider: proyecto.creadoPor === userId,
        participacionActiva: activos.has(proyecto.idProyecto),
        registradas: dec2(fila.registradas),
        legacy: dec2(fila.legacy),
        propuestasPendientes: dec2(fila.propuestas),
        acreditadas: dec2(fila.acreditadas),
        tareasDistintas: fila.tareas.size,
        tareas: abierto
          ? [...fila.tareas.values()]
              .sort(
                (a, b) =>
                  // Sprint más reciente primero; sin Sprint al final.
                  (b.sprint?.numero ?? -1) - (a.sprint?.numero ?? -1) ||
                  a.tituloTarea.localeCompare(b.tituloTarea, 'es') ||
                  a.idTarea - b.idTarea,
              )
              .map((tarea) => ({ ...tarea, registradas: dec2(tarea.registradas), legacy: dec2(tarea.legacy) }))
          : [],
      });
    }
    vista.sort(
      (a, b) =>
        Number(b.abierto) - Number(a.abierto) ||
        a.tituloProyecto.localeCompare(b.tituloProyecto, 'es') ||
        a.idProyecto - b.idProyecto,
    );

    return {
      idUsuario: userId,
      requisitos: {
        horasBecaRequeridas: perfil?.horasBecaRequeridas ?? null,
        horasExtensionRequeridas: perfil?.horasExtensionRequeridas ?? null,
      },
      totales: {
        registradasEnProyectosAbiertos: dec2(totales.registradas),
        legacyEnProyectosAbiertos: dec2(totales.legacy),
        propuestasPendientes: dec2(totales.propuestas),
        acreditadas: dec2(totales.acreditadas),
      },
      porTipo: TIPOS_PROYECTO.map((tipoProyecto) => {
        const tipo = porTipo.get(tipoProyecto)!;
        return {
          tipoProyecto,
          registradasEnProyectosAbiertos: dec2(tipo.registradas),
          propuestasPendientes: dec2(tipo.propuestas),
          acreditadas: dec2(tipo.acreditadas),
        };
      }),
      proyectos: vista,
    };
  }

  /** Detalle por miembro dentro de un Sprint: los tramos que lo componen. */
  async sprintMemberDetail(
    tx: Prisma.TransactionClient | undefined,
    input: { sprintId: number; userId: number },
  ): Promise<SprintMemberDetailHours> {
    const db: Db = tx ?? this.prisma;
    const [tramos, agregados] = await Promise.all([
      db.asignacionTarea.findMany({
        where: { idUsuario: input.userId, tarea: { idSprint: input.sprintId } },
        orderBy: { idAsignacion: 'asc' },
        select: {
          idAsignacion: true,
          idTarea: true,
          idParticipacion: true,
          origenReporte: true,
          horasReales: true,
          desasignadaEn: true,
          reconocidoEn: true,
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
          ajustes: { where: { anuladoEn: null }, select: { deltaHoras: true } },
        },
      }),
      db.horasParticipacion.findMany({
        where: { idSprint: input.sprintId, participacion: { idUsuario: input.userId } },
        select: { horasCalculadas: true, horasAprobadas: true, estadoHoras: true },
      }),
    ]);

    let reportadas = CERO;
    let legacy = CERO;
    const tareas = new Set<number>();
    const proyeccion = tramos.map((tramo) => {
      const propias = sumarRegistros(tramo);
      const legacyTramo = legacyDe(tramo);
      reportadas = reportadas.plus(propias);
      legacy = legacy.plus(legacyTramo);
      tareas.add(tramo.idTarea);
      const delta = tramo.ajustes[0]?.deltaHoras ?? null;
      const cache = tramo.horasReales ?? CERO;
      return {
        idAsignacion: tramo.idAsignacion,
        idTarea: tramo.idTarea,
        idParticipacion: tramo.idParticipacion,
        origen: tramo.origenReporte,
        abierto: tramo.desasignadaEn === null,
        reportadas: dec2(propias),
        cache: dec2(cache),
        ajuste: delta ? dec2(delta) : null,
        propuestas: dec2(cache.plus(delta ?? CERO)),
        reconocidoEn: tramo.reconocidoEn,
      };
    });

    return {
      idSprint: input.sprintId,
      idUsuario: input.userId,
      reportadasGranulares: dec2(reportadas),
      legacy: dec2(legacy),
      propuestasPendientes: dec2(agregados.reduce((acc, fila) => acc.plus(propuestaDe(fila)), CERO)),
      acreditadas: dec2(agregados.reduce((acc, fila) => acc.plus(acreditadaDe(fila)), CERO)),
      tareasDistintas: tareas.size,
      tramos: proyeccion,
    };
  }
}
