import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { TeamService } from '../src/team/team.service';
import { TeamController } from '../src/team/team.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

function makeService() {
  return {
    findTeam: vi.fn(),
    getTeamSummary: vi.fn(),
    findTeamMemberDetail: vi.fn(),
    getPendingPostulations: vi.fn(),
  };
}

function makeController(service: ReturnType<typeof makeService>) {
  return new TeamController(service as unknown as TeamService);
}

describe('TeamController.findTeam (GET /proyectos/:id/equipo)', () => {
  it('está registrado con la ruta pública histórica y protegido por JwtAuthGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TeamController.prototype.findTeam)).toBe(':id/equipo');
    expect(Reflect.getMetadata(METHOD_METADATA, TeamController.prototype.findTeam)).toBe(0); // GET

    const guards = Reflect.getMetadata(GUARDS_METADATA, TeamController.prototype.findTeam);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en TeamService.findTeam con id parseado, sin transformar la respuesta', async () => {
    const service = makeService();
    const equipo = [{ idParticipacion: 1 }];
    service.findTeam.mockResolvedValue(equipo);
    const controller = makeController(service);

    const result = await controller.findTeam(42);

    expect(service.findTeam).toHaveBeenCalledTimes(1);
    expect(service.findTeam).toHaveBeenCalledWith(42);
    expect(result).toBe(equipo);
  });

  it('el parámetro :id usa ParseIntPipe y ProjectsController ya no declara GET :id/equipo', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const teamSource = readFileSync(join(__dirname, '../src/team/team.controller.ts'), 'utf-8');
    const bloque = teamSource.slice(teamSource.indexOf("@Get(':id/equipo')"));
    const bloqueHandler = bloque.slice(0, bloque.indexOf('\n\n'));

    expect(bloqueHandler).toMatch(/@Param\('id',\s*ParseIntPipe\)/);

    const projectsSource = readFileSync(join(__dirname, '../src/projects/projects.controller.ts'), 'utf-8');
    expect(projectsSource).not.toContain("@Get(':id/equipo')");
  });
});

describe('TeamController.getTeamSummary (GET /proyectos/:id/miembros/resumen)', () => {
  describe('metadata de ruta y guard', () => {
    it('está registrado como GET en la ruta :id/miembros/resumen', () => {
      expect(
        Reflect.getMetadata(PATH_METADATA, TeamController.prototype.getTeamSummary),
      ).toBe(':id/miembros/resumen');
      expect(
        Reflect.getMetadata(METHOD_METADATA, TeamController.prototype.getTeamSummary),
      ).toBe(0); // GET
    });

    // 401 STRUCTURAL GUARD COVERAGE: no hay infraestructura HTTP E2E real en
    // este repo (Supertest/Nest bootstrap), así que no se ejecuta una
    // petición real sin token. Lo que se demuestra aquí es que el handler
    // está decorado con JwtAuthGuard, el mismo guard que protege el resto de
    // lecturas administrativas del controller.
    it('401 STRUCTURAL GUARD COVERAGE — el handler está protegido por JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, TeamController.prototype.getTeamSummary);
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // A. Delegación camino feliz (cobertura estructural del 200)
  it('delega en TeamService.getTeamSummary con id y userId (CurrentUser), y retorna su resultado sin transformarlo', async () => {
    const service = makeService();
    const resumen = { lider: { idUsuario: 7 }, miembros: [] };
    service.getTeamSummary.mockResolvedValue(resumen);
    const controller = makeController(service);

    const result = await controller.getTeamSummary(42, { userId: 7 });

    expect(service.getTeamSummary).toHaveBeenCalledTimes(1);
    expect(service.getTeamSummary).toHaveBeenCalledWith(42, 7);
    expect(result).toBe(resumen);
  });

  // B. 403 — la excepción del service se propaga sin ser capturada/transformada
  it('propaga ForbiddenException cuando el usuario autenticado no es el líder del proyecto', async () => {
    const service = makeService();
    const error = new ForbiddenException('No eres el líder de este proyecto');
    service.getTeamSummary.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(controller.getTeamSummary(42, { userId: 7 })).rejects.toBe(error);
  });

  // C. 404 — mismo criterio
  it('propaga NotFoundException cuando el proyecto no existe o fue eliminado', async () => {
    const service = makeService();
    const error = new NotFoundException('Proyecto con id 42 no encontrado');
    service.getTeamSummary.mockRejectedValue(error);
    const controller = makeController(service);

    await expect(controller.getTeamSummary(42, { userId: 7 })).rejects.toBe(error);
  });

  // D. :id usa ParseIntPipe en el decorador del handler real (inspección
  // estructural del código fuente, igual que el patrón ya usado en
  // tasks-queries.controller.spec.ts para otras rutas de este mismo repo).
  // El parsing HTTP real de la ruta queda fuera de esta suite (no hay E2E).
  it('el parámetro :id usa ParseIntPipe (inspección estructural, no HTTP E2E)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(join(__dirname, '../src/team/team.controller.ts'), 'utf-8');
    const bloque = source.slice(source.indexOf("@Get(':id/miembros/resumen')"));
    const bloqueHandler = bloque.slice(0, bloque.indexOf('\n\n'));

    expect(bloqueHandler).toMatch(/@Param\('id',\s*ParseIntPipe\)/);
  });
});

describe('TeamController.findTeamMemberDetail (GET /proyectos/:id/equipo/:idUsuario)', () => {
  it('está registrado con la ruta pública histórica y protegido por JwtAuthGuard', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, TeamController.prototype.findTeamMemberDetail),
    ).toBe(':id/equipo/:idUsuario');
    expect(
      Reflect.getMetadata(METHOD_METADATA, TeamController.prototype.findTeamMemberDetail),
    ).toBe(0); // GET

    const guards = Reflect.getMetadata(GUARDS_METADATA, TeamController.prototype.findTeamMemberDetail);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en TeamService.findTeamMemberDetail con id, idUsuario y userId, sin transformar la respuesta', async () => {
    const service = makeService();
    const detalle = { usuario: { idUsuario: 2 }, participaciones: [], tareas: [] };
    service.findTeamMemberDetail.mockResolvedValue(detalle);
    const controller = makeController(service);

    const result = await controller.findTeamMemberDetail(42, 2, { userId: 7 });

    expect(service.findTeamMemberDetail).toHaveBeenCalledTimes(1);
    expect(service.findTeamMemberDetail).toHaveBeenCalledWith(42, 2, 7);
    expect(result).toBe(detalle);
  });

  it('los parámetros :id y :idUsuario usan ParseIntPipe (inspección estructural)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const source = readFileSync(join(__dirname, '../src/team/team.controller.ts'), 'utf-8');
    const bloque = source.slice(source.indexOf("@Get(':id/equipo/:idUsuario')"));
    const bloqueHandler = bloque.slice(0, bloque.indexOf('\n\n'));

    expect(bloqueHandler).toMatch(/@Param\('id',\s*ParseIntPipe\)/);
    expect(bloqueHandler).toMatch(/@Param\('idUsuario',\s*ParseIntPipe\)/);
  });
});
