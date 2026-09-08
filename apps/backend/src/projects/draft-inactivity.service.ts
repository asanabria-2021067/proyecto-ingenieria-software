import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CANCEL_AFTER_DAYS = 21;
const WARN_AT_DAYS = 14;

@Injectable()
export class DraftInactivityService implements OnModuleInit {
  private readonly logger = new Logger(DraftInactivityService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private readonly projectTx: ProjectTransactionService,
  ) {}

  onModuleInit() {
    void this.runDailyCheck();
    setInterval(() => void this.runDailyCheck(), ONE_DAY_MS);
  }

  private ageInDays(now: Date, fechaActualizacion: Date | null, fechaCreacion: Date): number {
    const baseDate = fechaActualizacion ?? fechaCreacion;
    return Math.floor((now.getTime() - baseDate.getTime()) / ONE_DAY_MS);
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
        const ageDays = this.ageInDays(now, p.fechaActualizacion, p.fechaCreacion);

        if (ageDays >= CANCEL_AFTER_DAYS) {
          await this.cancelInactiveDraft(p.idProyecto, p.creadoPor, now);
          continue;
        }

        if (ageDays >= WARN_AT_DAYS && ageDays < WARN_AT_DAYS + 1) {
          // Aviso sin lock de proyecto: adquirir el padre reiniciaría la
          // última actividad coordinada y con ella la antigüedad del borrador.
          await this.notifications.notifyFromTemplate(
            [p.creadoPor],
            'PROYECTO_ADVERTENCIA_INACTIVIDAD',
            {
              projectTitle: p.tituloProyecto,
              projectId: p.idProyecto,
              diasInactividad: ageDays,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error('Error ejecutando cron de inactividad de borradores', error as Error);
    } finally {
      this.running = false;
    }
  }

  /**
   * C031 (06 v2 §16): la cancelación adquiere el padre mediante el protocolo
   * y revalida BORRADOR bajo el lock. La fecha de inactividad se relee
   * justo antes de adquirir, porque el propio lock actualiza
   * `fechaActualizacion` (última actividad coordinada): un borrador que
   * cambió después de listarse ya no cumple la antigüedad y se omite. La
   * política de 21 días se conserva.
   */
  private async cancelInactiveDraft(idProyecto: number, creadoPor: number, now: Date): Promise<void> {
    const fresh = await this.prisma.proyecto.findFirst({
      where: { idProyecto, estadoProyecto: EstadoProyecto.BORRADOR, eliminadoEn: null },
      select: { tituloProyecto: true, fechaActualizacion: true, fechaCreacion: true },
    });
    if (!fresh || this.ageInDays(now, fresh.fechaActualizacion, fresh.fechaCreacion) < CANCEL_AFTER_DAYS) {
      return;
    }

    await this.projectTx.run(idProyecto, creadoPor, 'projects.draftInactivity.cancel', async ({ tx, project, effects }) => {
      if (!project || project.estadoProyecto !== EstadoProyecto.BORRADOR || project.eliminadoEn !== null) {
        return;
      }
      await tx.proyecto.update({
        where: { idProyecto },
        data: {
          estadoProyecto: EstadoProyecto.CANCELADO,
          eliminadoEn: now,
          fechaActualizacion: now,
        },
      });
      await this.notifications.persistTemplateTx(
        tx,
        [creadoPor],
        'PROYECTO_ACTUALIZADO',
        {
          projectTitle: fresh.tituloProyecto,
          projectId: idProyecto,
          reason: 'draft_inactivity_cancelled',
        },
        effects,
      );
    });
  }
}
