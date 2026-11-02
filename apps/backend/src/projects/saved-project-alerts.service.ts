import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoProyecto, EstadoUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';

/** MEJ-17: quedan 1 o 2 cupos. */
export const CUPOS_AVISO_MAXIMO = 2;

/**
 * MEJ-17: avisa a quien guardó un proyecto cuando le quedan 1-2 cupos o pasa a «En solicitud de
 * cierre». Se revisa de forma periódica en vez de colgarse de cada vía que ocupa un cupo
 * (postulación aceptada, alta directa, miembro de organización, salida…): así ninguna se escapa.
 * La clave de idempotencia (usuario + clave) hace que cada situación avise UNA sola vez.
 */
@Injectable()
export class SavedProjectAlertsService {
  private readonly logger = new Logger(SavedProjectAlertsService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async revisar(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ejecutar();
    } catch (error) {
      this.logger.error('Error revisando avisos de proyectos guardados', error as Error);
    } finally {
      this.running = false;
    }
  }

  /** Devuelve cuántos avisos se crearon (los repetidos no cuentan). */
  async ejecutar(): Promise<number> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        eliminadoEn: null,
        estadoProyecto: { in: [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO, EstadoProyecto.EN_SOLICITUD_CIERRE] },
        guardadoPor: { some: { usuario: { estado: EstadoUsuario.ACTIVO } } },
      },
      select: {
        idProyecto: true,
        tituloProyecto: true,
        estadoProyecto: true,
        creadoPor: true,
        guardadoPor: { where: { usuario: { estado: EstadoUsuario.ACTIVO } }, select: { idUsuario: true } },
        roles: {
          select: {
            cupos: true,
            participaciones: { where: { estadoParticipacion: 'ACTIVO' }, select: { idUsuario: true } },
          },
        },
      },
    });

    const effects: PostCommitEffect[] = [];
    let creados = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const p of proyectos) {
        const participantes = new Set(p.roles.flatMap((r) => r.participaciones.map((x) => x.idUsuario)));
        const destinatarios = p.guardadoPor
          .map((g) => g.idUsuario)
          .filter((id) => id !== p.creadoPor && !participantes.has(id));
        if (destinatarios.length === 0) continue;

        const cuposDisponibles = p.roles.reduce((suma, r) => suma + Math.max(0, r.cupos - r.participaciones.length), 0);
        const cierre = p.estadoProyecto === EstadoProyecto.EN_SOLICITUD_CIERRE;
        if (!cierre && (cuposDisponibles < 1 || cuposDisponibles > CUPOS_AVISO_MAXIMO)) continue;

        const { count } = await this.notifications.persistTemplateTx(
          tx,
          destinatarios,
          'PROYECTO_GUARDADO_AVISO',
          {
            projectTitle: p.tituloProyecto,
            projectId: p.idProyecto,
            motivo: cierre ? 'CIERRE' : 'CUPOS',
            cuposDisponibles,
          },
          { add: (effect) => effects.push(effect) },
          { claveIdempotencia: cierre ? `guardado:cierre:${p.idProyecto}` : `guardado:cupos:${p.idProyecto}:${cuposDisponibles}` },
        );
        creados += count;
      }
    });
    await this.notifications.publishEffects(effects);
    return creados;
  }
}
