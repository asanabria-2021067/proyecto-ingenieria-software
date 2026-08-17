import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CerrarParticipacionDto } from './dto/cerrar-participacion.dto';

type TxClient = Prisma.TransactionClient;

/**
 * Cálculo de horas reconocidas y cierre de participación con ajuste
 * opcional justificado. Fuente de horas: exclusivamente
 * `HorasParticipacion`; no se toca `horasReportadas`/`horasAprobadas`.
 */
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
   * Aproximación temporal vía Tarea.tiempoEstimadoHoras: NO representa
   * horas reales trabajadas. El cálculo correcto es
   * SUM(AsignacionTarea.horasReales) por participación/rol en tareas HECHO
   * no eliminadas; ese campo aún no existe en la base compartida. Debe
   * reemplazarse cuando esté disponible.
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
   * Cierre normal ACTIVO -> COMPLETADO. Nunca actúa sobre RETIRADO: ese
   * estado y su ciclo de vida pertenecen a T-113.
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

      // Comparación segura con decimales: se redondea a 2 posiciones antes
      // de comparar, para no disparar un "ajuste" falso por errores de
      // punto flotante (ej. 1.1 + 2.2 !== 3.3 en JS).
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const horasCalculadasRedondeadas = round2(horasCalculadas);
      const justificacionLimpia = dto.justificacion?.trim();

      const huboAjuste =
        dto.horasReconocidas !== undefined &&
        round2(dto.horasReconocidas) !== horasCalculadasRedondeadas;

      // horasAprobadas != horasCalculadas exige justificacion no vacía.
      // El trim también corre en el DTO; se repite aquí porque esta
      // comparación depende del valor calculado en tiempo de ejecución.
      if (huboAjuste && !justificacionLimpia) {
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
          // Invariante: si NO hubo ajuste, justificacionAjuste es siempre
          // null, sin importar qué haya enviado el cliente.
          justificacionAjuste: huboAjuste ? justificacionLimpia : null,
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

  private async safeNotify(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error('Fallo al emitir notificación (cierre no revertido)', error as Error);
    }
  }
}
