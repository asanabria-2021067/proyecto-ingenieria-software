import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class HoursRecognitionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suma AsignacionTarea.horasReales de los tramos de `participationId` que
   * pertenecen a `projectId`/`sprintId` (vía la relación real hacia Tarea),
   * ya están cerrados (desasignadaEn IS NOT NULL), tienen horas reales
   * registradas (horasReales IS NOT NULL) y todavía no fueron reconocidos
   * (reconocidoEn IS NULL — contrato persistido por A5.1/FND-09). Una única
   * consulta `aggregate` con `_sum`; PostgreSQL hace la suma, no hay
   * findMany+reduce ni loop de aplicación.
   *
   * `reconocidoEn: null` es el filtro central que A5 original no podía
   * expresar (BLOCKED) hasta que A5.1 añadió el marcador persistido; un
   * tramo con `reconocidoEn` no-null queda excluido, evitando que este
   * método vuelva a contar horas ya consumidas por un reconocimiento previo
   * (Flow A o Flow B/B10).
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
    const { projectId, sprintId, participationId } = input;

    const resultado = await this.prisma.asignacionTarea.aggregate({
      where: {
        idParticipacion: participationId,
        desasignadaEn: { not: null },
        horasReales: { not: null },
        reconocidoEn: null,
        tarea: {
          idProyecto: projectId,
          idSprint: sprintId,
        },
      },
      _sum: {
        horasReales: true,
      },
    });

    return resultado._sum.horasReales?.toNumber() ?? 0;
  }
}
