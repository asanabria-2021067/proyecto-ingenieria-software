import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Controller,
  ForbiddenException,
  Get,
  Module,
  UseGuards,
  type ExecutionContext,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA, PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { Roles, ROLES_METADATA_KEY, type RolAccesoNombre } from '../src/common/decorators/roles.decorator';
import { ADMIN_ONLY_MESSAGE, ROLE_FORBIDDEN_MESSAGE, RolesGuard } from '../src/common/guards/roles.guard';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminController } from '../src/admin/admin.controller';
import { AdminProjectsController } from '../src/project-closure/admin-projects.controller';
import { ClosureStorageAdminController } from '../src/project-closure/closure-storage-admin.controller';
import { LeadershipAdminController } from '../src/leadership/leadership-admin.controller';
import { ValidationController } from '../src/validation/validation.controller';
import { RevisionesController } from '../src/revisiones/revisiones.controller';
import { ProjectClosureController } from '../src/project-closure/project-closure.controller';
import { ProjectsController } from '../src/projects/projects.controller';
import { SYNTHETIC_JWT_SECRET } from './helpers/synthetic-jwt-secret';

/**
 * T-286 (HU-175): RolesGuard + @Roles. El guard decide por rol de acceso
 * global validado en BD; sin @Roles es un no-op; sin permiso responde 403
 * (nunca 401/500) y conserva los guards previos de cada ruta.
 */

/** Doble mínimo de Prisma: roles de acceso por usuario. */
function makePrisma(rolesPorUsuario: Record<number, RolAccesoNombre[]>) {
  const findFirst = vi.fn(
    async ({ where }: { where: { idUsuario: number; rolAcceso: { nombrePerfil: { in: string[] } } } }) => {
      const roles = rolesPorUsuario[where.idUsuario] ?? [];
      return roles.some((r) => where.rolAcceso.nombrePerfil.in.includes(r)) ? { idUsuarioRolAcceso: 1 } : null;
    },
  );
  return { usuarioRolAcceso: { findFirst } };
}

function makeGuard(roles: RolAccesoNombre[] | undefined, rolesPorUsuario: Record<number, RolAccesoNombre[]> = {}) {
  const prisma = makePrisma(rolesPorUsuario);
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
  return { guard: new RolesGuard(reflector, prisma as unknown as PrismaService), prisma, reflector };
}

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('permite continuar cuando el usuario tiene el rol exigido', async () => {
    const { guard } = makeGuard(['administrador'], { 1: ['administrador'] });
    await expect(guard.canActivate(makeContext({ userId: 1 }))).resolves.toBe(true);
  });

  it('basta con UNO de los roles listados', async () => {
    const { guard } = makeGuard(['coordinador_academico', 'administrador'], { 2: ['coordinador_academico'] });
    await expect(guard.canActivate(makeContext({ userId: 2 }))).resolves.toBe(true);
  });

  it('rechaza con 403 y el mensaje existente de admin a un rol no autorizado', async () => {
    const { guard } = makeGuard(['administrador'], { 3: ['estudiante', 'mentor'] });
    const result = guard.canActivate(makeContext({ userId: 3 }));
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(makeContext({ userId: 3 }))).rejects.toThrow(ADMIN_ONLY_MESSAGE);
  });

  it('rechaza con 403 a un usuario sin ningún rol de acceso (usuario recién registrado)', async () => {
    const { guard } = makeGuard(['administrador']);
    await expect(guard.canActivate(makeContext({ userId: 4 }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('usa un mensaje genérico cuando la ruta admite roles distintos de administrador', async () => {
    const { guard } = makeGuard(['coordinador_academico', 'administrador'], { 5: ['estudiante'] });
    await expect(guard.canActivate(makeContext({ userId: 5 }))).rejects.toThrow(ROLE_FORBIDDEN_MESSAGE);
  });

  it('consulta en BD solo los roles exigidos para el usuario autenticado', async () => {
    const { guard, prisma } = makeGuard(['administrador'], { 6: ['administrador'] });
    await guard.canActivate(makeContext({ userId: 6 }));
    expect(prisma.usuarioRolAcceso.findFirst).toHaveBeenCalledWith({
      where: { idUsuario: 6, rolAcceso: { nombrePerfil: { in: ['administrador'] } } },
      select: { idUsuarioRolAcceso: true },
    });
  });

  it('sin @Roles no restringe ni consulta la BD (no-op)', async () => {
    const { guard, prisma } = makeGuard(undefined);
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(true);
    expect(prisma.usuarioRolAcceso.findFirst).not.toHaveBeenCalled();
  });

  it('con @Roles() vacío tampoco restringe', async () => {
    const { guard, prisma } = makeGuard([]);
    await expect(guard.canActivate(makeContext({ userId: 1 }))).resolves.toBe(true);
    expect(prisma.usuarioRolAcceso.findFirst).not.toHaveBeenCalled();
  });

  it('sin usuario en el request responde 403, nunca 500', async () => {
    const { guard } = makeGuard(['administrador']);
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lee la metadata del handler con prioridad sobre la del controller', async () => {
    @Roles('administrador')
    class Ctrl {
      @Roles('coordinador_academico')
      handler() {}
      other() {}
    }
    const prisma = makePrisma({ 7: ['coordinador_academico'] });
    const guard = new RolesGuard(new Reflector(), prisma as unknown as PrismaService);
    const ctx = (handler: () => void) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user: { userId: 7 } }) }),
        getHandler: () => handler,
        getClass: () => Ctrl,
      }) as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx(Ctrl.prototype.handler))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(Ctrl.prototype.other))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

