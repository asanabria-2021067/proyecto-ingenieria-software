import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoMensajeProgramado } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

const MIN_ANTELACION_MS = 60_000;
const MAX_ANTELACION_MS = 90 * 24 * 60 * 60 * 1000;
const LOTE_MAXIMO = 100;
const MAX_PENDIENTES = 50;
const MAX_EXTRACTO = 120;

/**
 * MEJ-46: «Recuérdamelo». Un recordatorio pendiente por usuario y mensaje (volver a
 * pedirlo cambia la hora). El job reclama cada fila con un UPDATE condicional
 * PENDIENTE -> ENVIADO antes de notificar: entrega "a lo sumo una vez".
 */
@Injectable()
export class RecordatoriosMensajeService {
  private readonly logger = new Logger(RecordatoriosMensajeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
  ) {}

  async crear(
    idProyecto: number,
    idConversacion: number,
    idMensaje: number,
    userId: number,
    recordarEn: Date,
    ahora: Date = new Date(),
  ) {
    await this.chat.assertConversationParticipant(idProyecto, idConversacion, userId);
    const mensaje = await this.prisma.mensajeChat.findFirst({
      where: { idMensaje, idConversacion, eliminadoEn: null },
      select: { idMensaje: true },
    });
    if (!mensaje) throw new NotFoundException(`Mensaje con id ${idMensaje} no encontrado`);

    const antelacion = recordarEn.getTime() - ahora.getTime();
    if (antelacion < MIN_ANTELACION_MS) {
      throw new BadRequestException('La hora del recordatorio debe ser al menos 1 minuto en el futuro');
    }
    if (antelacion > MAX_ANTELACION_MS) {
      throw new BadRequestException('El recordatorio no puede superar los 90 días');
    }

    const SELECT = { idRecordatorio: true, idMensaje: true, recordarEn: true } as const;
    const existente = await this.prisma.recordatorioMensaje.findFirst({
      where: { idUsuario: userId, idMensaje, estado: EstadoMensajeProgramado.PENDIENTE },
      select: { idRecordatorio: true },
    });
    if (existente) {
      return this.prisma.recordatorioMensaje.update({
        where: { idRecordatorio: existente.idRecordatorio },
        data: { recordarEn },
        select: SELECT,
      });
    }

    const pendientes = await this.prisma.recordatorioMensaje.count({
      where: { idUsuario: userId, estado: EstadoMensajeProgramado.PENDIENTE },
    });
    if (pendientes >= MAX_PENDIENTES) {
      throw new BadRequestException('Ya tienes 50 recordatorios pendientes. Espera a que se envíen para crear otro.');
    }
    return this.prisma.recordatorioMensaje.create({
      data: { idUsuario: userId, idMensaje, recordarEn },
      select: SELECT,
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async enviarVencidos(): Promise<void> {
    await this.procesarVencidos(new Date());
  }

  /** `ahora` inyectable para probar limites sin fijar el reloj. */
  async procesarVencidos(ahora: Date): Promise<void> {
    const vencidos = await this.prisma.recordatorioMensaje.findMany({
      where: { estado: EstadoMensajeProgramado.PENDIENTE, recordarEn: { lte: ahora } },
      orderBy: { recordarEn: 'asc' },
      take: LOTE_MAXIMO,
      select: {
        idRecordatorio: true,
        idUsuario: true,
        mensaje: {
          select: {
            idMensaje: true,
            idConversacion: true,
            contenido: true,
            eliminadoEn: true,
            remitente: { select: { nombre: true, apellido: true } },
            conversacion: {
              select: { idProyecto: true, eliminadaEn: true, participantes: { select: { idUsuario: true } } },
            },
          },
        },
      },
    });

    for (const r of vencidos) {
      try {
        const { count } = await this.prisma.recordatorioMensaje.updateMany({
          where: { idRecordatorio: r.idRecordatorio, estado: EstadoMensajeProgramado.PENDIENTE },
          data: { estado: EstadoMensajeProgramado.ENVIADO },
        });
        if (count === 0) continue; // otra ejecucion lo tomo primero

        const m = r.mensaje;
        const { idProyecto, eliminadaEn, participantes } = m.conversacion;
        // Mensaje borrado, conversacion eliminada o el usuario ya no participa: no se avisa ni se filtra contenido.
        if (m.eliminadoEn || eliminadaEn || idProyecto === null || !participantes.some((p) => p.idUsuario === r.idUsuario)) {
          await this.prisma.recordatorioMensaje.update({
            where: { idRecordatorio: r.idRecordatorio },
            data: { estado: EstadoMensajeProgramado.FALLIDO },
          });
          continue;
        }
        const texto = m.contenido.replace(/@\[([^[\]()\n]{1,120})\]\([1-9]\d{0,8}\)/g, '@$1').trim() || 'Mensaje con adjunto';
        await this.notifications.notifyFromTemplate([r.idUsuario], 'RECORDATORIO_MENSAJE', {
          autorNombre: `${m.remitente.nombre} ${m.remitente.apellido}`,
          extracto: texto.length > MAX_EXTRACTO ? `${texto.slice(0, MAX_EXTRACTO - 1)}…` : texto,
          idProyecto,
          idConversacion: m.idConversacion,
          idMensaje: m.idMensaje,
        });
      } catch (error) {
        this.logger.warn(
          `Recordatorio ${r.idRecordatorio} no se pudo enviar: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
