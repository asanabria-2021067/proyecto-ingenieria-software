import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DraftInactivityService implements OnModuleInit {
  private readonly logger = new Logger(DraftInactivityService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    void this.runDailyCheck();
    setInterval(() => void this.runDailyCheck(), ONE_DAY_MS);
  }

  private async runDailyCheck() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const borradores = await this.prisma.proyecto.findMany({
        where: { estadoProyecto: EstadoProyecto.BORRADOR, eliminadoEn: null },
        select: {
          idProyecto: true,
          tituloProyecto: true,
          creadoPor: true,
          fechaActualizacion: true,
          fechaCreacion: true,
        },
      });

      for (const p of borradores) {
        const baseDate = p.fechaActualizacion ?? p.fechaCreacion;
        const ageDays = Math.floor((now.getTime() - baseDate.getTime()) / ONE_DAY_MS);

        if (ageDays >= 21) {
          await this.prisma.proyecto.update({
            where: { idProyecto: p.idProyecto },
            data: {
              estadoProyecto: EstadoProyecto.CANCELADO,
              eliminadoEn: now,
              fechaActualizacion: now,
            },
          });
          await this.notifications.notifyUsers([p.creadoPor], {
            tipoNotificacion: 'PROYECTO_ACTUALIZADO',
            tituloNotificacion: 'Proyecto cancelado por inactividad',
            mensajeNotificacion: `Tu borrador "${p.tituloProyecto}" fue cancelado por inactividad.`,
            datosJson: { idProyecto: p.idProyecto, razon: 'inactividad_21_dias' },
          });
          continue;
        }

        if (ageDays >= 14 && ageDays < 15) {
          await this.notifications.notifyUsers([p.creadoPor], {
            tipoNotificacion: 'PROYECTO_ADVERTENCIA_INACTIVIDAD',
            tituloNotificacion: 'Borrador inactivo',
            mensajeNotificacion: `Tu borrador "${p.tituloProyecto}" lleva más de 14 días sin actividad.`,
            datosJson: { idProyecto: p.idProyecto, diasInactividad: ageDays },
          });
        }
      }
    } catch (error) {
      this.logger.error('Error ejecutando cron de inactividad de borradores', error as Error);
    } finally {
      this.running = false;
    }
  }
}
