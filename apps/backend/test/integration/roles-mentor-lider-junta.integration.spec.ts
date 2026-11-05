import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { AdminService } from '../../src/admin/admin.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { Roles } from '../../src/common/decorators/roles.decorator';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';

/**
 * Rol mentor eliminado y lider_asociacion derivado de la junta, sobre PostgreSQL real.
 * La migracion se ejecuta de nuevo sobre datos sembrados (el deploy ya la aplico en vacio).
 */
const SQL = readFileSync(
  join(__dirname, '..', '..', 'prisma', 'migrations', '20261209000000_quitar_rol_mentor', 'migration.sql'),
  'utf8',
);

function sentencias(sql: string): string[] {
  const limpio = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  return (limpio.match(/\s*DO \$\$[\s\S]*?END \$\$;|[^;]+;/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

describeIntegration('rol mentor eliminado y lider_asociacion derivado de la junta', () => {
  let prisma: PrismaClient;
  const userIds: number[] = [];
  const u = { soloMentor: 0, mentorYEst: 0, mentorAdmin: 0, liderSinJunta: 0, liderArchivada: 0, liderYAdmin: 0, miembro: 0, archivada: 0, otro: 0 };
  let idAsociacion = 0;
  let idArchivada = 0;
  const roles: Record<string, number> = {};

  async function migrar() {
    await prisma.$transaction(async (tx) => {
      for (const s of sentencias(SQL)) await tx.$executeRawUnsafe(s);
    });
  }

  async function dar(idUsuario: number, rol: string) {
    await prisma.usuarioRolAcceso.create({ data: { idUsuario, idRolAcceso: roles[rol] } });
  }

  async function rolesGuardados(idUsuario: number) {
    const f = await prisma.usuarioRolAcceso.findMany({
      where: { idUsuario },
      select: { rolAcceso: { select: { nombrePerfil: true } } },
    });
    return f.map((r) => r.rolAcceso.nombrePerfil).sort();
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    for (const nombrePerfil of ['estudiante', 'lider_asociacion', 'administrador', 'mentor']) {
      const r = await prisma.rolAcceso.upsert({ where: { nombrePerfil }, update: {}, create: { nombrePerfil } });
      roles[nombrePerfil] = r.idRolAcceso;
    }
    for (const k of Object.keys(u) as (keyof typeof u)[]) {
      const x = await createIntegrationUser(prisma, { nombre: k, apellido: 'Roles' });
      u[k] = x.idUsuario;
      userIds.push(x.idUsuario);
    }
    await dar(u.soloMentor, 'mentor');
    await dar(u.mentorYEst, 'mentor');
    await dar(u.mentorYEst, 'estudiante');
    await dar(u.mentorAdmin, 'mentor');
    await dar(u.mentorAdmin, 'administrador');
    await dar(u.liderSinJunta, 'lider_asociacion');
    await dar(u.liderArchivada, 'lider_asociacion');
    await dar(u.liderYAdmin, 'lider_asociacion');
    await dar(u.liderYAdmin, 'administrador');
    await dar(u.miembro, 'estudiante');
    await dar(u.archivada, 'estudiante');
    await dar(u.otro, 'estudiante');
    const a = await prisma.asociacion.create({ data: { nombre: `Asoc roles ${Date.now()}` } });
    const b = await prisma.asociacion.create({ data: { nombre: `Asoc archivada roles ${Date.now()}`, archivada: true } });
    idAsociacion = a.idAsociacion;
    idArchivada = b.idAsociacion;
    await prisma.juntaAsociacion.create({
      data: { idAsociacion, idUsuario: u.miembro, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' },
    });
    await prisma.juntaAsociacion.create({
      data: { idAsociacion: idArchivada, idUsuario: u.liderArchivada, cargo: 'VOCAL', nivelPermiso: 'LECTURA' },
    });
    await prisma.juntaAsociacion.create({
      data: { idAsociacion: idArchivada, idUsuario: u.archivada, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' },
    });
  }, 60_000);

  afterAll(async () => {
    try {
      await prisma.juntaAsociacion.deleteMany({ where: { idUsuario: { in: userIds } } });
      await prisma.asociacion.deleteMany({ where: { idAsociacion: { in: [idAsociacion, idArchivada] } } });
      await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('la migracion reasigna a estudiante a quien tenia mentor, conserva otros roles y borra el rol', async () => {
    await migrar();

    expect(await rolesGuardados(u.soloMentor)).toEqual(['estudiante']);
    expect(await rolesGuardados(u.mentorYEst)).toEqual(['estudiante']);
    expect(await rolesGuardados(u.mentorAdmin)).toEqual(['administrador', 'estudiante']);
    expect(await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'mentor' } })).toBeNull();
  });

  it('la migracion conserva a quien tiene lider_asociacion sin junta, mantiene el rol en el catalogo y es idempotente', async () => {
    await migrar();

    // Sin junta activa el rol viejo no tiene efecto: se conserva la fila y se agrega estudiante.
    expect(await rolesGuardados(u.liderSinJunta)).toEqual(['estudiante', 'lider_asociacion']);
    expect(await rolesGuardados(u.liderArchivada)).toEqual(['estudiante', 'lider_asociacion']);
    // Con otro rol efectivo no se agrega nada.
    expect(await rolesGuardados(u.liderYAdmin)).toEqual(['administrador', 'lider_asociacion']);
    expect(await rolesGuardados(u.soloMentor)).toEqual(['estudiante']);
    expect(await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'lider_asociacion' } })).not.toBeNull();
  });

  it('un mentor que aparece despues se reasigna igual al volver a correr la migracion', async () => {
    const m = await prisma.rolAcceso.create({ data: { nombrePerfil: 'mentor' } });
    roles.mentor = m.idRolAcceso;
    const solo = await createIntegrationUser(prisma, { nombre: 'tardio', apellido: 'Roles' });
    userIds.push(solo.idUsuario);
    await dar(solo.idUsuario, 'mentor');

    await migrar();

    expect(await rolesGuardados(solo.idUsuario)).toEqual(['estudiante']);
    expect(await prisma.rolAcceso.findUnique({ where: { nombrePerfil: 'mentor' } })).toBeNull();
  });

  it('/usuarios/me y la lista admin derivan lider_asociacion de la junta activa', async () => {
    const users = new UsersService(prisma as unknown as PrismaService);
    const admin = new AdminService(prisma as unknown as PrismaService, new JwtService({}));

    expect((await users.getMe(u.miembro)).roles.sort()).toEqual(['estudiante', 'lider_asociacion']);
    expect((await users.getMe(u.liderSinJunta)).roles).toEqual(['estudiante']);
    expect((await users.getMe(u.liderArchivada)).roles).toEqual(['estudiante']);
    expect((await users.getMe(u.archivada)).roles).toEqual(['estudiante']);
    expect((await users.getMe(u.otro)).roles).toEqual(['estudiante']);

    const lista = await admin.getListaUsuarios(u.mentorAdmin, { rol: 'lider_asociacion', limit: 50 });
    const ids = lista.data.map((x) => x.idUsuario);
    expect(ids).toContain(u.miembro);
    expect(ids).not.toContain(u.liderSinJunta);
    expect(ids).not.toContain(u.liderArchivada);
    expect(ids).not.toContain(u.archivada);
    expect(lista.data.find((x) => x.idUsuario === u.miembro)?.roles).toContain('lider_asociacion');

    const mentores = await admin.getListaUsuarios(u.mentorAdmin, { rol: 'mentor' });
    expect(mentores.data).toEqual([]);
  });

  it('RolesGuard con lider_asociacion autoriza por la junta, no por la fila del rol', async () => {
    class Ctl {
      @Roles('lider_asociacion')
      handler() {
        return true;
      }
    }
    const guard = new RolesGuard(new Reflector(), prisma as unknown as PrismaService);
    const ctx = (userId: number) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
        getHandler: () => Ctl.prototype.handler,
        getClass: () => Ctl,
      }) as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx(u.miembro))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(u.liderSinJunta))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(u.liderArchivada))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(u.archivada))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
