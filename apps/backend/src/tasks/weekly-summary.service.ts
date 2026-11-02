import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EstadoPostulacion, EstadoTarea, EstadoUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';

// Mismo huso fijo UTC-6 que tasks-due-reminder.service.ts.
const GUATEMALA_TIME_ZONE = 'America/Guatemala';
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Medianoche UTC del día calendario de Guatemala en `ahora` (como las columnas @db.Date). */
export function hoyGuatemala(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESFASE_GUATEMALA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * MEJ-31: cada lunes a las 7:00 (Guatemala) avisa a cada usuario activo con tareas que vencen en
 * los próximos 7 días, horas registradas la semana pasada o postulaciones pendientes. Quien no
 * tiene nada de eso no recibe aviso. La clave de idempotencia (usuario + lunes) evita duplicados si
 * el job corre dos veces; las preferencias de TU_SEMANA se respetan dentro de persistTemplateTx.
 */
@Injectable()
export class WeeklySummaryService {
  private readonly logger = new Logger(WeeklySummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * 1', { timeZone: GUATEMALA_TIME_ZONE })
  async enviarTuSemana(ahora: Date = new Date()): Promise<number> {
    const hoy = hoyGuatemala(ahora);
    const finSemana = new Date(hoy.getTime() + 6 * UN_DIA_MS);
    const inicioPasada = new Date(hoy.getTime() - 7 * UN_DIA_MS);
    const finPasada = new Date(hoy.getTime() - UN_DIA_MS);

    const [tareas, horas, postulaciones] = await Promise.all([
      this.prisma.asignacionTarea.groupBy({
        by: ['idUsuario'],
        where: {
          desasignadaEn: null,
          tarea: {
            fechaLimite: { gte: hoy, lte: finSemana },
            estadoTarea: { not: EstadoTarea.HECHO },
            eliminadoEn: null,
            proyecto: { eliminadoEn: null },
          },
        },
        _count: { _all: true },
      }),
      this.prisma.registroTiempoTarea.groupBy({
        by: ['idUsuario'],
        where: { revocadoEn: null, fecha: { gte: inicioPasada, lte: finPasada } },
        _sum: { horas: true },
      }),
      this.prisma.postulacion.groupBy({
        by: ['idUsuarioPostulante'],
        where: { estadoPostulacion: EstadoPostulacion.PENDIENTE },
        _count: { _all: true },
      }),
    ]);

    const resumen = new Map<number, { tareasPorVencer: number; horasSemanaPasada: number; postulacionesPendientes: number }>();
    const de = (id: number) => {
      let r = resumen.get(id);
      if (!r) resumen.set(id, (r = { tareasPorVencer: 0, horasSemanaPasada: 0, postulacionesPendientes: 0 }));
      return r;
    };
    for (const t of tareas) de(t.idUsuario).tareasPorVencer = t._count._all;
    for (const h of horas) de(h.idUsuario).horasSemanaPasada = Number(h._sum.horas ?? 0);
    for (const p of postulaciones) de(p.idUsuarioPostulante).postulacionesPendientes = p._count._all;
    if (resumen.size === 0) return 0;

    const activos = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: [...resumen.keys()] }, estado: EstadoUsuario.ACTIVO },
      select: { idUsuario: true },
    });

    const clave = `tu-semana:${hoy.toISOString().slice(0, 10)}`;
    let enviados = 0;
    for (const { idUsuario } of activos) {
      const datos = resumen.get(idUsuario);
      if (!datos) continue;
      if (datos.tareasPorVencer === 0 && datos.horasSemanaPasada === 0 && datos.postulacionesPendientes === 0) continue;
      try {
        const effects: PostCommitEffect[] = [];
        const { count } = await this.prisma.$transaction((tx) =>
          this.notifications.persistTemplateTx(tx, [idUsuario], 'TU_SEMANA', datos, { add: (e) => effects.push(e) }, { claveIdempotencia: clave }),
        );
        await this.notifications.publishEffects(effects);
        enviados += count;
      } catch (error) {
        this.logger.warn(`Fallo al enviar "Tu semana" al usuario ${idUsuario}: ${(error as Error)?.message ?? error}`);
      }
    }
    return enviados;
  }
}
