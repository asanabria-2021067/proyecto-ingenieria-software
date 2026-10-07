import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Mismo huso que is-future-calendar-date.validator.ts: el contenedor corre en
// UTC (sin TZ en docker-compose), así que sin esto el texto del recordatorio
// sale desplazado respecto a la hora que el usuario ve en el calendario.
const GUATEMALA_TIME_ZONE = 'America/Guatemala';

/**
 * HU-169 (T-265): recordatorio de EventoProyecto emitido por el centro de
 * notificaciones de HU-157 — no se abre un segundo canal (eso es lo que
 * T-229 limpió este sprint). Persistido como cualquier notificación
 * (NotificationsService.notifyFromTemplate escribe la fila antes de
 * intentar el socket), así que llega aunque el destinatario esté
 * desconectado.
 *
 * Granularidad de 5 minutos: suficiente frente al default de 60 min de
 * antelación y evita escanear la tabla cada minuto. `recordatorioEnviadoEn`
 * es la única fuente de "ya se envió" — EventsService lo resetea a null al
 * mover fechaInicio (T-265: recordatorio se recalcula contra la fecha
 * nueva) y un evento cancelado (eliminadoEn no null) nunca entra a esta
 * consulta.
 */
@Injectable()
export class EventsReminderService {
  private readonly logger = new Logger(EventsReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async enviarRecordatoriosPendientes(): Promise<void> {
    const ahora = new Date();

    // Candidatos: futuros, no cancelados, sin recordatorio enviado todavía.
    // El filtro exacto por antelacionMinutos (variable por evento) se aplica
    // en memoria abajo — no es expresable como comparación Prisma directa.
    const candidatos = await this.prisma.eventoProyecto.findMany({
      where: {
        eliminadoEn: null,
        recordatorioEnviadoEn: null,
        fechaInicio: { gt: ahora },
        proyecto: { eliminadoEn: null },
      },
      select: {
        idEvento: true,
        idProyecto: true,
        tituloEvento: true,
        fechaInicio: true,
        antelacionMinutos: true,
        invitados: true,
        proyecto: { select: { tituloProyecto: true, creadoPor: true } },
      },
    });

    for (const evento of candidatos) {
      const disparoEn = evento.fechaInicio.getTime() - evento.antelacionMinutos * 60_000;
      if (disparoEn > ahora.getTime()) {
        continue; // todavía no llega su antelación configurada
      }

      await this.enviarRecordatorio(evento);
    }
  }

  private async enviarRecordatorio(evento: {
    idEvento: number;
    idProyecto: number;
    tituloEvento: string;
    fechaInicio: Date;
    invitados: number[];
    proyecto: { tituloProyecto: string; creadoPor: number };
  }): Promise<void> {
    try {
      const integrantes = await this.integrantesDelProyecto(evento.idProyecto, evento.proyecto.creadoPor);
      // HU-184: con invitados, solo ellos (si siguen en el proyecto) y el líder.
      const destinatarios =
        evento.invitados.length === 0
          ? integrantes
          : integrantes.filter((id) => id === evento.proyecto.creadoPor || evento.invitados.includes(id));
      if (destinatarios.length > 0) {
        await this.notifications.notifyFromTemplate(destinatarios, 'RECORDATORIO_EVENTO', {
          eventTitle: evento.tituloEvento,
          projectTitle: evento.proyecto.tituloProyecto,
          projectId: evento.idProyecto,
          eventId: evento.idEvento,
          fechaInicioTexto: evento.fechaInicio.toLocaleString('es-GT', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: GUATEMALA_TIME_ZONE,
          }),
        });
      }

      // Marca "enviado" incluso con cero destinatarios (proyecto sin
      // integrantes activos): no reintentar en cada corrida del cron.
      await this.prisma.eventoProyecto.update({
        where: { idEvento: evento.idEvento },
        data: { recordatorioEnviadoEn: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Fallo al enviar el recordatorio del evento ${evento.idEvento}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  /** Solo integrantes del proyecto del evento: líder + participaciones ACTIVO, deduplicados. */
  private async integrantesDelProyecto(projectId: number, leaderId: number): Promise<number[]> {
    const participaciones = await this.prisma.participacionProyecto.findMany({
      where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: projectId } },
      select: { idUsuario: true },
    });
    return [...new Set([leaderId, ...participaciones.map((p) => p.idUsuario)])];
  }
}
