import { describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from '../src/admin/admin.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { JUNTA_ACTIVA, rolesEfectivos } from '../src/common/roles/roles-efectivos';

const fila = (nombrePerfil: string) => ({ rolAcceso: { nombrePerfil } });

function setup(usuarios: object[]) {
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue({ idUsuarioRolAcceso: 1 }) },
    usuario: {
      count: vi.fn().mockResolvedValue(usuarios.length),
      findMany: vi.fn().mockResolvedValue(usuarios),
      findUnique: vi.fn().mockResolvedValue(usuarios[0]),
    },
    proyecto: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    postulacion: { count: vi.fn().mockResolvedValue(0) },
  };
  return { prisma, service: new AdminService(prisma as unknown as PrismaService, new JwtService({})) };
}

const base = { nombre: 'N', apellido: 'A', correo: 'c@uvg.edu.gt', fotoUrl: null, estado: 'ACTIVO', fechaCreacion: new Date(0), fechaUltimaSesion: null };

describe('rolesEfectivos', () => {
  it('agrega lider_asociacion solo con junta activa y descarta la fila guardada', () => {
    expect(rolesEfectivos(['estudiante'], [{}])).toEqual(['estudiante', 'lider_asociacion']);
    expect(rolesEfectivos(['estudiante', 'lider_asociacion'], [{}])).toEqual(['estudiante', 'lider_asociacion']);
    expect(rolesEfectivos(['estudiante', 'lider_asociacion'], [])).toEqual(['estudiante']);
    expect(rolesEfectivos([], [])).toEqual([]);
  });
});

describe('AdminService: roles efectivos de usuarios', () => {
  it('la lista deriva lider_asociacion de la junta', async () => {
    const { service } = setup([
      { ...base, idUsuario: 1, rolesAcceso: [fila('estudiante')], juntasAsociacion: [{ idJuntaAsociacion: 3 }] },
      { ...base, idUsuario: 2, rolesAcceso: [fila('estudiante'), fila('lider_asociacion')], juntasAsociacion: [] },
    ]);

    const { data } = await service.getListaUsuarios(99, {});

    expect(data.map((u) => u.roles)).toEqual([['estudiante', 'lider_asociacion'], ['estudiante']]);
  });

  it('filtrar por lider_asociacion consulta la junta, no la fila del rol; otros roles siguen usando la fila', async () => {
    const { service, prisma } = setup([]);

    await service.getListaUsuarios(99, { rol: 'lider_asociacion' });
    await service.getListaUsuarios(99, { rol: 'coordinador_academico' });

    const [lider, otro] = prisma.usuario.count.mock.calls.map((c) => c[0].where);
    expect(lider).toEqual({ juntasAsociacion: { some: JUNTA_ACTIVA } });
    expect(otro).toEqual({ rolesAcceso: { some: { rolAcceso: { nombrePerfil: 'coordinador_academico' } } } });
  });

  it('el detalle expone la actividad de lider solo si integra una junta, y ya no trae actividadMentor', async () => {
    const conJunta = setup([{ ...base, idUsuario: 1, rolesAcceso: [], juntasAsociacion: [{ idJuntaAsociacion: 3 }] }]);
    const sinJunta = setup([{ ...base, idUsuario: 2, rolesAcceso: [fila('lider_asociacion')], juntasAsociacion: [] }]);

    const a = await conJunta.service.getUsuarioDetalle(99, 1);
    const b = await sinJunta.service.getUsuarioDetalle(99, 2);

    expect(a.roles).toContain('lider_asociacion');
    expect(a.actividadLider).not.toBeNull();
    expect(b.roles).toEqual([]);
    expect(b.actividadLider).toBeNull();
    expect(a).not.toHaveProperty('actividadMentor');
  });
});
