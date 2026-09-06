import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { captureClosureExecution } from './closure-execution-capture';
import { matchesStoredExecutionFingerprint, type ClosureReportContext } from './closure-report-model';

/** Versión del generador; entra en la huella de ejecución. */
export const CLOSURE_GENERATOR_VERSION = 'closure-report/1.0.0';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * C127 (06 v2 §22): evaluador ÚNICO de preparación para cerrar un proyecto.
 *
 * Existe uno solo porque la consulta que la interfaz muestra y el assert que
 * bloquea la escritura deben responder exactamente lo mismo: si divergieran,
 * el líder vería «todo listo» y la operación fallaría por una regla que nadie
 * le enseñó. Lo que cambia entre fases son las PRECONDICIONES de estado, no
 * las reglas de integridad.
 *
 * Una consulta nunca cambia nada: leer la preparación es leer.
 *
 * C129: los dieciséis códigos y la advertencia, evaluados de una vez.
 */

export type ClosurePhase = 'REQUEST' | 'RESUBMIT' | 'APPROVE';

/** §22: catálogo cerrado de bloqueos. Ninguno se inventa en tiempo de ejecución. */
export const CLOSURE_BLOCKER_CODES = [
  'PROYECTO_ESTADO_INVALIDO',
  'SIN_SPRINTS',
  'SPRINTS_NO_CERRADOS',
  'TRAMOS_ABIERTOS',
  'TRAMOS_SIN_PARTICIPACION',
  'LEGACY_SIN_CONCILIAR',
  'HORAS_SIN_CONSOLIDAR',
  'HORAS_INCONSISTENTES',
  'TAREAS_SIN_TERMINAR',
  'TAREAS_SIN_TRAZABILIDAD',
  'SALIDAS_ABIERTAS',
  'APELACION_PENDIENTE',
  'REVISION_INVALIDA',
  'INFORME_INVALIDO',
  'EVIDENCIAS_INVALIDAS',
  'INFORME_DESACTUALIZADO',
] as const;
export type ClosureBlockerCode = (typeof CLOSURE_BLOCKER_CODES)[number];

/** La única advertencia: informa, no bloquea. */
export const CLOSURE_WARNING_PENDING_APPLICATIONS = 'POSTULACIONES_PENDIENTES';

export interface ClosureBlocker {
  code: ClosureBlockerCode;
  message: string;
  /** Identificadores concretos del problema: diagnóstico, no una recomendación. */
  ids: number[];
  cantidad: number;
}

export interface ClosureWarning {
  code: typeof CLOSURE_WARNING_PENDING_APPLICATIONS;
  message: string;
  ids: number[];
  cantidad: number;
}

export interface CloseReadinessSummary {
  projectId: number;
  revisionId: number | null;
  phase: ClosurePhase;
  canSubmit: boolean;
  blockers: ClosureBlocker[];
  warnings: ClosureWarning[];
  /** Huella del informe automático vinculado, cuando existe. */
  executionFingerprint: string | null;
}

export interface EvaluateReadinessInput {
  phase: ClosurePhase;
  revisionId?: number | null;
  expectedFingerprint?: string;
}

@Injectable()
export class ProjectCloseReadinessService {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Evaluación COMPLETA. Devuelve todos los bloqueos, nunca solo el primero:
   * un líder que corrige uno por uno, descubriendo el siguiente en cada
   * intento, no está siendo informado sino adivinando.
   */
  async evaluate(
    tx: Prisma.TransactionClient | undefined,
    projectId: number,
    input: EvaluateReadinessInput,
  ): Promise<CloseReadinessSummary> {
    const db: Db = tx ?? this.prisma;
    const blockers: ClosureBlocker[] = [];
    const warnings: ClosureWarning[] = [];
    const bloquear = (code: ClosureBlockerCode, message: string, ids: number[] = []) => {
      blockers.push({ code, message, ids, cantidad: ids.length });
    };

    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, estadoProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }

    // Precondición de FASE: lo único que cambia entre las tres.
    const estadoEsperado = input.phase === 'REQUEST' ? 'EN_PROGRESO' : 'EN_SOLICITUD_CIERRE';
    if (proyecto.estadoProyecto !== estadoEsperado) {
      bloquear(
        'PROYECTO_ESTADO_INVALIDO',
        `El proyecto debe estar en ${estadoEsperado} para la fase ${input.phase}`,
      );
    }

