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
    input: CalculateRecognizableHoursInput,
  ): Promise<RecognizeParticipationHoursResult> {
    const { participationId, sprintId } = input;

    const elegibles = await tx.asignacionTarea.findMany({
      where: this.buildEligibleAssignmentsWhere(input),
      select: { idAsignacion: true, horasReales: true },
    });

    if (elegibles.length === 0) {
      return { horasReconocidas: 0, idsAsignacionesReconocidas: [], horasParticipacion: null };
    }

    const idsAsignaciones = elegibles.map((a) => a.idAsignacion);
    const totalDecimal = elegibles.reduce(
      (acumulado, a) => acumulado.plus(a.horasReales ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const horasReconocidas = totalDecimal.toNumber();

    const marcado = await tx.asignacionTarea.updateMany({
      where: {
        idAsignacion: { in: idsAsignaciones },
        reconocidoEn: null,
      },
      data: { reconocidoEn: new Date() },
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
      horasParticipacion = await tx.horasParticipacion.update({
        where: { idRegistroHoras: existente.idRegistroHoras },
        data: { horasCalculadas: { increment: totalDecimal } },
      });
    } else {
      try {
        horasParticipacion = await tx.horasParticipacion.create({
          data: {
            idParticipacion: participationId,
            idSprint: sprintId,
            periodoInicio: hoy,
            periodoFin: hoy,
            horasReportadas: totalDecimal,
            horasCalculadas: totalDecimal,
          },
        });
      } catch (error) {
        if (!this.isHorasParticipacionSprintCollision(error)) {
          throw error;
        }
        // Otra transacción creó la fila (idParticipacion, idSprint)
        // concurrentemente entre nuestro findFirst y este create — se
        // convierte en un increment sobre la fila ganadora, en vez de
        // propagar el P2002 crudo.
        const ganadora = await tx.horasParticipacion.findFirstOrThrow({
          where: { idParticipacion: participationId, idSprint: sprintId },
        });
        horasParticipacion = await tx.horasParticipacion.update({
          where: { idRegistroHoras: ganadora.idRegistroHoras },
          data: { horasCalculadas: { increment: totalDecimal } },
        });
      }
    }

    return {
      horasReconocidas,
      idsAsignacionesReconocidas: idsAsignaciones,
      horasParticipacion,
    };
  }

  /**
   * Reconoce específicamente la violación del índice único parcial
   * `horas_participacion_sprint_unique` (idParticipacion, idSprint) — mismo
   * criterio estrecho que `SprintsService.isOperableSprintCollision`: no
   * basta `code === 'P2002'`, se exige además modelo HorasParticipacion y
   * ambas columnas del target. Cualquier otro P2002 (u otro código) se
   * relanza sin cambios.
   */
  private isHorasParticipacionSprintCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code !== 'P2002') {
      return false;
    }

    const modelName = error.meta?.modelName;
    const target = error.meta?.target;

    return (
      modelName === 'HorasParticipacion' &&
      Array.isArray(target) &&
      target.length === 2 &&
      target.includes('id_participacion') &&
      target.includes('id_sprint')
    );
  }
}
