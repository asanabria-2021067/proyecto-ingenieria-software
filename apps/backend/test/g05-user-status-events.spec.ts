import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AdminService } from '../src/admin/admin.service';

/**
 * G05-C07 · OWASP25-C037. Un cambio de estado de cuenta hecho por un admin
 * deja un USER_STATUS_CHANGED con actor, cuenta afectada y transición; sin
 * datos personales. Sin cambio real o sin permiso, no hay evento.
 */

function setup(estadoActual: string, esAdminCaller = true) {
  const create = vi.fn().mockResolvedValue({});
  const persona = { idUsuario: 5, nombre: 'Ana', apellido: 'Pérez', correo: 'ana@uvg.edu.gt', fechaCreacion: new Date('2026-01-01T00:00:00Z'), rolesAcceso: [] };
  const update = vi.fn(async ({ data }: { data: { estado: string } }) => ({ ...persona, estado: data.estado }));
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdminCaller ? { idUsuario: 1 } : null) },
    usuario: {
      findUnique: vi.fn().mockResolvedValue({ ...persona, estado: estadoActual }),
      update,
    },
    bitacoraAuditoria: { create },
  };
  return { admin: new AdminService(prisma as unknown as PrismaService, new JwtService({})), create, update };
}

describe('G05-C07: cambios administrativos de estado de cuenta', () => {
  it.each([
    ['ACTIVO', 'BLOQUEADO'],
    ['BLOQUEADO', 'ACTIVO'],
    ['ACTIVO', 'INACTIVO'],
  ])('%s → %s produce exactamente un USER_STATUS_CHANGED', async (anterior, nuevo) => {
    const { admin, create } = setup(anterior);
    await admin.updateUsuarioEstado(1, 5, nuevo as 'ACTIVO');
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0].data;
    expect(row).toEqual({
      idUsuario: 1,
      accion: 'USER_STATUS_CHANGED',
      tipoObjeto: 'SEGURIDAD_CUENTA',
      idObjeto: '5',
      detalleJson: { estadoAnterior: anterior, estadoNuevo: nuevo },
    });
    expect(JSON.stringify(row)).not.toMatch(/ana@|Ana|Pérez/);
  });

  it('mismo estado: sin evento', async () => {
    const { admin, create } = setup('ACTIVO');
    await admin.updateUsuarioEstado(1, 5, 'ACTIVO');
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['ACTIVO', 'INACTIVO', 'BLOQUEADO'] as const)(
    'cuenta pendiente de verificación → %s responde 409 y no cambia el estado ni deja evento',
    async (nuevo) => {
      const { admin, create, update } = setup('PENDIENTE_VERIFICACION');
      const intento = admin.updateUsuarioEstado(1, 5, nuevo);
      await expect(intento).rejects.toBeInstanceOf(ConflictException);
      await expect(intento).rejects.toThrow(/aprobar o rechazar en cuentas pendientes/);
      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('sin rol admin: se rechaza y no hay evento', async () => {
    const { admin, create } = setup('ACTIVO', false);
    await expect(admin.updateUsuarioEstado(2, 5, 'BLOQUEADO')).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });
});