    const revision = await this.resolveRevision(db, projectId, input);
    if (revision === null) {
      bloquear('REVISION_INVALIDA', 'No existe la revisión que esta fase requiere');
    } else if (input.revisionId !== undefined && input.revisionId !== null && revision.idRevisionCierre !== input.revisionId) {
      bloquear('REVISION_INVALIDA', 'La revisión indicada no es la que esta fase requiere', [
        input.revisionId,
      ]);
    }

    const [sprints, tramos, tareas, salidas, apelaciones, postulaciones, agregados] = await Promise.all([
      db.sprint.findMany({
        where: { idProyecto: projectId },
        select: { idSprint: true, estado: true },
      }),
      db.asignacionTarea.findMany({
        // Sin filtro de eliminadoEn: una tarea borrada con horas abiertas
        // sigue siendo trabajo sin cerrar.
        where: { tarea: { idProyecto: projectId } },
        select: {
          idAsignacion: true,
          idParticipacion: true,
          desasignadaEn: true,
          horasReales: true,
          reconocidoEn: true,
          origenReporte: true,
          registrosTiempo: { where: { revocadoEn: null }, select: { horas: true } },
          participacion: { select: { rolProyecto: { select: { idProyecto: true } } } },
        },
      }),
      db.tarea.findMany({
        where: { idProyecto: projectId, eliminadoEn: null },
        select: { idTarea: true, estadoTarea: true, _count: { select: { asignaciones: true } } },
      }),
      db.solicitudSalidaProyecto.findMany({
        where: {
          idProyecto: projectId,
          estadoSolicitud: { in: ['PREPARACION', 'PENDIENTE_LIDER'] },
        },
        select: { idSolicitud: true },
      }),
      db.apelacionLiderazgo.findMany({
        where: { idProyecto: projectId, estadoApelacion: 'PENDIENTE' },
        select: { idApelacion: true },
      }),
      db.postulacion.findMany({
        where: { estadoPostulacion: 'PENDIENTE', rolProyecto: { idProyecto: projectId } },
        select: { idPostulacion: true },
      }),
      // Agregados históricos del proyecto todavía pendientes: su procedencia
      // debe poder demostrarse antes de cerrar (06 v2 §14/§22).
      db.horasParticipacion.findMany({
        where: {
          estadoHoras: 'PENDIENTE',
          participacion: { rolProyecto: { idProyecto: projectId } },
        },
        select: { idRegistroHoras: true, idParticipacion: true, idSprint: true },
      }),
    ]);

    if (sprints.length === 0) {
      bloquear('SIN_SPRINTS', 'El proyecto no tiene ningún Sprint');
    }
    const abiertos = sprints.filter((sprint) => sprint.estado !== 'CERRADO');
    if (abiertos.length > 0) {
      bloquear(
        'SPRINTS_NO_CERRADOS',
        'Todos los Sprints deben estar cerrados antes de cerrar el proyecto',
        abiertos.map((sprint) => sprint.idSprint),
      );
    }

