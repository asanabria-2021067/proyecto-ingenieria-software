import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { SesionesService } from '../src/cuenta/sesiones.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SecurityEventsService } from '../src/security-events/security-events.service';

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const ID = '11111111-1111-4111-8111-111111111111';

function setup(filas: Array<Record<string, unknown>> = []) {
  const prisma = {
    tokenRefresco: {
      findMany: vi.fn().mockResolvedValue(filas),
      findFirst: vi.fn().mockResolvedValue(filas[0] ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    dispositivoUsuario: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    notificacion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const eventos = { record: vi.fn().mockResolvedValue(true) };
  const servicio = new SesionesService(prisma as unknown as PrismaService, eventos as unknown as SecurityEventsService);
  return { servicio, prisma, eventos };
}

describe('MEJ-81 SesionesService', () => {
  it('lista solo las vivas de la cuenta, sin token ni hash, y marca la actual', async () => {
    const { servicio, prisma } = setup([
      { idSesion: ID, navegador: 'Chrome', sistema: 'Windows', fechaCreacion: new Date('2026-12-03T10:00:00Z'), tokenHash: hash('actual') },
      { idSesion: 'otra', navegador: null, sistema: null, fechaCreacion: new Date('2026-12-02T10:00:00Z'), tokenHash: hash('otro') },
    ]);

    const r = await servicio.listar(7, 'actual');

    expect(prisma.tokenRefresco.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuario: 7, revocadoEn: null, expiraEn: { gt: expect.any(Date) } } }),
    );
    expect(r).toEqual([
      { idSesion: ID, navegador: 'Chrome', sistema: 'Windows', ultimoUso: '2026-12-03T10:00:00.000Z', actual: true },
      { idSesion: 'otra', navegador: 'Navegador desconocido', sistema: 'Sistema desconocido', ultimoUso: '2026-12-02T10:00:00.000Z', actual: false },
    ]);
    expect(JSON.stringify(r)).not.toContain(hash('actual'));
  });

  it('cerrar revoca solo la sesion del usuario y avisa si era la actual', async () => {
    const { servicio, prisma } = setup([{ tokenHash: hash('actual') }]);

    const r = await servicio.cerrar(7, ID, 'actual');

    expect(prisma.tokenRefresco.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idUsuario: 7, idSesion: ID }) }),
    );
    expect(prisma.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 7, idSesion: ID, revocadoEn: null },
      data: { revocadoEn: expect.any(Date), expiraEn: expect.any(Date) },
    });
    expect(r).toEqual({ cerrada: true, actual: true });
  });

  it('cerrar una sesion ajena (o inexistente) responde 404 y no revoca nada', async () => {
    const { servicio, prisma } = setup([]);

    await expect(servicio.cerrar(7, ID, 'actual')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tokenRefresco.updateMany).not.toHaveBeenCalled();
  });

  it('cerrarOtras excluye la sesion actual y se limita a la cuenta', async () => {
    const { servicio, prisma } = setup();

    const r = await servicio.cerrarOtras(7, 'actual');

    expect(prisma.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 7, revocadoEn: null, expiraEn: { gt: expect.any(Date) }, tokenHash: { not: hash('actual') } },
      data: { revocadoEn: expect.any(Date), expiraEn: expect.any(Date) },
    });
    expect(r).toEqual({ cerradas: 2 });
  });

  it('No fui yo: cierra la sesion, olvida el dispositivo, marca el aviso y registra el evento', async () => {
    const { servicio, prisma, eventos } = setup([{ huella: 'h'.repeat(64), tokenHash: hash('otro') }]);

    const r = await servicio.noFuiYo(7, ID, 'actual');

    expect(prisma.tokenRefresco.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 7, idSesion: ID, revocadoEn: null },
      data: { revocadoEn: expect.any(Date), expiraEn: expect.any(Date) },
    });
    expect(prisma.dispositivoUsuario.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 7, huella: 'h'.repeat(64) } });
    expect(prisma.notificacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idUsuario: 7, tipoNotificacion: 'NUEVO_INICIO_SESION' }) }),
    );
    expect(eventos.record).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'SESSION_REPORTED_UNKNOWN', idActor: 7 }));
    expect(r).toEqual({ cerrada: true, actual: false, cambiarContrasena: true });
  });

  it('No fui yo sobre una sesion de otra cuenta responde 404 sin tocar nada', async () => {
    const { servicio, prisma, eventos } = setup([]);

    await expect(servicio.noFuiYo(7, ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tokenRefresco.updateMany).not.toHaveBeenCalled();
    expect(prisma.dispositivoUsuario.deleteMany).not.toHaveBeenCalled();
    expect(eventos.record).not.toHaveBeenCalled();
  });
});
