import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

/**
 * Identidad completa del cálculo de horas reconocibles: los tres
 * identificadores forman el contexto exigido por A5 (Sync Gate 1). No
 * incluye userId/roleId/assignmentId/approvedHours/justification — esos
 * pertenecen a capas posteriores (B10/A7+), no a este cálculo interno.
 */
export interface CalculateRecognizableHoursInput {
  projectId: number;
  sprintId: number;
  participationId: number;
}

/**
 * C080: el orquestador de cierre pasa UN instante para todo el lote, de modo
 * que la consolidación completa de un Sprint quede sellada con la misma marca
 * temporal. Omitido, cada llamada usa el suyo (Flow B, reconocimiento suelto).
 */
export interface RecognizeParticipationHoursInput extends CalculateRecognizableHoursInput {
  reconocidoEn?: Date;
}

/**
 * Resultado de `recognizeParticipationHours` (SYNC GATE 1). `horasReconocidas`
 * es el DELTA reconocido en ESTA llamada (0 si no había nada elegible — un
 * no-op real, no una reescritura a 0 de un total ya persistido).
 * `idsAsignacionesReconocidas` son los tramos que esta llamada marcó
 * (`reconocidoEn`), útil para trazabilidad/logging en el caller (B10).
 * `horasParticipacion` es la fila resultante tras crear/incrementar; `null`
 * únicamente cuando no había nada elegible y no se tocó ninguna fila.
 */
export interface RecognizeParticipationHoursResult {
  horasReconocidas: number;
  /** C077 (§12.2): suma de cachés — lo que el integrante reportó. */
  horasReportadas: Prisma.Decimal;
  /** C077 (§12.2): suma de (caché + ajuste vigente válido) — lo que se propone. */
  horasPropuestas: Prisma.Decimal;
  idsAsignacionesReconocidas: number[];
  horasParticipacion: Prisma.HorasParticipacionGetPayload<Record<string, never>> | null;
}