    const cero = new Prisma.Decimal(0);
    const tramosAbiertos = tramos.filter((tramo) => tramo.desasignadaEn === null);
    if (tramosAbiertos.length > 0) {
      bloquear(
        'TRAMOS_ABIERTOS',
        'Existen tramos de trabajo todavía abiertos',
        tramosAbiertos.map((tramo) => tramo.idAsignacion),
      );
    }
    // FK nula o cruzada a otro proyecto: la contribución no sabe a quién pertenece.
    const sinParticipacion = tramos.filter(
      (tramo) =>
        (tramo.horasReales !== null || tramo.registrosTiempo.length > 0) &&
        (tramo.idParticipacion === null ||
          tramo.participacion?.rolProyecto.idProyecto !== projectId),
    );
    if (sinParticipacion.length > 0) {
      bloquear(
        'TRAMOS_SIN_PARTICIPACION',
        'Existen contribuciones sin participación histórica resuelta',
        sinParticipacion.map((tramo) => tramo.idAsignacion),
      );
    }
    // LEGACY_SIN_CONCILIAR tiene dos mitades (06 v2 §22): tramos cuya
    // procedencia sigue en disputa, y agregados pendientes «sin procedencia o
    // idSprint válida».
    //
    // De la segunda mitad se implementa el predicado inequívoco: un agregado
    // PENDIENTE sin Sprint no puede consumirse ni acreditarse, porque nada
    // dice a qué período pertenece. NO se exige además que exista un tramo de
    // esa misma participación en ese mismo Sprint: un agregado legítimo puede
    // provenir del reconocimiento anticipado de una salida (Flow B, 06 v2 §13),
    // donde la participación queda RETIRADA y sus horas se consolidan sin que
    // sobreviva un tramo abierto de ese Sprint. Endurecerlo ahí bloquearía un
    // cierre correcto, que es exactamente lo que §14 prohíbe hacer con datos
    // cuya historia sí es demostrable.
    const porConciliar = tramos.filter((tramo) => tramo.origenReporte === 'POR_CONCILIAR');
    const agregadosSinSprint = agregados.filter((agregado) => agregado.idSprint === null);
    if (porConciliar.length > 0 || agregadosSinSprint.length > 0) {
      bloquear(
        'LEGACY_SIN_CONCILIAR',
        'Existen tramos legacy sin conciliar o agregados pendientes sin Sprint asignado',
        [
          ...porConciliar.map((tramo) => tramo.idAsignacion),
          ...agregadosSinSprint.map((agregado) => agregado.idRegistroHoras),
        ],
      );
    }
    const sinConsolidar = tramos.filter(
      (tramo) => tramo.horasReales !== null && tramo.reconocidoEn === null,
    );
    if (sinConsolidar.length > 0) {
      bloquear(
        'HORAS_SIN_CONSOLIDAR',
        'Existen horas reportadas que ningún Sprint consolidó',
        sinConsolidar.map((tramo) => tramo.idAsignacion),
      );
    }
    // La caché granular debe cuadrar con la suma efectiva de sus registros.
    const inconsistentes = tramos.filter((tramo) => {
      if (tramo.origenReporte !== 'GRANULAR') {
        return false;
      }
      const suma = tramo.registrosTiempo.reduce((acc, registro) => acc.plus(registro.horas), cero);
      const cache = tramo.horasReales ?? cero;
      return !cache.equals(suma);
    });
    if (inconsistentes.length > 0) {
      bloquear(
        'HORAS_INCONSISTENTES',
        'La caché de horas no coincide con la suma de los registros efectivos',
        inconsistentes.map((tramo) => tramo.idAsignacion),
      );
    }

    const sinTerminar = tareas.filter((tarea) => tarea.estadoTarea !== 'HECHO');
    if (sinTerminar.length > 0) {
      bloquear(
        'TAREAS_SIN_TERMINAR',
        'Existen tareas operativas que no están hechas',
        sinTerminar.map((tarea) => tarea.idTarea),
      );
    }
    const sinTrazabilidad = tareas.filter(
      (tarea) => tarea.estadoTarea === 'HECHO' && tarea._count.asignaciones === 0,
    );
    if (sinTrazabilidad.length > 0) {
      bloquear(
        'TAREAS_SIN_TRAZABILIDAD',
        'Existen tareas hechas sin ninguna asignación histórica',
        sinTrazabilidad.map((tarea) => tarea.idTarea),
      );
    }
    if (salidas.length > 0) {
      bloquear(
        'SALIDAS_ABIERTAS',
        'Existen solicitudes de salida sin resolver',
        salidas.map((salida) => salida.idSolicitud),
      );
    }
    if (apelaciones.length > 0) {
      bloquear(
        'APELACION_PENDIENTE',
        'Existe una apelación de liderazgo pendiente',
        apelaciones.map((apelacion) => apelacion.idApelacion),
      );
    }

