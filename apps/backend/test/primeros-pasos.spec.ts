import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function setup(
  datos: {
    biografia?: string | null;
    habilidades?: number;
    registro?: boolean;
    postulaciones?: number;
    organizaciones?: number;
    mensajes?: number;
    cerrada?: boolean;
    sinUsuario?: boolean;
  } = {},
) {
  const prisma = {
    usuario: {
      findUnique: vi.fn().mockResolvedValue(
        datos.sinUsuario
          ? null
          : {
              primerosPasosCerradosEn: datos.cerrada ? new Date() : null,
              perfil: { biografia: datos.biografia ?? null },
              _count: { habilidades: datos.habilidades ?? 0 },
            },
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    registroHorasSemestre: { findUnique: vi.fn().mockResolvedValue(datos.registro ? { idRegistro: 1 } : null) },
    postulacion: { count: vi.fn().mockResolvedValue(datos.postulaciones ?? 0) },
    usuarioOrganizacion: { count: vi.fn().mockResolvedValue(datos.organizaciones ?? 0) },
    mensajeChat: { count: vi.fn().mockResolvedValue(datos.mensajes ?? 0) },
  };
  return { service: new UsersService(prisma as unknown as PrismaService), prisma };
}

describe('MEJ-88 primeros pasos', () => {
  it('usuario nuevo: ningún paso completado y la tarjeta visible', async () => {
    const r = await setup().service.getPrimerosPasos(1);
    expect(r.pasos.map((p) => [p.clave, p.completado])).toEqual([
      ['perfil', false],
      ['horas', false],
      ['postulacion', false],
      ['organizacion', false],
      ['mensaje', false],
    ]);
    expect(r).toMatchObject({ completados: 0, total: 5, cerrada: false, visible: true });
  });

  it('cada paso se calcula desde sus datos', async () => {
    const r = await setup({ habilidades: 2, registro: true, postulaciones: 1, organizaciones: 1, mensajes: 3 }).service.getPrimerosPasos(1);
    expect(r.pasos.every((p) => p.completado)).toBe(true);
    expect(r.completados).toBe(5);
  });

  it('la biografía sola completa el paso del perfil', async () => {
    const r = await setup({ biografia: 'Hola' }).service.getPrimerosPasos(1);
    expect(r.pasos[0]).toEqual({ clave: 'perfil', completado: true });
    expect(r.completados).toBe(1);
  });

  it('se oculta al completar los cinco pasos', async () => {
    const r = await setup({ biografia: 'x', registro: true, postulaciones: 1, organizaciones: 1, mensajes: 1 }).service.getPrimerosPasos(1);
    expect(r.visible).toBe(false);
    expect(r.cerrada).toBe(false);
  });

  it('se oculta al cerrarla aunque falten pasos', async () => {
    const r = await setup({ cerrada: true }).service.getPrimerosPasos(1);
    expect(r).toMatchObject({ completados: 0, cerrada: true, visible: false });
  });

  it('solo cuenta las horas del semestre actual y los datos del propio usuario', async () => {
    const { service, prisma } = setup();
    await service.getPrimerosPasos(42);
    const clave = prisma.registroHorasSemestre.findUnique.mock.calls[0][0].where.idUsuario_anio_periodo;
    expect(clave.idUsuario).toBe(42);
    expect(clave.anio).toBeGreaterThanOrEqual(2026);
    expect([1, 2]).toContain(clave.periodo);
    expect(prisma.postulacion.count.mock.calls[0][0].where).toEqual({ idUsuarioPostulante: 42 });
    expect(prisma.usuarioOrganizacion.count.mock.calls[0][0].where).toEqual({ idUsuario: 42, estadoMembresia: 'ACTIVA' });
    expect(prisma.mensajeChat.count.mock.calls[0][0].where).toEqual({ idRemitente: 42, eliminadoEn: null });
  });

  it('usuario inexistente da 404', async () => {
    await expect(setup({ sinUsuario: true }).service.getPrimerosPasos(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cerrar guarda la fecha solo del propio usuario', async () => {
    const { service, prisma } = setup();
    expect(await service.cerrarPrimerosPasos(5)).toEqual({ cerrada: true });
    expect(prisma.usuario.update.mock.calls[0][0].where).toEqual({ idUsuario: 5 });
    expect(prisma.usuario.update.mock.calls[0][0].data.primerosPasosCerradosEn).toBeInstanceOf(Date);
  });

  it('las rutas viven en un controlador con JwtAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toContain(JwtAuthGuard);
    expect(typeof UsersController.prototype.getPrimerosPasos).toBe('function');
    expect(typeof UsersController.prototype.cerrarPrimerosPasos).toBe('function');
  });
});
