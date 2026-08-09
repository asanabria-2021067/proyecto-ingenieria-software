import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CerrarParticipacionDto } from './dto/cerrar-participacion.dto';

type TxClient = Prisma.TransactionClient;


@Injectable()
export class HorasService {
  private readonly logger = new Logger(HorasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}



  private async loadProjectOrThrow(projectId: number, tx?: TxClient) {
    const db = tx ?? this.prisma;
    const proyecto = await db.proyecto.findFirst({
      where: { idProyecto: projectId, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true, tituloProyecto: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Proyecto con id ${projectId} no encontrado`);
    }
    return proyecto;
  }

  private assertLeader(proyecto: { creadoPor: number }, userId: number) {
    if (proyecto.creadoPor !== userId) {
      throw new ForbiddenException('Solo el líder del proyecto puede cerrar una participación');
    }
  }

  private async loadParticipacionInProjectOrThrow(
    projectId: number,
    participacionId: number,
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const participacion = await db.participacionProyecto.findFirst({
      where: {
        idParticipacion: participacionId,
        rolProyecto: { idProyecto: projectId },
      },
      select: {
        idParticipacion: true,
        idUsuario: true,
        idRolProyecto: true,
        estadoParticipacion: true,
        usuario: { select: { nombre: true, apellido: true } },
      },
    });
    if (!participacion) {
      throw new NotFoundException(
        `Participación con id ${participacionId} no encontrada en el proyecto ${projectId}`,
      );
    }
    return participacion;
  }

  /**
   * Suma tiempoEstimadoHoras de tareas HECHO, no eliminadas, del proyecto,
   * donde el usuario tiene o tuvo (activa o cerrada) una AsignacionTarea
   * (regla 14: AsignacionTarea es la fuente de verdad de asignaciones).
   * Igual que Jira: el trabajo ya registrado se queda con quien lo hizo,
   * aunque después se haya cerrado la asignación o cambiado de rol.
   */
  private async calcularHorasDesdeTareas(
    projectId: number,
    userId: number,
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const tareas = await db.tarea.findMany({
      where: {
        idProyecto: projectId,
        eliminadoEn: null,
        estadoTarea: 'HECHO',
        asignaciones: { some: { idUsuario: userId } },
      },
      select: { idTarea: true, tituloTarea: true, tiempoEstimadoHoras: true },
    });

    const horasCalculadas = tareas.reduce(
      (sum, t) => sum + (t.tiempoEstimadoHoras ?? 0),
      0,
    );

    return { horasCalculadas, tareas };
  }

  /**
   * GET de previsualización para T-116: desglose antes de confirmar el
   * cierre. Solo lectura, no persiste nada.
   */
  async obtenerDesglose(projectId: number, participacionId: number, userId: number) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);
    const participacion = await this.loadParticipacionInProjectOrThrow(
      projectId,
      participacionId,
    );

    if (participacion.estadoParticipacion !== 'ACTIVO') {
      throw new BadRequestException(
        'Solo se puede previsualizar el cierre de una participación ACTIVO',
      );
    }

    const { horasCalculadas, tareas } = await this.calcularHorasDesdeTareas(
      projectId,
      participacion.idUsuario,
    );

    return {
      idParticipacion: participacion.idParticipacion,
      usuario: participacion.usuario,
      horasCalculadas,
      tareas: tareas.map((t) => ({
        idTarea: t.idTarea,
        tituloTarea: t.tituloTarea,
        horas: t.tiempoEstimadoHoras ?? 0,
      })),
    };
  }

  /**
   * Cierre real (Sección D, reglas 39-47): lleva la participación a
   * COMPLETADO (cierre normal — NUNCA transforma RETIRADO en COMPLETADO ni
   * toca el flujo de salida completa de T-113, regla 43). Calcula
   * horasCalculadas, persiste horasAprobadas (= ajuste si se justificó, o
   * el valor calculado si no hubo ajuste) y deja estadoHoras: APROBADA para
   * que T-106/dashboards sigan leyendo exactamente igual que hoy.
   */
  async cerrarParticipacion(
    projectId: number,
    participacionId: number,
    dto: CerrarParticipacionDto,
    userId: number,
  ) {
    const proyecto = await this.loadProjectOrThrow(projectId);
    this.assertLeader(proyecto, userId);

    const resultado = await this.runSerializable(async (tx) => {
      const participacion = await this.loadParticipacionInProjectOrThrow(
        projectId,
        participacionId,
        tx,
      );

      if (participacion.estadoParticipacion !== 'ACTIVO') {
        throw new BadRequestException(
          'Solo se puede cerrar una participación en estado ACTIVO',
        );
      }

      const { horasCalculadas } = await this.calcularHorasDesdeTareas(
        projectId,
        participacion.idUsuario,
        tx,
      );

      const huboAjuste =
        dto.horasReconocidas !== undefined && dto.horasReconocidas !== horasCalculadas;

      if (huboAjuste && !dto.justificacion) {
        throw new BadRequestException(
          'El ajuste de horas requiere una justificación (mínimo 10 caracteres)',
        );
      }

      const horasReconocidas = dto.horasReconocidas ?? horasCalculadas;
      const ahora = new Date();

      const registroHoras = await tx.horasParticipacion.create({
        data: {
          idParticipacion: participacion.idParticipacion,
          periodoInicio: ahora,
          periodoFin: ahora,
          horasReportadas: horasCalculadas,
          horasAprobadas: horasReconocidas,
          horasCalculadas,
          justificacionAjuste: huboAjuste ? dto.justificacion : null,
          estadoHoras: 'APROBADA',
          aprobadoPor: userId,
          fechaAprobacion: ahora,
        },
      });

      await tx.participacionProyecto.update({
        where: { idParticipacion: participacion.idParticipacion },
        data: { estadoParticipacion: 'COMPLETADO', fechaSalida: ahora },
      });

      return { participacion, registroHoras, horasReconocidas, huboAjuste };
    });

    await this.safeNotify(async () => {
      await this.notifications.notifyFromTemplate(
        [resultado.participacion.idUsuario],
        'HORAS_VALIDADAS',
        {
          projectTitle: proyecto.tituloProyecto,
          projectId,
          horasReconocidas: resultado.horasReconocidas,
          fueAjustado: resultado.huboAjuste,
        },
      );
    });

    return {
      idParticipacion: resultado.participacion.idParticipacion,
      estadoParticipacion: 'COMPLETADO' as const,
      horasCalculadas: resultado.registroHoras.horasCalculadas,
      horasReconocidas: resultado.horasReconocidas,
      justificacionAjuste: resultado.registroHoras.justificacionAjuste,
    };
  }

  // ───────────────────────── aislamiento transaccional ─────────────────────────
  // Mismo patrón que RolesService.runSerializable (Sección J, regla 80):
  // SERIALIZABLE + reintento acotado (máx. 3) solo ante P2034 (write
  // conflict/deadlock). No se rompe el encapsulamiento del helper privado de
  // RolesService; se implementa un equivalente aquí, como permite la regla.
  private async runSerializable<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const maxIntentos = 3;
    let ultimoError: unknown;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const esConflicto =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!esConflicto || intento === maxIntentos) throw error;
        ultimoError = error;
        this.logger.warn(`Reintentando transacción SERIALIZABLE (intento ${intento})`);
      }
    }
    throw ultimoError;
  }

  /**
   * Notificación best-effort posterior al commit: si falla, se registra y
   * se continúa; nunca revierte el cierre ya persistido. Mismo patrón que
   * RolesService.safeNotify.
   */
  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error('Fallo al emitir notificación (cierre no revertido)', error as Error);
    }
  }
}
