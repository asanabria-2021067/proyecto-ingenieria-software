import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { SecurityEventsService } from '../../src/security-events/security-events.service';
import { SECURITY_ALERT_POLICY, SecurityAlertsService } from '../../src/security-events/security-alerts.service';

/**
 * G05-C12 · OWASP25-C038. Contra PostgreSQL real: con el flag apagado una
 * ráfaga no crea notificaciones; encendido, la ráfaga crea UNA alerta
 * ALERTA_SEGURIDAD por administrador y los eventos siguientes (misma
 * instancia u otra) no la repiten dentro de la ventana de deduplicación.
 */
describeIntegration('G05-C12 — alertas de ráfaga (PostgreSQL real)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('flag false: 0 alertas; flag true + umbral: 1 por admin y deduplicada', async () => {
    const admin = await createIntegrationUser(prisma);
    const target = await createIntegrationUser(prisma);
    const rol = await prisma.rolAcceso.upsert({ where: { nombrePerfil: 'administrador' }, update: {}, create: { nombrePerfil: 'administrador' } });
    const vinculo = await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    const inicio = new Date();
    const notifications = new NotificationsService(
      prisma as unknown as PrismaService,
      { notifyUsers: vi.fn().mockResolvedValue(undefined), emitToUsers: vi.fn() } as unknown as NotificationsGateway,
    );
    const writer = (enabled: boolean) =>
      new SecurityEventsService(
        prisma as unknown as PrismaService,
        new SecurityAlertsService(prisma as unknown as PrismaService, notifications, enabled),
      );
    const alertasDelAdmin = () =>
      prisma.notificacion.count({ where: { idUsuario: admin.idUsuario, tipoNotificacion: 'ALERTA_SEGURIDAD', creadaEn: { gte: inicio } } });

    try {
      const apagado = writer(false);
      for (let i = 0; i < SECURITY_ALERT_POLICY.threshold + 5; i += 1) {
        await apagado.record({ tipo: 'LOGIN_FAILED', idUsuarioAfectado: target.idUsuario });
      }
      expect(await alertasDelAdmin()).toBe(0);

      const encendido = writer(true);
      await encendido.record({ tipo: 'LOGIN_FAILED', idUsuarioAfectado: target.idUsuario });
      expect(await alertasDelAdmin()).toBe(1);

      for (let i = 0; i < 10; i += 1) {
        await encendido.record({ tipo: 'ACCOUNT_LOCKED', idUsuarioAfectado: target.idUsuario });
      }
      // Otra instancia (p. ej. tras un reinicio) consulta la base y tampoco la repite.
      await writer(true).record({ tipo: 'LOGIN_FAILED', idUsuarioAfectado: target.idUsuario });
      expect(await alertasDelAdmin()).toBe(1);

      const alerta = await prisma.notificacion.findFirstOrThrow({
        where: { idUsuario: admin.idUsuario, tipoNotificacion: 'ALERTA_SEGURIDAD', creadaEn: { gte: inicio } },
      });
      expect(alerta.tituloNotificacion).toBe('Alerta de seguridad');
      expect(JSON.stringify(alerta)).not.toMatch(/@|\d+\.\d+\.\d+\.\d+/);
    } finally {
      await prisma.notificacion.deleteMany({ where: { tipoNotificacion: 'ALERTA_SEGURIDAD', creadaEn: { gte: inicio } } });
      await prisma.bitacoraAuditoria.deleteMany({ where: { idObjeto: String(target.idUsuario) } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: vinculo.idUsuarioRolAcceso } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: [admin.idUsuario, target.idUsuario] } } });
    }
  });
});