/**
 * Las rutas de H-01/H-02 (docs/seguridad/matriz-permisos.md) declaran
 * `@Roles('administrador')`, ejecutan RolesGuard DESPUÉS de JwtAuthGuard y
 * conservan ProjectWriteGuard donde ya lo tenían.
 */
describe('Rutas exclusivas de administración (T-286)', () => {
  const guardsOf = (target: object): unknown[] => Reflect.getMetadata(GUARDS_METADATA, target) ?? [];
  const rolesOf = (target: object): unknown => Reflect.getMetadata(ROLES_METADATA_KEY, target);

  it.each<[string, Type<unknown>]>([
    ['AdminController', AdminController],
    ['AdminProjectsController', AdminProjectsController],
    ['ClosureStorageAdminController', ClosureStorageAdminController],
    ['LeadershipAdminController', LeadershipAdminController],
    ['ValidationController', ValidationController],
  ])('%s exige administrador a nivel de controller', (_name, controller) => {
    expect(guardsOf(controller)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(rolesOf(controller)).toEqual(['administrador']);
  });

  it('LeadershipAdminController conserva ProjectWriteGuard en sus escrituras', () => {
    for (const handler of ['acceptAppeal', 'changeLeader', 'denyAppeal'] as const) {
      expect(guardsOf(LeadershipAdminController.prototype[handler])).toEqual([ProjectWriteGuard]);
    }
  });

  it('RevisionesController: bandeja, reclamar y resolver exigen administrador', () => {
    expect(guardsOf(RevisionesController)).toEqual([JwtAuthGuard]);
    expect(guardsOf(RevisionesController.prototype.findAdminInbox)).toEqual([RolesGuard]);
    expect(guardsOf(RevisionesController.prototype.reclamar)).toEqual([RolesGuard, ProjectWriteGuard]);
    expect(guardsOf(RevisionesController.prototype.resolver)).toEqual([RolesGuard, ProjectWriteGuard]);
    for (const handler of ['findAdminInbox', 'reclamar', 'resolver'] as const) {
      expect(rolesOf(RevisionesController.prototype[handler])).toEqual(['administrador']);
    }
    // El historial lo leen líder y admin: sin @Roles.
    expect(rolesOf(RevisionesController.prototype.findByProyecto)).toBeUndefined();
  });

  it('ProjectClosureController: solo los veredictos exigen administrador', () => {
    expect(guardsOf(ProjectClosureController)).toEqual([JwtAuthGuard]);
    for (const handler of ['approve', 'returnToExecution', 'correction'] as const) {
      expect(guardsOf(ProjectClosureController.prototype[handler])).toEqual([RolesGuard, ProjectWriteGuard]);
      expect(rolesOf(ProjectClosureController.prototype[handler])).toEqual(['administrador']);
    }
    for (const handler of ['resubmit', 'prepare', 'generateReport', 'requestClose', 'readiness'] as const) {
      expect(rolesOf(ProjectClosureController.prototype[handler])).toBeUndefined();
    }
  });

  it('ProjectsController: solo GET :id/admin exige administrador', () => {
    expect(guardsOf(ProjectsController.prototype.findOneAdmin)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(rolesOf(ProjectsController.prototype.findOneAdmin)).toEqual(['administrador']);
    expect(rolesOf(ProjectsController.prototype.findOneOwner)).toBeUndefined();
    expect(rolesOf(ProjectsController.prototype.create)).toBeUndefined();
  });
});

/**
 * Integración HTTP real con JwtAuthGuard + JwtStrategy (mismo enfoque que
 * helpers/auth-http-harness.ts: NestFactory sin @nestjs/testing, loopback y
 * puerto efímero). Verifica el orden de respuestas: 401 sin sesión, 403
 * autenticado sin rol y 200 con rol.
 */
describe('RolesGuard junto con JwtAuthGuard (HTTP)', () => {
  const ADMIN_ID = 1;
  const ESTUDIANTE_ID = 2;
  let app: INestApplication;
  let url: string;
  const jwt = new JwtService({ secret: SYNTHETIC_JWT_SECRET });
  const token = (sub: number) => jwt.sign({ sub, correo: `u${sub}@uvg.edu.gt`, tipo: 'access' }, { expiresIn: '5m' });

  beforeAll(async () => {
    @Controller('probe')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('administrador')
    class ProbeController {
      @Get()
      ok() {
        return { ok: true };
      }
    }

    const prisma = {
      ...makePrisma({ [ADMIN_ID]: ['administrador'], [ESTUDIANTE_ID]: ['estudiante'] }),
      usuario: { findUnique: vi.fn().mockResolvedValue({ estado: 'ACTIVO' }) },
    };
    // El transform de Vitest no emite design:paramtypes (ver auth-http-harness.ts).
    Reflect.defineMetadata(PARAMTYPES_METADATA, [PrismaService], JwtStrategy);
    Reflect.defineMetadata(PARAMTYPES_METADATA, [Reflector, PrismaService], RolesGuard);

    @Module({
      controllers: [ProbeController],
      providers: [JwtStrategy, { provide: PrismaService, useValue: prisma }],
    })
    class ProbeModule {}

    app = await NestFactory.create(ProbeModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}/probe`;
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (headers: Record<string, string> = {}) => fetch(url, { headers });

  it('sin token responde 401 (comportamiento de no autenticado intacto)', async () => {
    expect((await get()).status).toBe(401);
  });

  it('autenticado sin el rol responde 403 con mensaje claro', async () => {
    const res = await get({ authorization: `Bearer ${token(ESTUDIANTE_ID)}` });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe(ADMIN_ONLY_MESSAGE);
  });

  it('autenticado con el rol responde 200', async () => {
    const res = await get({ authorization: `Bearer ${token(ADMIN_ID)}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
