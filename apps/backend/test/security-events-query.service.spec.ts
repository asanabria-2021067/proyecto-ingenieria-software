import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SecurityEventsQueryService } from '../src/security-events/security-events-query.service';

/**
 * FG01 (T-310). Lector administrativo de eventos de seguridad, con un doble de
 * Prisma: qué se le pide a la base y qué sale del servicio.
 */

interface Escenario {
  /** Estado de la cuenta del actor; null = la cuenta ya no existe. */
  estado?: 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO' | null;
  esAdmin?: boolean;
  filas?: unknown[];
}

function crear({ estado = 'ACTIVO', esAdmin = true, filas = [] }: Escenario = {}) {
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(estado ? { estado } : null) },
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuarioRolAcceso: 1 } : null) },
    bitacoraAuditoria: { findMany: vi.fn().mockResolvedValue(filas) },
  };
  const policy = new ProjectPolicyService({} as never);
  const service = new SecurityEventsQueryService(prisma as unknown as PrismaService, policy);
  return { service, prisma, policy };
}

describe('FG01-C02: solo un administrador vigente lee eventos de seguridad', () => {
  it('un administrador activo llega a la bitácora', async () => {
    const { service, prisma } = crear();
    await expect(service.list(7)).resolves.toEqual([]);
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { idUsuario: 7 }, select: { estado: true } });
    expect(prisma.bitacoraAuditoria.findMany).toHaveBeenCalledTimes(1);
  });

  it('el rol lo decide la política existente, consultada contra la base', async () => {
    const { service, prisma, policy } = crear();
    const assertAdminTx = vi.spyOn(policy, 'assertAdminTx');
    await service.list(7);
    expect(assertAdminTx).toHaveBeenCalledTimes(1);
    expect(assertAdminTx.mock.calls[0][1]).toBe(7);
    expect(prisma.usuarioRolAcceso.findFirst).toHaveBeenCalledWith({
      where: { idUsuario: 7, rolAcceso: { nombrePerfil: 'administrador' } },
      select: { idUsuarioRolAcceso: true },
    });
  });

  it.each([
    ['un estudiante activo', { esAdmin: false }],
    ['un administrador desactivado', { estado: 'INACTIVO' }],
    ['un administrador bloqueado', { estado: 'BLOQUEADO' }],
    ['una cuenta eliminada con un token aún vigente', { estado: null }],
  ] as [string, Escenario][])('%s recibe 403 y la bitácora no se lee', async (_nombre, escenario) => {
    const { service, prisma } = crear(escenario);
    const intento = service.list(8);
    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(intento).rejects.toThrow('Acceso restringido a administradores');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it('una cuenta no activa se rechaza sin consultar siquiera el rol', async () => {
    const { service, prisma } = crear({ estado: 'BLOQUEADO' });
    await expect(service.list(8)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarioRolAcceso.findFirst).not.toHaveBeenCalled();
  });

  it('una falla al comprobar el acceso se propaga y no se lee nada', async () => {
    const { service, prisma } = crear();
    prisma.usuario.findUnique.mockRejectedValueOnce(new Error('conexión perdida'));
    await expect(service.list(7)).rejects.toThrow('conexión perdida');
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });
});
