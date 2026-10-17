import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoMensajeProgramado, EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { ScheduleMessageDto } from './dto/schedule-message.dto';

const MIN_ANTELACION_MS = 60_000;
const MAX_ANTELACION_MS = 30 * 24 * 60 * 60 * 1000;
const LOTE_MAXIMO = 100;

const PROGRAMADO_SELECT = {
  idMensajeProgramado: true,
  idConversacion: true,
  contenido: true,
  enviarEn: true,
  estado: true,
  creadoEn: true,
} as const;

/**
 * Mensajes de chat programados. El job reclama cada fila con un UPDATE
 * condicional PENDIENTE -> ENVIADO antes de enviar: si dos ejecuciones se
 * solapan, solo una ve count = 1 y envía. Entrega "a lo sumo una vez": si el
 * proceso muere entre el reclamo y el envío, la fila queda ENVIADO sin
 * idMensaje y no se reintenta (preferible a duplicar un mensaje).
 */
@Injectable()
export class MensajesProgramadosService {
  private readonly logger = new Logger(MensajesProgramadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  private async getConversacionDelParticipante(idProyecto: number, idConversacion: number, userId: number) {
    const conversacion = await this.prisma.conversacion.findFirst({
      where: { idConversacion, idProyecto, eliminadaEn: null },
      include: {
        participantes: { select: { idUsuario: true } },
        proyecto: { select: { estadoProyecto: true } },
      },
    });
    if (!conversacion) {
      throw new NotFoundException(`Conversación con id ${idConversacion} no encontrada`);
    }
    if (!conversacion.participantes.some((p) => p.idUsuario === userId)) {
      throw new ForbiddenException('No participas en esta conversación');
    }
    return conversacion;
  }

  async programar(
    idProyecto: number,
    idConversacion: number,
    userId: number,
    dto: ScheduleMessageDto,
    ahora: Date = new Date(),
  ) {
    const conversacion = await this.getConversacionDelParticipante(idProyecto, idConversacion, userId);
    if (conversacion.proyecto.estadoProyecto === EstadoProyecto.CERRADO) {
      throw new ForbiddenException(
        'Esta conversación está archivada: el proyecto ya cerró y no se pueden programar mensajes.',
      );
    }

    const enviarEn = new Date(dto.enviarEn);
    const antelacion = enviarEn.getTime() - ahora.getTime();
    if (antelacion < MIN_ANTELACION_MS) {
      throw new BadRequestException('La hora de envío debe ser al menos 1 minuto en el futuro');
    }
    if (antelacion > MAX_ANTELACION_MS) {
      throw new BadRequestException('La hora de envío no puede superar los 30 días');
    }

    return this.prisma.mensajeProgramado.create({
      data: { idConversacion, idRemitente: userId, contenido: dto.contenido.trim(), enviarEn },
      select: PROGRAMADO_SELECT,
    });
  }

  /** Solo los pendientes propios: nadie ve lo que otro programó. */
  async listarPendientes(idProyecto: number, idConversacion: number, userId: number) {
    await this.getConversacionDelParticipante(idProyecto, idConversacion, userId);
    return this.prisma.mensajeProgramado.findMany({
      where: { idConversacion, idRemitente: userId, estado: EstadoMensajeProgramado.PENDIENTE },
      orderBy: { enviarEn: 'asc' },
      select: PROGRAMADO_SELECT,
    });
  }

  async cancelar(idProyecto: number, idConversacion: number, idMensajeProgramado: number, userId: number) {
    await this.getConversacionDelParticipante(idProyecto, idConversacion, userId);
    const programado = await this.prisma.mensajeProgramado.findFirst({
      where: { idMensajeProgramado, idConversacion },
      select: { idRemitente: true },
    });
    if (!programado) {
      throw new NotFoundException(`Mensaje programado con id ${idMensajeProgramado} no encontrado`);
    }
    if (programado.idRemitente !== userId) {
      throw new ForbiddenException('Solo el autor puede cancelar un mensaje programado');
    }
    // El estado va en el WHERE: si el job lo envió justo ahora, no se pisa.
    const { count } = await this.prisma.mensajeProgramado.updateMany({
      where: { idMensajeProgramado, estado: EstadoMensajeProgramado.PENDIENTE },
      data: { estado: EstadoMensajeProgramado.CANCELADO },
    });
    if (count === 0) {
      throw new ConflictException('El mensaje ya no está pendiente');
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async enviarVencidos(): Promise<void> {
    await this.procesarVencidos(new Date());
  }

  /** `ahora` inyectable para probar límites sin fijar el reloj. */
  async procesarVencidos(ahora: Date): Promise<void> {
    const vencidos = await this.prisma.mensajeProgramado.findMany({
      where: { estado: EstadoMensajeProgramado.PENDIENTE, enviarEn: { lte: ahora } },
      orderBy: { enviarEn: 'asc' },
      take: LOTE_MAXIMO,
      select: {
        idMensajeProgramado: true,
        idConversacion: true,
        idRemitente: true,
        contenido: true,
        conversacion: { select: { idProyecto: true } },
      },
    });

    for (const m of vencidos) {
      try {
        const { count } = await this.prisma.mensajeProgramado.updateMany({
          where: { idMensajeProgramado: m.idMensajeProgramado, estado: EstadoMensajeProgramado.PENDIENTE },
          data: { estado: EstadoMensajeProgramado.ENVIADO, enviadoEn: ahora },
        });
        if (count === 0) continue; // otra ejecución o una cancelación lo tomó primero

        try {
          const mensaje = await this.chat.createMessage(
            m.conversacion.idProyecto,
            m.idConversacion,
            m.idRemitente,
            m.contenido,
          );
          await this.prisma.mensajeProgramado.update({
            where: { idMensajeProgramado: m.idMensajeProgramado },
            data: { idMensaje: mensaje.idMensaje },
          });
        } catch (error) {
          // Remitente que ya no participa, conversación cerrada, etc.
          await this.prisma.mensajeProgramado.update({
            where: { idMensajeProgramado: m.idMensajeProgramado },
            data: { estado: EstadoMensajeProgramado.FALLIDO, enviadoEn: null },
          });
          throw error;
        }
      } catch (error) {
        this.logger.warn(
          `Mensaje programado ${m.idMensajeProgramado} no se pudo enviar: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