@Injectable()
export class HoursRecognitionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Where compartido por `calculateRecognizableHours` (aggregate, cálculo
   * puro) y `recognizeParticipationHours` (findMany + marca productiva) —
   * única fuente de verdad de "qué tramos son reconocibles" (A5), para que
   * ninguna de las dos operaciones pueda divergir silenciosamente sobre
   * cuáles tramos cuentan. Tramos elegibles: pertenecen a `participationId`,
   * ya están cerrados (`desasignadaEn IS NOT NULL`), tienen horas reales
   * registradas, todavía no fueron reconocidos (`reconocidoEn IS NULL` —
   * A5.1/FND-09) y su Tarea pertenece exactamente a `projectId`/`sprintId`.
   */
  private buildEligibleAssignmentsWhere(
    input: CalculateRecognizableHoursInput,
  ): Prisma.AsignacionTareaWhereInput {
    const { projectId, sprintId, participationId } = input;
    return {
      idParticipacion: participationId,
      desasignadaEn: { not: null },
      horasReales: { not: null },
      reconocidoEn: null,
      tarea: {
        idProyecto: projectId,
        idSprint: sprintId,
      },
    };
  }

  /**
   * Suma AsignacionTarea.horasReales de los tramos elegibles (ver
   * `buildEligibleAssignmentsWhere`). Una única consulta `aggregate` con
   * `_sum`; PostgreSQL hace la suma, no hay findMany+reduce ni loop de
   * aplicación.
   *
   * Contrato A5 congelado — firma, comportamiento y uso exclusivo de
   * `this.prisma` (el PrismaService raíz, nunca un `tx` externo) sin
   * cambios: sigue siendo el cálculo puro de solo lectura consumido por
   * cualquier caller que no necesite participar en una transacción externa
   * (p. ej. lectura standalone). SYNC GATE 1 no lo reemplaza — publica
   * `recognizeParticipationHours` como una operación productiva adicional
   * que internamente reutiliza el mismo criterio de elegibilidad, nunca
   * una segunda definición divergente.
   *
   * Retorna directamente el total como `number` (nunca la estructura
   * `{ _sum: ... }` de Prisma, nunca `Prisma.Decimal`): `_sum.horasReales`
   * es `Decimal | null`; se convierte con `.toNumber()` (misma convención
   * ya usada en `ProjectsService`/`ExitRequestsService` para este mismo
   * campo) y `null` (sin tramos elegibles) se normaliza a `0`, para que el
   * consumidor nunca tenga que distinguir `null` de `0`.
   *
   * No se valida la existencia de `participationId`/`projectId`/`sprintId`
   * por separado: es un cálculo interno, no un endpoint, y un contexto que
   * no corresponde a ningún tramo real simplemente agrega 0 filas — el
   * aislamiento ya lo garantiza el propio `where` (una participación de
   * otro proyecto/Sprint nunca pasa el filtro relacional hacia Tarea).
   *
   * No se filtra `Tarea.eliminadoEn`: A5 calcula un histórico de
   * contribuciones ya cerradas, y no existe ninguna regla explícita en el
   * dominio de horas/asignaciones (a diferencia de las operaciones activas
   * de `tasks/`) que excluya horas ya trabajadas solo porque la tarea que
   * las originó fue posteriormente soft-deleted.
   */
  async calculateRecognizableHours(
    input: CalculateRecognizableHoursInput,
  ): Promise<number> {
    const resultado = await this.prisma.asignacionTarea.aggregate({
      where: this.buildEligibleAssignmentsWhere(input),
      _sum: {
        horasReales: true,
      },
    });

    return resultado._sum.horasReales?.toNumber() ?? 0;
  }

  /**
   * C076 (06 v2 §12): las participaciones reconocibles se derivan de los
   * TRAMOS, no de la lista de participantes ACTIVO. La diferencia no es
   * cosmética: quien se retiró o completó su participación dejando trabajo sin
   * consumir tiene derecho a que se le reconozca, y un miembro activo que no
   * trabajó en este Sprint no debe generar ningún agregado.
   *
   * Se excluyen los tramos ya consumidos (`reconocidoEn` no nulo, típicamente
   * por una salida anticipada de Flow B) y los de origen sin conciliar, cuya
   * procedencia todavía no está determinada.
   *
   * El orden ascendente es deliberado: fija un orden de bloqueo determinista
   * para el lote y hace la enumeración reproducible entre ejecuciones.
   */
  async listEligibleParticipationsTx(
    tx: TxClient,
    input: { projectId: number; sprintId: number },
  ): Promise<number[]> {
    const tramos = await tx.asignacionTarea.findMany({
      where: {
        idParticipacion: { not: null },
        desasignadaEn: { not: null },
        horasReales: { not: null },
        reconocidoEn: null,
        origenReporte: { not: 'POR_CONCILIAR' },
        // Sin filtro de `eliminadoEn`: borrar la tarea no borra las horas ya
        // trabajadas en ella.
        tarea: { idProyecto: input.projectId, idSprint: input.sprintId },
      },
      distinct: ['idParticipacion'],
      orderBy: { idParticipacion: 'asc' },
      select: { idParticipacion: true },
    });
    return tramos
      .map((tramo) => tramo.idParticipacion)
      .filter((id): id is number => id !== null);
  }

  /**
   * SYNC GATE 1: operación productiva transaction-aware que B10 (Flow B)
   * puede invocar dentro de SU PROPIA transacción externa (resolución de
   * solicitud de salida), junto con el retiro de participaciones, sin abrir
   * una segunda `$transaction` independiente. TODA operación Prisma de este
   * método usa exclusivamente el `tx` recibido — nunca `this.prisma` — para
   * que un rollback del caller revierta atómicamente tanto la marca de
   * reconocimiento como la persistencia de horas.
   *
   * Encapsula, en un único paso productivo:
   *   1) detectar los tramos elegibles (mismo criterio que
   *      `calculateRecognizableHours`, vía `buildEligibleAssignmentsWhere`);
   *   2) calcular el total reconocible (suma de `horasReales` de esos
   *      tramos, con `Prisma.Decimal` — nunca floating point);
   *   3) marcar esos tramos como reconocidos (A6): `updateMany` CONDICIONADO
   *      por `reconocidoEn: null` en el propio `where` — nunca
   *      `find -> if -> update`. Si `count` no coincide exactamente con la
   *      cantidad de tramos detectados en el paso 1, significa que otra
   *      transacción reconoció alguno de esos mismos tramos entre la
   *      detección y la marca (dentro de esta misma tx no hay nada que los
   *      toque) — se aborta con `ConflictException` en vez de persistir un
   *      total parcialmente inconsistente;
   *   4) crear o incrementar la fila de `HorasParticipacion` correspondiente
   *      a (idParticipacion, idSprint) — la relación real que exige el
   *      índice único parcial `horas_participacion_sprint_unique` (A7.1):
   *      a lo sumo una fila por (participación, Sprint) cuando idSprint no
   *      es null. Como esa unicidad es un índice PARCIAL (no un `@@unique`
   *      de Prisma, que no admite condición), no existe `upsert()` nativo
   *      contra ella: se hace `findFirst` + `create`/`update` explícito, y
   *      si dos transacciones concurrentes intentan crear la misma fila por
   *      primera vez, la que pierde la carrera recibe P2002 (reconocido
   *      específicamente, mismo criterio estrecho que
   *      `SprintsService.isOperableSprintCollision`) y reintenta como
   *      `update` con `increment`, en vez de propagar el error crudo.
   *      `horasCalculadas` se INCREMENTA (nunca se sobrescribe): un
   *      reconocimiento repetido que no encuentra tramos nuevos nunca toca
   *      esta fila (ver más abajo), así que el total ya persistido de un
   *      reconocimiento previo nunca se pierde ni se recalcula desde cero.
   *
   * Idempotencia de la operación completa: si no hay tramos elegibles
   * (`elegibles.length === 0` — ya sea porque nunca hubo, o porque una
   * llamada previa ya los reconoció todos), el método retorna
   * inmediatamente `{ horasReconocidas: 0, idsAsignacionesReconocidas: [],
   * horasParticipacion: null }` SIN tocar `HorasParticipacion` ni
   * `AsignacionTarea` — un verdadero no-op, nunca una fila sintética con 0
   * horas ni una sobrescritura del total ya correcto.
   *
   * `periodoInicio`/`periodoFin` (columnas `@db.Date`, NOT NULL, sin default
   * en el schema): al no existir todavía un contrato de "periodo reportado"
   * para reconocimiento anticipado (B10), se fijan ambos a la fecha UTC del
   * momento del reconocimiento — decisión mínima y explícita, no una
   * interpretación de un contrato que no existe; puede revisarse cuando B10
   * defina su propio flujo de periodos. `horasReportadas` (NOT NULL,
   * también sin default) se fija igual a las horas recién calculadas en la
   * creación inicial de la fila — nunca se reescribe en incrementos
   * posteriores, porque esa columna representa el reporte inicial, no el
   * acumulado (que vive en `horasCalculadas`).
   */
  async recognizeParticipationHours(
    tx: TxClient,
    input: RecognizeParticipationHoursInput,
  ): Promise<RecognizeParticipationHoursResult> {
    const { participationId, sprintId } = input;

    // §12.1: tramos cerrados, con caché, no consumidos, con FK y origen
    // resueltos. La tarea puede estar eliminada: las horas trabajadas no
    // desaparecen porque después se borrara la tarea.
    const elegibles = await tx.asignacionTarea.findMany({
      where: {
        ...this.buildEligibleAssignmentsWhere(input),
        origenReporte: { not: 'POR_CONCILIAR' },
      },
      select: {
        idAsignacion: true,
        horasReales: true,
        ajustes: { where: { anuladoEn: null }, select: { horasBase: true, deltaHoras: true } },
      },
    });

    if (elegibles.length === 0) {
      // No-op REAL: ni fila cero ficticia ni reescritura de un total correcto.
      return {
        horasReconocidas: 0,
        horasReportadas: new Prisma.Decimal(0),
        horasPropuestas: new Prisma.Decimal(0),
        idsAsignacionesReconocidas: [],
        horasParticipacion: null,
      };
    }

    const idsAsignaciones = elegibles.map((a) => a.idAsignacion);
    let horasReportadas = new Prisma.Decimal(0);
    let horasPropuestas = new Prisma.Decimal(0);
    for (const tramo of elegibles) {
      const cache = tramo.horasReales ?? new Prisma.Decimal(0);
      horasReportadas = horasReportadas.plus(cache);
      const vigente = tramo.ajustes[0];
      if (vigente && !vigente.horasBase.equals(cache)) {
        // §11: la base del ajuste es la evidencia del reporte que el líder vio.
        // Si el reporte cambió después, aplicar el delta sobre otro importe
        // sería una aproximación inventada. Se rechaza y el líder relee.
        throw new ConflictException({
          statusCode: 409,
          code: 'AJUSTE_DESACTUALIZADO',
          message: 'Un ajuste vigente se calculó sobre un reporte distinto del actual',
          idAsignacion: tramo.idAsignacion,
        });
      }
      horasPropuestas = horasPropuestas.plus(cache).plus(vigente?.deltaHoras ?? 0);
    }
    const horasReconocidas = horasReportadas.toNumber();

    // §12.3: CAS sobre TODOS los ids con una FECHA COMÚN. El conteo exacto es
    // la garantía: si alguien consumió uno de estos tramos entretanto, se
    // aborta en vez de persistir un total parcial.
    const reconocidoEn = input.reconocidoEn ?? new Date();
    const marcado = await tx.asignacionTarea.updateMany({
      where: { idAsignacion: { in: idsAsignaciones }, reconocidoEn: null },
      data: { reconocidoEn },
    });

    if (marcado.count !== idsAsignaciones.length) {
      throw new ConflictException(
        'El conjunto de horas reconocibles cambió durante el reconocimiento; reintenta la operación',
      );
    }

    const hoy = new Date(new Date().toISOString().slice(0, 10));

    const existente = await tx.horasParticipacion.findFirst({
      where: { idParticipacion: participationId, idSprint: sprintId },
    });

    let horasParticipacion;
    if (existente) {
      if (existente.estadoHoras !== 'PENDIENTE') {
        throw new ConflictException({
          statusCode: 409,
          code: 'AGREGADO_NO_PENDIENTE',
          message: 'El agregado de horas de esta participación ya no está pendiente',
          idRegistroHoras: existente.idRegistroHoras,
        });
      }
      if (existente.horasCalculadas === null) {
        // Fila legacy sin procedencia: no se sabe qué compone su total, así
        // que incrementarla mezclaría un cálculo nuevo con un origen opaco.
        throw new ConflictException({
          statusCode: 409,
          code: 'AGREGADO_LEGACY_SIN_PROCEDENCIA',
          message: 'El agregado existente no tiene procedencia calculada y no puede incrementarse',
          idRegistroHoras: existente.idRegistroHoras,
        });
      }
      // §8: en reconocimientos sucesivos se incrementan AMBAS columnas.
      horasParticipacion = await tx.horasParticipacion.update({
        where: { idRegistroHoras: existente.idRegistroHoras },
        data: {
          horasReportadas: { increment: horasReportadas },
          horasCalculadas: { increment: horasPropuestas },
        },
      });
    } else {
      // C078 (§12/§16): bajo el lock del proyecto no existe carrera normal de
      // primera creación, así que un P2002 aquí es inesperado y debe abortar
      // TODA la transacción. No se captura: PostgreSQL ya marcó la tx como
      // fallida, y cualquier consulta posterior dentro de ella solo produce un
      // error opaco de «transacción abortada» que oculta la causa real. El
      // índice único parcial sigue protegiendo la cardinalidad; la
      // idempotencia la da el CAS de `reconocidoEn`, no este catch.
      horasParticipacion = await tx.horasParticipacion.create({
        data: {
          idParticipacion: participationId,
          // Nunca una fila con idSprint NULL (§8).
          idSprint: sprintId,
          periodoInicio: hoy,
          periodoFin: hoy,
          horasReportadas,
          horasCalculadas: horasPropuestas,
          // horasAprobadas/fechaAprobacion/aprobadoPor NO se tocan:
          // reconocer no es acreditar. Solo approveClosure acredita (§31).
        },
      });
    }

    return {
      horasReconocidas,
      horasReportadas,
      horasPropuestas,
      idsAsignacionesReconocidas: idsAsignaciones,
      horasParticipacion,
    };
  }
}