    // Documentos: exactamente un informe automático disponible y entre una y
    // diez evidencias, todas disponibles y vinculadas a ESTA revisión.
    let executionFingerprint: string | null = null;
    if (revision !== null) {
      const vinculos = await db.documentoRevisionCierre.findMany({
        where: { idRevisionCierre: revision.idRevisionCierre },
        select: {
          idDocumentoCierre: true,
          orden: true,
          documento: {
            select: {
              idDocumentoCierre: true,
              idProyecto: true,
              tipoDocumento: true,
              estadoDocumento: true,
              mimeType: true,
              fingerprintEjecucion: true,
              contextoReporte: true,
            },
          },
        },
      });
      const automaticos = vinculos.filter(
        (vinculo) => vinculo.documento.tipoDocumento === 'INFORME_AUTOMATICO',
      );
      const disponiblesAutomaticos = automaticos.filter(
        (vinculo) =>
          vinculo.documento.estadoDocumento === 'DISPONIBLE' &&
          vinculo.documento.idProyecto === projectId,
      );
      if (automaticos.length !== 1 || disponiblesAutomaticos.length !== 1 ||
          disponiblesAutomaticos[0]?.orden !== 0 || !disponiblesAutomaticos[0]?.documento.fingerprintEjecucion) {
        bloquear(
          'INFORME_INVALIDO',
          'La entrega necesita exactamente un informe automático disponible',
          automaticos.map((vinculo) => vinculo.idDocumentoCierre),
        );
      } else {
        executionFingerprint = disponiblesAutomaticos[0].documento.fingerprintEjecucion;
      }

      const evidencias = vinculos.filter(
        (vinculo) => vinculo.documento.tipoDocumento === 'EVIDENCIA_LIDER',
      );
      const evidenciasValidas = evidencias.filter(
        (vinculo) =>
          vinculo.documento.estadoDocumento === 'DISPONIBLE' &&
          vinculo.documento.mimeType === 'application/pdf' &&
          vinculo.documento.idProyecto === projectId,
      );
      if (evidenciasValidas.length < 1 || evidenciasValidas.length > 10 ||
          evidenciasValidas.length !== evidencias.length ||
          vinculos.length !== automaticos.length + evidencias.length ||
          evidencias.some((link) => link.orden < 1 || link.orden > 10)) {
        bloquear(
          'EVIDENCIAS_INVALIDAS',
          'La entrega necesita entre una y diez evidencias disponibles en PDF',
          evidencias.map((vinculo) => vinculo.idDocumentoCierre),
        );
      }

      // La huella se compara contra el modelo canónico ACTUAL: si la
      // ejecución cambió después de generar el informe, la entrega describe
      // un proyecto que ya no existe.
      if (executionFingerprint !== null) {
        const contexto = disponiblesAutomaticos[0].documento.contextoReporte as unknown as ClosureReportContext | null;
        const capturado = await captureClosureExecution(db, projectId);
        const matchesStored = contexto?.schemaVersion === 1 && contexto.presentacion
          ? matchesStoredExecutionFingerprint({
          generatorVersion: CLOSURE_GENERATOR_VERSION,
          projectId,
          cicloRevisionOrigenId: contexto.cicloRevisionOrigenId,
          datosEjecucion: capturado.ejecucion,
          presentacion: contexto.presentacion,
        }, executionFingerprint) : false;
        if (!matchesStored ||
          (input.expectedFingerprint !== undefined && input.expectedFingerprint !== executionFingerprint)) {
          bloquear(
            'INFORME_DESACTUALIZADO',
            'El informe automático no refleja la ejecución actual del proyecto',
            [disponiblesAutomaticos[0].idDocumentoCierre],
          );
        }
      }
    }

    // La única advertencia: informa y no bloquea.
    if (input.phase === 'REQUEST' && postulaciones.length > 0) {
      warnings.push({
        code: CLOSURE_WARNING_PENDING_APPLICATIONS,
        message: 'Hay postulaciones pendientes que se rechazarán al solicitar el cierre',
        ids: postulaciones.map((fila) => fila.idPostulacion),
        cantidad: postulaciones.length,
      });
    } else if (input.phase !== 'REQUEST' && postulaciones.length > 0) {
      // Fuera de REQUEST una pendiente superviviente es inconsistencia dura.
      bloquear(
        'LEGACY_SIN_CONCILIAR',
        'Quedaron postulaciones pendientes después de solicitar el cierre',
        postulaciones.map((fila) => fila.idPostulacion),
      );
    }

    return {
      projectId,
      revisionId: revision?.idRevisionCierre ?? null,
      phase: input.phase,
      canSubmit: blockers.length === 0,
      blockers,
      warnings,
      executionFingerprint,
    };
  }

  /** La revisión que la fase requiere: BORRADOR para entregar, ENVIADA para aprobar. */
  private async resolveRevision(
    db: Db,
    projectId: number,
    input: EvaluateReadinessInput,
  ): Promise<{ idRevisionCierre: number; numeroRevision: number } | null> {
    const estado = input.phase === 'APPROVE' ? 'ENVIADA' : 'BORRADOR';
    return db.revisionCierreProyecto.findFirst({
      where: { idProyecto: projectId, estadoRevision: estado },
      orderBy: { numeroRevision: 'desc' },
      select: { idRevisionCierre: true, numeroRevision: true },
    });
  }

  /**
   * Mismo evaluador como assert. La escritura recibe la lista COMPLETA dentro
   * del conflicto: quien no puede cerrar merece saber todo lo que falta, no
   * un motivo a la vez.
   */
  async assertReady(
    tx: Prisma.TransactionClient,
    projectId: number,
    input: EvaluateReadinessInput,
  ): Promise<CloseReadinessSummary> {
    const resumen = await this.evaluate(tx, projectId, input);
    if (!resumen.canSubmit) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CIERRE_NO_LISTO',
        message: 'El proyecto no cumple las condiciones para esta operación de cierre',
        blockers: resumen.blockers,
      });
    }
    return resumen;
  }
}
