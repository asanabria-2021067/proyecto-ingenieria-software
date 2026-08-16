import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TeamController } from '../src/team/team.controller';

function makeService() {
  return { getPendingPostulations: vi.fn() } as any;
}

describe('TeamController.getPendingPostulations', () => {
  it('registra GET /proyectos/:id/miembros/postulaciones-pendientes con JwtAuthGuard', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, TeamController.prototype.getPendingPostulations),
    ).toBe(':id/miembros/postulaciones-pendientes');
    expect(
      Reflect.getMetadata(METHOD_METADATA, TeamController.prototype.getPendingPostulations),
    ).toBe(0); // GET

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      TeamController.prototype.getPendingPostulations,
    );
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en TeamService con idProyecto y actor, retornando el resultado sin recalcularlo', async () => {
    const service = makeService();
    const postulaciones = [{ idPostulacion: 1, estadoPostulacion: 'PENDIENTE' }];
    service.getPendingPostulations.mockResolvedValue(postulaciones);
    const controller = new TeamController(service);

    const result = await controller.getPendingPostulations(42, { userId: 7 });

    expect(service.getPendingPostulations).toHaveBeenCalledTimes(1);
    expect(service.getPendingPostulations).toHaveBeenCalledWith(42, 7);
    expect(result).toBe(postulaciones);
  });

  it('usa ParseIntPipe para :id y CurrentUser para el actor', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(join(__dirname, '../src/team/team.controller.ts'), 'utf-8');
    const bloque = source.slice(source.indexOf("@Get(':id/miembros/postulaciones-pendientes')"));
    const bloqueHandler = bloque.slice(0, bloque.indexOf('\n\n'));

    expect(bloqueHandler).toMatch(/@Param\('id',\s*ParseIntPipe\)/);
    expect(bloqueHandler).toMatch(/@CurrentUser\(\)\s*user:\s*\{\s*userId:\s*number\s*\}/);
  });
});
