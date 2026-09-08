import { Injectable } from '@nestjs/common';
import { EstadoHoras, EstadoProyecto, Prisma } from '@prisma/client';
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

type Db = Prisma.TransactionClient | PrismaService;

const CERO = new Prisma.Decimal(0);
const dec2 = (value: Prisma.Decimal): string => value.toFixed(2);

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
      const propias = tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), CERO);
      const legacyTramo = tramo.origenReporte === 'LEGACY' ? (tramo.horasReales ?? CERO) : CERO;
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
      const propuesta = agregado.estadoHoras === EstadoHoras.PENDIENTE ? (agregado.horasCalculadas ?? CERO) : CERO;
      const aprobada = agregado.estadoHoras === EstadoHoras.APROBADA ? (agregado.horasAprobadas ?? CERO) : CERO;
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
            estadoProyecto: {
              in: [
                EstadoProyecto.PUBLICADO,
                EstadoProyecto.EN_PROGRESO,
                EstadoProyecto.EN_SOLICITUD_CIERRE,
              ],
            },
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
      const propias = tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), CERO);
      const legacyTramo = tramo.origenReporte === 'LEGACY' ? (tramo.horasReales ?? CERO) : CERO;
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
      const propias = tramo.registrosTiempo.reduce((acc, fila) => acc.plus(fila.horas), CERO);
      const legacyTramo = tramo.origenReporte === 'LEGACY' ? (tramo.horasReales ?? CERO) : CERO;
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
      propuestasPendientes: dec2(
        agregados
          .filter((fila) => fila.estadoHoras === EstadoHoras.PENDIENTE)
          .reduce((acc, fila) => acc.plus(fila.horasCalculadas ?? CERO), CERO),
      ),
      acreditadas: dec2(
        agregados
          .filter((fila) => fila.estadoHoras === EstadoHoras.APROBADA)
          .reduce((acc, fila) => acc.plus(fila.horasAprobadas ?? CERO), CERO),
      ),
      tareasDistintas: tareas.size,
      tramos: proyeccion,
    };
  }
}
