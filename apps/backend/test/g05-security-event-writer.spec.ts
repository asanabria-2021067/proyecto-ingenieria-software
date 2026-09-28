import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { REDACTED } from '../src/common/interceptors/audit.interceptor';
import { SecurityEventsModule } from '../src/security-events/security-events.module';
import { SecurityEventsService } from '../src/security-events/security-events.service';
import { TIPO_OBJETO_SEGURIDAD } from '../src/security-events/tipos-evento-seguridad';

/**
 * G05-C03 · OWASP25-C037. Writer best-effort: persiste el evento con su
 * propia operación y un detalle redactado; si el almacenamiento falla,
 * devuelve false sin lanzar y el warning no contiene datos del evento.
 */

function withCreate(create: ReturnType<typeof vi.fn>) {
  const service = new SecurityEventsService({ bitacoraAuditoria: { create } } as unknown as PrismaService);
  const warn = vi
    .spyOn((service as unknown as { logger: { warn: (message: string) => void } }).logger, 'warn')
    .mockImplementation(() => undefined);
  return { service, warn };
}

describe('G05-C03: writer best-effort de eventos de seguridad', () => {
  it('escribe una fila de seguridad con detalle redactado', async () => {
    const create = vi.fn().mockResolvedValue({});
    const { service } = withCreate(create);

    const ok = await service.record({
      tipo: 'LOGIN_SUCCEEDED',
      idActor: 7,
      idUsuarioAfectado: 7,
      detalle: { motivo: 'x', sesion: { refreshToken: 'no-debe-guardarse' } },
    });

    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        idUsuario: 7,
        accion: 'LOGIN_SUCCEEDED',
        tipoObjeto: TIPO_OBJETO_SEGURIDAD,
        idObjeto: '7',
        detalleJson: { motivo: 'x', sesion: { refreshToken: REDACTED } },
      },
    });
  });

  it('sin actor ni cuenta afectada: columnas nulas', async () => {
    const create = vi.fn().mockResolvedValue({});
    const { service } = withCreate(create);
    await service.record({ tipo: 'LOGIN_FAILED' });
    expect(create.mock.calls[0][0].data).toMatchObject({ idUsuario: null, idObjeto: null, detalleJson: {} });
  });

  it('si la base falla no lanza, devuelve false y el warning no incluye datos del evento', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED ci:secreto@db'), { name: 'PrismaClientInitializationError' }));
    const { service, warn } = withCreate(create);

    await expect(
      service.record({ tipo: 'LOGIN_FAILED', detalle: { cuentaRef: 'abc123', password: 'Clave-Secreta' } }),
    ).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toBe('Evento de seguridad no registrado (LOGIN_FAILED): PrismaClientInitializationError');
    expect(message).not.toMatch(/secreto|Clave-Secreta|abc123|ECONNREFUSED/);
  });

  it('está registrado como módulo global e importado por AppModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SecurityEventsModule)).toContain(SecurityEventsService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, SecurityEventsModule)).toContain(SecurityEventsService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(SecurityEventsModule);
  });
});
