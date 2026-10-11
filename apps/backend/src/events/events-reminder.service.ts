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
 * dice si el evento ya fue procesado — EventsService lo resetea a null al
 * mover fechaInicio (T-265: recordatorio se recalcula contra la fecha
 * nueva) y un evento cancelado (eliminadoEn no null) nunca entra a esta
 * consulta.
 *
 * G04 (UI-22): esa marca es global por evento, así que no basta para saber a
 * QUIÉN se avisó. Cuando EventsService la reabre porque entró un invitado
 * nuevo, aquí se consulta la tabla de notificaciones y solo se avisa a quien
 * aún no tiene el recordatorio de este evento para esta hora de inicio.
 * Límite conocido: un aviso anterior a G04 se reconoce por su texto de fecha;
 * si ese texto cambiara de formato entre un envío y el siguiente (cambio de
 * ICU), sus destinatarios podrían recibirlo una segunda vez, nunca más allá
 * de la audiencia del propio evento.
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
      const fechaInicioTexto = evento.fechaInicio.toLocaleString('es-GT', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: GUATEMALA_TIME_ZONE,
      });
      const fechaInicioIso = evento.fechaInicio.toISOString();
      // G04 (UI-22): nunca se repite el aviso a quien ya lo tiene. Si esta
      // consulta falla, la excepción corta aquí: no se envía a nadie ni se
      // marca el evento, y la siguiente pasada del cron lo reintenta.
      const yaAvisados = await this.yaAvisados(evento.idEvento, destinatarios, fechaInicioIso, fechaInicioTexto);
      const pendientes = destinatarios.filter((id) => !yaAvisados.has(id));
      if (pendientes.length > 0) {
        await this.notifications.notifyFromTemplate(pendientes, 'RECORDATORIO_EVENTO', {
          eventTitle: evento.tituloEvento,
          projectTitle: evento.proyecto.tituloProyecto,
          projectId: evento.idProyecto,
          eventId: evento.idEvento,
          fechaInicioTexto,
          fechaInicioIso,
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

  /**
   * G04 (UI-22): quiénes de `destinatarios` ya tienen el recordatorio de este
   * evento PARA ESTA hora de inicio. La evidencia es la propia tabla de
   * notificaciones (filas persistidas que el sistema no borra), no memoria del
   * proceso. La hora de inicio forma parte de la clave a propósito: si el
   * evento se mueve, todos deben recibir el aviso de la fecha nueva (T-265).
   * Los avisos nuevos se reconocen por `fechaInicioIso`; los anteriores a G04,
   * que no lo traen, por el mismo `fechaInicioTexto` que ya guardaban.
   */
  private async yaAvisados(
    idEvento: number,
    destinatarios: number[],
    fechaInicioIso: string,
    fechaInicioTexto: string,
  ): Promise<Set<number>> {
    if (destinatarios.length === 0) return new Set();
    const filas = await this.prisma.notificacion.findMany({
      where: {
        tipoNotificacion: 'RECORDATORIO_EVENTO',
        idUsuario: { in: destinatarios },
        datosJson: { path: ['eventId'], equals: idEvento },
        OR: [
          { datosJson: { path: ['fechaInicioIso'], equals: fechaInicioIso } },
          { datosJson: { path: ['fechaInicioTexto'], equals: fechaInicioTexto } },
        ],
      },
      select: { idUsuario: true },
    });
    return new Set(filas.map((fila) => fila.idUsuario));
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
