import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TipoEventoSeguridad, TipoEventoSeguridadValor } from './tipos-evento-seguridad';

/**
 * G05 (OWASP25-C038): alertas acotadas a administradores ante RÁFAGAS de
 * eventos de seguridad, detrás de SECURITY_ALERTS_ENABLED (default false: con
 * el flag apagado este servicio no consulta ni escribe nada).
 *
 * - Ráfaga: al menos `threshold` eventos LOGIN_FAILED o ACCOUNT_LOCKED en los
 *   últimos `windowMs`, contados en bitacora_auditoria.
 * - Deduplicación: como máximo una alerta por `dedupMs`, comprobada en memoria
 *   (sin consultas mientras dura la ventana) y en la base (otra instancia o un
 *   reinicio no la repiten).
 * - La notificación solo lleva conteos: sin IPs, correos, cuentas ni tokens.
 * - Best-effort: un fallo aquí nunca afecta a la autenticación.
 */
export interface SecurityAlertPolicy {
  windowMs: number;
  threshold: number;
  dedupMs: number;
}

export const SECURITY_ALERT_POLICY: SecurityAlertPolicy = {
  windowMs: 10 * 60_000,
  threshold: 20,
  dedupMs: 60 * 60_000,
};

export const ALERTABLE_EVENTS: readonly TipoEventoSeguridadValor[] = [
  TipoEventoSeguridad.LOGIN_FAILED,
  TipoEventoSeguridad.ACCOUNT_LOCKED,
];

type AlertsPrisma = Pick<PrismaService, 'bitacoraAuditoria' | 'notificacion'>;
type AlertsNotifications = Pick<NotificationsService, 'notifyAdminsFromTemplate'>;

/** Se registra en SecurityEventsModule con `useFactory` (el flag viene de ConfigService). */
export class SecurityAlertsService {
  private readonly logger = new Logger(SecurityAlertsService.name);
  private lastAlertAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly prisma: AlertsPrisma,
    private readonly notifications: AlertsNotifications,
    private readonly enabled: boolean,
    private readonly policy: SecurityAlertPolicy = SECURITY_ALERT_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  /** Evalúa si el evento recién registrado completa una ráfaga. Devuelve true si se emitió una alerta. */
  async evaluate(tipo: TipoEventoSeguridadValor): Promise<boolean> {
    if (!this.enabled || !ALERTABLE_EVENTS.includes(tipo)) {
      return false;
    }
    const now = this.now();
    if (now - this.lastAlertAt < this.policy.dedupMs) {
      return false;
    }
    try {
      const eventos = await this.prisma.bitacoraAuditoria.count({
        where: { accion: { in: [...ALERTABLE_EVENTS] }, fechaEvento: { gte: new Date(now - this.policy.windowMs) } },
      });
      if (eventos < this.policy.threshold) {
        return false;
      }
      const reciente = await this.prisma.notificacion.findFirst({
        where: { tipoNotificacion: 'ALERTA_SEGURIDAD', creadaEn: { gte: new Date(now - this.policy.dedupMs) } },
        select: { idNotificacion: true },
      });
      this.lastAlertAt = now;
      if (reciente) {
        return false;
      }
      await this.notifications.notifyAdminsFromTemplate('ALERTA_SEGURIDAD', {
        eventos,
        ventanaMinutos: Math.round(this.policy.windowMs / 60_000),
      });
      return true;
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      this.logger.warn(`Alerta de seguridad no evaluada: ${kind}`);
      return false;
    }
  }
}
