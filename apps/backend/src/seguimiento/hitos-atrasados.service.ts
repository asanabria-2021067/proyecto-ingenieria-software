import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calcularProgresoHito } from '../common/hito-progreso';
import { diasEntre, hoyGuatemala } from './seguimiento.util';

const GUATEMALA_TIME_ZONE = 'America/Guatemala';
const PROYECTOS_VIVOS = [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO, EstadoProyecto.EN_SOLICITUD_CIERRE];

/**
 * MEJ-54: job diario que avisa al líder de cada hito sin completar con la
 * fecha límite vencida. Un aviso por hito: `Hito.alertaAtrasoEnviadaEn` se
 * reserva con un UPDATE condicional (solo si sigue en null) antes de notificar,
 * así dos corridas concurrentes no duplican el aviso. Si la emisión falla se
 * libera la reserva para que la corrida del día siguiente lo reintente.
 */
@Injectable()
export class HitosAtrasadosService {
  private readonly logger = new Logger(HitosAtrasadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: GUATEMALA_TIME_ZONE })
  async avisarHitosAtrasados(ahora: Date = new Date()): Promise<number> {
    const hoy = hoyGuatemala(ahora);
    const candidatos = await this.prisma.hito.findMany({
      where: {
        fechaLimite: { lt: hoy },
        alertaAtrasoEnviadaEn: null,
        proyecto: { eliminadoEn: null, estadoProyecto: { in: PROYECTOS_VIVOS } },
      },
      select: {
        idHito: true,
        idProyecto: true,
        tituloHito: true,
        fechaLimite: true,
        tareas: { where: { eliminadoEn: null }, select: { estadoTarea: true } },
        proyecto: { select: { tituloProyecto: true, creadoPor: true } },
      },
    });

    let avisados = 0;
    for (const hito of candidatos) {
      if (calcularProgresoHito(hito.tareas).estadoHito === 'COMPLETADO') continue;
      try {
        const reserva = await this.prisma.hito.updateMany({
          where: { idHito: hito.idHito, alertaAtrasoEnviadaEn: null },
          data: { alertaAtrasoEnviadaEn: ahora },
        });
        if (reserva.count === 0) continue; // otra corrida ya lo avisó
        try {
          await this.notifications.notifyFromTemplate([hito.proyecto.creadoPor], 'HITO_ATRASADO', {
            hitoTitle: hito.tituloHito,
            projectTitle: hito.proyecto.tituloProyecto,
            projectId: hito.idProyecto,
            hitoId: hito.idHito,
            diasAtraso: diasEntre(hito.fechaLimite!, hoy),
          });
          avisados += 1;
        } catch (error) {
          await this.prisma.hito.update({ where: { idHito: hito.idHito }, data: { alertaAtrasoEnviadaEn: null } });
          throw error;
        }
      } catch (error) {
        this.logger.warn(`Fallo al avisar el atraso del hito ${hito.idHito}: ${(error as Error)?.message ?? error}`);
      }
    }
    return avisados;
  }
}
