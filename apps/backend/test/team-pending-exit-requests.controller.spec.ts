import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TeamController } from '../src/team/team.controller';

function makeService() {
  return { getPendingExitRequests: vi.fn() } as any;
}

describe('TeamController.getPendingExitRequests', () => {
  it('registra GET /proyectos/:id/miembros/solicitudes-salida-pendientes con JwtAuthGuard', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, TeamController.prototype.getPendingExitRequests),
    ).toBe(':id/miembros/solicitudes-salida-pendientes');
    expect(
      Reflect.getMetadata(METHOD_METADATA, TeamController.prototype.getPendingExitRequests),
    ).toBe(0); // GET

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      TeamController.prototype.getPendingExitRequests,
    );
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en TeamService con idProyecto y actor, retornando el resultado sin recalcularlo', async () => {
    const service = makeService();
    const solicitudes = [{ idSolicitud: 1, idUsuario: 5, estadoSolicitud: 'PENDIENTE_LIDER' }];
    service.getPendingExitRequests.mockResolvedValue(solicitudes);
    const controller = new TeamController(service);

    const result = await controller.getPendingExitRequests(42, { userId: 7 });

    expect(service.getPendingExitRequests).toHaveBeenCalledTimes(1);
    expect(service.getPendingExitRequests).toHaveBeenCalledWith(42, 7);
    expect(result).toBe(solicitudes);
  });

  it('usa ParseIntPipe para :id y CurrentUser para el actor', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(join(__dirname, '../src/team/team.controller.ts'), 'utf-8');
    const bloque = source.slice(source.indexOf("@Get(':id/miembros/solicitudes-salida-pendientes')"));
    const bloqueHandler = bloque.slice(0, bloque.indexOf('\n}'));

    expect(bloqueHandler).toMatch(/@Param\('id',\s*ParseIntPipe\)/);
    expect(bloqueHandler).toMatch(/@CurrentUser\(\)\s*user:\s*\{\s*userId:\s*number\s*\}/);
  });
});
