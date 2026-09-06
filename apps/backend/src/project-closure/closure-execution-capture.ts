import { EstadoSprint, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  ClosureExecutionInput,
  ClosurePresentation,
} from './closure-report-model';

/**
 * C129 (06 v2 §28/§40): captura determinista de la ejecución de un proyecto.
 *
 * Es una FUNCIÓN, no un servicio inyectable, precisamente para que readiness y
 * el generador de informes la compartan sin inyectarse entre sí: ambos
 * necesitan exactamente los mismos datos y una divergencia entre las dos
 * capturas produciría un «desactualizado» falso.
 *
 * Recibe el cliente que le pasa el caller —el `tx` de una captura bajo lock o
 * el cliente raíz de una consulta— y no abre transacción propia.
 */

type Db = Prisma.TransactionClient | PrismaService;

export interface ClosureExecutionCapture {
  ejecucion: ClosureExecutionInput;
  presentacion: ClosurePresentation;
}

export async function captureClosureExecution(
  db: Db,
  projectId: number,
): Promise<ClosureExecutionCapture> {
  const proyecto = await db.proyecto.findUniqueOrThrow({
    where: { idProyecto: projectId },
    select: {
      idProyecto: true,
      tituloProyecto: true,
      descripcionProyecto: true,
      objetivosProyecto: true,
      tipoProyecto: true,
      modalidadProyecto: true,
      ubicacionProyecto: true,
      contextoAcademico: true,
      urlRecursoExterno: true,
      fechaInicio: true,
      estadoProyecto: true,
      creador: { select: { idUsuario: true, nombre: true, apellido: true } },
    },
  });

  const [liderazgo, sprints, hitos, tareas, participaciones, agregados] = await Promise.all([
    db.historialLiderazgo.findMany({
      where: { idProyecto: projectId },
      select: {
        idHistorialLiderazgo: true,
        idLiderAnterior: true,
        idLiderNuevo: true,
        idAdminResponsable: true,
        origen: true,
        motivo: true,
        registradoEn: true,
        idApelacion: true,
      },
    }),
    db.sprint.findMany({
      where: { idProyecto: projectId, estado: EstadoSprint.CERRADO },
      select: { idSprint: true, numero: true, fechaInicio: true, fechaCierre: true },
    }),
    db.hito.findMany({
      where: { idProyecto: projectId },
      select: { idHito: true, tituloHito: true, estadoHito: true, fechaLimite: true, orden: true },
    }),
    db.tarea.findMany({
      where: { idProyecto: projectId },
      select: {
        idTarea: true,
        tituloTarea: true,
        idSprint: true,
        idRolProyecto: true,
        estadoTarea: true,
        eliminadoEn: true,
        tiempoEstimadoHoras: true,
        asignaciones: {
          select: {
            idAsignacion: true,
            idUsuario: true,
            idParticipacion: true,
            origenReporte: true,
            horasReales: true,
            reconocidoEn: true,
            registrosTiempo: {
              select: {
                idRegistroTiempo: true,
                horas: true,
                fecha: true,
                nota: true,
                justificacionExceso: true,
                revocadoEn: true,
              },
            },
            ajustes: {
              select: {
                idAjusteHora: true,
                deltaHoras: true,
                horasBase: true,
                justificacion: true,
                anuladoEn: true,
              },
            },
          },
        },
      },
    }),
    db.participacionProyecto.findMany({
      where: { rolProyecto: { idProyecto: projectId } },
      select: {
        idParticipacion: true,
        idUsuario: true,
        idRolProyecto: true,
        estadoParticipacion: true,
        fechaIngreso: true,
        fechaSalida: true,
        rolProyecto: { select: { nombreRol: true } },
        usuario: { select: { idUsuario: true, nombre: true, apellido: true } },
      },
    }),
    db.horasParticipacion.findMany({
      where: { participacion: { rolProyecto: { idProyecto: projectId } } },
      select: {
        idParticipacion: true,
        horasCalculadas: true,
        horasAprobadas: true,
        estadoHoras: true,
        participacion: { select: { idUsuario: true } },
      },
    }),
  ]);

  const cero = new Prisma.Decimal(0);
  let reportadas = cero;
  let legacy = cero;
  const porParticipacion = new Map<number, { usuario: number; reportadas: Prisma.Decimal; legacy: Prisma.Decimal }>();
  const tareasDistintas = new Set<number>();

  for (const tarea of tareas) {
    for (const tramo of tarea.asignaciones) {
      const efectivas = tramo.registrosTiempo
        .filter((registro) => registro.revocadoEn === null)
        .reduce((acc, registro) => acc.plus(registro.horas), cero);
      const legacyTramo = tramo.origenReporte === 'LEGACY' ? (tramo.horasReales ?? cero) : cero;
      reportadas = reportadas.plus(efectivas);
      legacy = legacy.plus(legacyTramo);
      tareasDistintas.add(tarea.idTarea);
      if (tramo.idParticipacion !== null) {
        const actual = porParticipacion.get(tramo.idParticipacion) ?? {
          usuario: tramo.idUsuario,
          reportadas: cero,
          legacy: cero,
        };
        porParticipacion.set(tramo.idParticipacion, {
          usuario: actual.usuario,
          reportadas: actual.reportadas.plus(efectivas),
          legacy: actual.legacy.plus(legacyTramo),
        });
      }
    }
  }

  const propuestaPorParticipacion = new Map<number, Prisma.Decimal>();
  for (const agregado of agregados) {
    propuestaPorParticipacion.set(agregado.idParticipacion, agregado.horasCalculadas ?? cero);
  }
  const propuestasTotales = [...propuestaPorParticipacion.values()].reduce(
    (acc, valor) => acc.plus(valor),
    cero,
  );

  const ejecucion: ClosureExecutionInput = {
    proyecto: {
      idProyecto: proyecto.idProyecto,
      tituloProyecto: proyecto.tituloProyecto,
      descripcionProyecto: proyecto.descripcionProyecto,
      objetivos: proyecto.objetivosProyecto,
      tipoProyecto: proyecto.tipoProyecto,
      modalidad: proyecto.modalidadProyecto,
      ubicacion: proyecto.ubicacionProyecto,
      contexto: proyecto.contextoAcademico,
      recursoExterno: proyecto.urlRecursoExterno,
      fechaInicio: proyecto.fechaInicio,
      fechaFin: null,
      estadoProyecto: proyecto.estadoProyecto,
    },
    lider: proyecto.creador,
    liderazgo,
    sprintsCerrados: sprints.map((sprint) => ({
      idSprint: sprint.idSprint,
      numero: sprint.numero,
      fechaInicio: sprint.fechaInicio,
      fechaFin: sprint.fechaCierre,
    })),
    hitos,
    tareas: tareas.map((tarea) => ({
      idTarea: tarea.idTarea,
      tituloTarea: tarea.tituloTarea,
      idSprint: tarea.idSprint,
      idRolProyecto: tarea.idRolProyecto,
      estadoTarea: tarea.estadoTarea,
      eliminada: tarea.eliminadoEn !== null,
      estimacionHoras: tarea.tiempoEstimadoHoras === null ? null : String(tarea.tiempoEstimadoHoras),
      tramos: tarea.asignaciones.map((tramo) => ({
        idAsignacion: tramo.idAsignacion,
        idUsuario: tramo.idUsuario,
        idParticipacion: tramo.idParticipacion,
        origenReporte: tramo.origenReporte,
        horasReportadas: (tramo.horasReales ?? cero).toString(),
        reconocidoEn: tramo.reconocidoEn,
        registros: tramo.registrosTiempo.map((registro) => ({
          idRegistroTiempo: registro.idRegistroTiempo,
          horas: registro.horas.toString(),
          fecha: registro.fecha,
          nota: registro.nota,
          justificacionExceso: registro.justificacionExceso,
          revocadoEn: registro.revocadoEn,
        })),
        ajustes: tramo.ajustes.map((ajuste) => ({
          idAjusteHora: ajuste.idAjusteHora,
          deltaHoras: ajuste.deltaHoras.toString(),
          horasBase: ajuste.horasBase.toString(),
          justificacion: ajuste.justificacion,
          anuladoEn: ajuste.anuladoEn,
        })),
      })),
    })),
    participaciones: participaciones.map((fila) => ({
      idParticipacion: fila.idParticipacion,
      idUsuario: fila.idUsuario,
      idRolProyecto: fila.idRolProyecto,
      nombreRol: fila.rolProyecto.nombreRol,
      estadoParticipacion: fila.estadoParticipacion,
      fechaIngreso: fila.fechaIngreso,
      fechaSalida: fila.fechaSalida,
    })),
    propuestasPorParticipante: [...porParticipacion.entries()].map(([idParticipacion, valores]) => ({
      idParticipacion,
      idUsuario: valores.usuario,
      horasReportadas: valores.reportadas.toString(),
      horasLegacy: valores.legacy.toString(),
      horasPropuestas: (propuestaPorParticipacion.get(idParticipacion) ?? cero).toString(),
    })),
    totales: {
      horasReportadas: reportadas.toString(),
      horasLegacy: legacy.toString(),
      horasPropuestas: propuestasTotales.toString(),
      tareasDistintas: tareasDistintas.size,
    },
  };

  // §28: presentación ESTRECHA. Solo los nombres externos que este informe
  // muestra, capturados una vez; los nombres de rol y tarea son del proyecto
  // y viajan como datos operativos.
  const usuarios = new Map<number, string>();
  usuarios.set(proyecto.creador.idUsuario, `${proyecto.creador.nombre} ${proyecto.creador.apellido}`.trim());
  for (const fila of participaciones) {
    usuarios.set(fila.usuario.idUsuario, `${fila.usuario.nombre} ${fila.usuario.apellido}`.trim());
  }

  return {
    ejecucion,
    presentacion: {
      usuarios: [...usuarios.entries()].map(([id, nombre]) => ({ id, nombre })),
      catalogos: [],
    },
  };
}
