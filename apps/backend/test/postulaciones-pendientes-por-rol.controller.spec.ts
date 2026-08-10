import { describe, expect, it, vi } from 'vitest';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProjectsController } from '../src/projects/projects.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

function makeService() {
  return { findPostulacionesPendientesPorRol: vi.fn() } as any;
}

describe('ProjectsController.findPostulacionesPendientesPorRol (GET /proyectos/:id/postulaciones/pendientes)', () => {
  it('está registrado como GET en la ruta :id/postulaciones/pendientes', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ProjectsController.prototype.findPostulacionesPendientesPorRol),
    ).toBe(':id/postulaciones/pendientes');
    expect(
      Reflect.getMetadata(METHOD_METADATA, ProjectsController.prototype.findPostulacionesPendientesPorRol),
    ).toBe(0); // GET
  });

  it('exige JwtAuthGuard a nivel de método (mismo criterio que el resto de rutas de líder)', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ProjectsController.prototype.findPostulacionesPendientesPorRol,
    );
    expect(guards).toContain(JwtAuthGuard);
  });

  it('delega en ProjectsService.findPostulacionesPendientesPorRol con id (Param) y userId (CurrentUser)', () => {
    const service = makeService();
    const controller = new ProjectsController(service);

    controller.findPostulacionesPendientesPorRol(5, { userId: 9 });

    expect(service.findPostulacionesPendientesPorRol).toHaveBeenCalledWith(5, 9);
  });

  it('retorna exactamente lo que resuelve el service, sin transformarlo', async () => {
    const service = makeService();
    const grupos = [{ idRolProyecto: 1, nombreRol: 'Backend', postulaciones: [] }];
    service.findPostulacionesPendientesPorRol.mockResolvedValue(grupos);
    const controller = new ProjectsController(service);

    const result = await controller.findPostulacionesPendientesPorRol(5, { userId: 9 });

    expect(result).toBe(grupos);
  });

  it('propaga los errores de autorización que lance el service (p. ej. no ser el líder)', async () => {
    const service = makeService();
    const error = new Error('no eres el líder');
    service.findPostulacionesPendientesPorRol.mockRejectedValue(error);
    const controller = new ProjectsController(service);

    await expect(controller.findPostulacionesPendientesPorRol(5, { userId: 9 })).rejects.toBe(error);
  });
});
