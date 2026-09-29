import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadWorkflow, readRepoFile } from './helpers/workflow-yaml';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import {
  SECURITY_ALERT_POLICY,
  SecurityAlertsService,
} from '../src/security-events/security-alerts.service';
import { parseSecurityAlertsEnabled, validateEnvironment } from '../src/config/environment.validation';

/**
 * G05-C12 · OWASP25-C038. Alertas a admins ante ráfagas de eventos de
 * seguridad, detrás de SECURITY_ALERTS_ENABLED (default false): con el flag
 * apagado no hay consultas ni filas; encendido, una sola alerta por ráfaga y
 * por ventana de deduplicación; el contenido solo lleva conteos.
 */

function setup(options: { enabled: boolean; eventos: number; alertaReciente?: boolean }) {
  let now = 10_000_000;
  const prisma = {
    bitacoraAuditoria: { count: vi.fn().mockResolvedValue(options.eventos) },
    notificacion: { findFirst: vi.fn().mockResolvedValue(options.alertaReciente ? { idNotificacion: 1 } : null) },
  };
  const notifications = { notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const alerts = new SecurityAlertsService(
    prisma as unknown as PrismaService,
    notifications as never,
    options.enabled,
    SECURITY_ALERT_POLICY,
    () => now,
  );
  return { alerts, prisma, notifications, advance: (ms: number) => (now += ms) };
}

describe('G05-C12: alertas de seguridad a admins detrás de flag', () => {
  it('flag false (default): ni consultas ni notificaciones, aunque haya ráfaga', async () => {
    const { alerts, prisma, notifications } = setup({ enabled: false, eventos: 500 });
    expect(await alerts.evaluate('LOGIN_FAILED')).toBe(false);
    expect(prisma.bitacoraAuditoria.count).not.toHaveBeenCalled();
    expect(notifications.notifyAdminsFromTemplate).not.toHaveBeenCalled();
  });

  it('flag true sin alcanzar el umbral: 0 alertas', async () => {
    const { alerts, notifications } = setup({ enabled: true, eventos: SECURITY_ALERT_POLICY.threshold - 1 });
    expect(await alerts.evaluate('LOGIN_FAILED')).toBe(false);
    expect(notifications.notifyAdminsFromTemplate).not.toHaveBeenCalled();
  });

  it('flag true + umbral: exactamente una alerta, solo con conteos', async () => {
    const { alerts, notifications, prisma } = setup({ enabled: true, eventos: 37 });
    expect(await alerts.evaluate('ACCOUNT_LOCKED')).toBe(true);
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith('ALERTA_SEGURIDAD', { eventos: 37, ventanaMinutos: 10 });
    expect(prisma.bitacoraAuditoria.count).toHaveBeenCalledWith({
      where: { accion: { in: ['LOGIN_FAILED', 'ACCOUNT_LOCKED'] }, fechaEvento: { gte: expect.any(Date) } },
    });
  });

  it('eventos posteriores dentro de la ventana de deduplicación: sigue siendo una sola alerta y sin más consultas', async () => {
    const { alerts, notifications, prisma, advance } = setup({ enabled: true, eventos: 50 });
    await alerts.evaluate('LOGIN_FAILED');
    for (let i = 0; i < 30; i += 1) {
      advance(60_000);
      await alerts.evaluate('LOGIN_FAILED');
    }
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledTimes(1);
    expect(prisma.bitacoraAuditoria.count).toHaveBeenCalledTimes(1);
    advance(SECURITY_ALERT_POLICY.dedupMs);
    await alerts.evaluate('LOGIN_FAILED');
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledTimes(2);
  });

  it('otra instancia o un reinicio no repite la alerta si ya existe una reciente en la base', async () => {
    const { alerts, notifications } = setup({ enabled: true, eventos: 50, alertaReciente: true });
    expect(await alerts.evaluate('LOGIN_FAILED')).toBe(false);
    expect(notifications.notifyAdminsFromTemplate).not.toHaveBeenCalled();
  });

  it('solo LOGIN_FAILED y ACCOUNT_LOCKED cuentan como ráfaga', async () => {
    const { alerts, prisma } = setup({ enabled: true, eventos: 500 });
    for (const tipo of ['LOGIN_SUCCEEDED', 'PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_COMPLETED', 'USER_STATUS_CHANGED'] as const) {
      expect(await alerts.evaluate(tipo)).toBe(false);
    }
    expect(prisma.bitacoraAuditoria.count).not.toHaveBeenCalled();
  });

  it('best-effort: un fallo de la base no lanza', async () => {
    const { alerts, prisma } = setup({ enabled: true, eventos: 50 });
    prisma.bitacoraAuditoria.count.mockRejectedValue(new Error('db caída'));
    vi.spyOn((alerts as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    await expect(alerts.evaluate('LOGIN_FAILED')).resolves.toBe(false);
  });

  it('el writer evalúa la alerta tras registrar; si la alerta falla, el evento sigue registrado', async () => {
    const create = vi.fn().mockResolvedValue({});
    const evaluate = vi.fn().mockRejectedValue(new Error('boom'));
    const events = new SecurityEventsService({ bitacoraAuditoria: { create } } as unknown as PrismaService, { evaluate } as never);
    vi.spyOn((events as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    await expect(events.record({ tipo: 'LOGIN_FAILED' })).resolves.toBe(true);
    expect(evaluate).toHaveBeenCalledWith('LOGIN_FAILED');
  });

  it('plantilla: texto seguro con conteos, sin IPs, correos ni tokens', () => {
    const template = NOTIFICATION_TEMPLATES.ALERTA_SEGURIDAD;
    const message = template.message({ eventos: 37, ventanaMinutos: 10 });
    expect(template.title).toBe('Alerta de seguridad');
    expect(message).toContain('37');
    expect(message).toContain('10 minutos');
    expect(message).not.toMatch(/@|token|\d+\.\d+\.\d+\.\d+/i);
  });

  it('SECURITY_ALERTS_ENABLED: default false, solo true|false', () => {
    expect(parseSecurityAlertsEnabled(undefined)).toBe(false);
    expect(parseSecurityAlertsEnabled('false')).toBe(false);
    expect(parseSecurityAlertsEnabled('true')).toBe(true);
    for (const invalid of ['TRUE', 'yes', '1']) {
      expect(() => parseSecurityAlertsEnabled(invalid)).toThrow(/SECURITY_ALERTS_ENABLED/);
    }
    const base = { FRONTEND_URL: 'http://localhost:3000', JWT_SECRET: 'x'.repeat(48) };
    expect(validateEnvironment(base).app.securityAlertsEnabled).toBe(false);
    expect(validateEnvironment({ ...base, SECURITY_ALERTS_ENABLED: 'true' }).app.securityAlertsEnabled).toBe(true);
  });

  describe('deploy', () => {
    const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.name === 'Transferir .env de produccion por stdin');

    it("flag con default 'false', escrito en el .env y documentado", () => {
      expect(step?.env?.SECURITY_ALERTS_ENABLED).toBe("${{ vars.SECURITY_ALERTS_ENABLED || 'false' }}");
      expect(step?.run).toContain(`printf 'SECURITY_ALERTS_ENABLED=%s\\n' "$SECURITY_ALERTS_ENABLED"`);
      expect(readRepoFile('.env.example')).toMatch(/^SECURITY_ALERTS_ENABLED=false$/m);
    });

    it.each(['TRUE', 'yes', 'true; rm -rf /'])('rechaza SECURITY_ALERTS_ENABLED=%j antes de escribir el .env', (value) => {
      const runnerTemp = mkdtempSync(join(tmpdir(), 'g05-alerts-'));
      try {
        const env: Record<string, string> = { PATH: process.env.PATH ?? '', RUNNER_TEMP: runnerTemp };
        for (const key of Object.keys(step?.env ?? {})) {
          env[key] = `synthetic-${key.toLowerCase()}`;
        }
        Object.assign(env, {
          TRUST_PROXY_HOPS: '0',
          COOKIE_SECURE: 'false',
          BACKEND_BIND: '0.0.0.0',
          FRONTEND_BIND: '0.0.0.0',
          SECURITY_ALERTS_ENABLED: value,
        });
        const result = spawnSync('bash', ['-c', step?.run ?? 'exit 99'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('SECURITY_ALERTS_ENABLED solo admite true o false');
        expect(spawnSync('test', ['-e', join(runnerTemp, 'deploy-env')]).status).not.toBe(0);
      } finally {
        rmSync(runnerTemp, { recursive: true, force: true });
      }
    });
  });
});
