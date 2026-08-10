import { ForbiddenException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from '../src/projects/projects.service';

/**
 * HU: aceptar/rechazar solicitudes desde la vista de miembros — subtarea:
 * postulaciones pendientes del proyecto agrupadas por rol.
 *
 * Reutiliza `ProjectsService.findPostulacionesByProject` (HU-08, ya
 * implementada y ya probada en projects.service.spec.ts: exige ownership,
 * consulta postulacion.findMany con include de postulante/rolProyecto). Esta
 * suite no repite esa matriz de Prisma: espía el método existente para
 * probar que el nuevo método lo REUTILIZA en vez de reimplementar su propia
 * consulta (criterio de aceptación "no se duplica el servicio existente").
 */

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    postulacion: { findMany: vi.fn() },
  } as any;
}

function postulacion(overrides: Record<string, unknown>) {
  return {
    idPostulacion: 1,
    idUsuarioPostulante: 1,
    idRolProyecto: 1,
    estadoPostulacion: 'PENDIENTE',
    justificacion: null,
    fechaPostulacion: new Date('2026-01-01T00:00:00.000Z'),
    postulante: { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', correo: 'ana@uvg.edu' },
    rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
    ...overrides,
  };
}

describe('ProjectsService.findPostulacionesPendientesPorRol', () => {
  it('exige ownership (mismo chequeo que findPostulacionesByProject)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({
      idProyecto: 2,
      estadoProyecto: EstadoProyecto.PUBLICADO,
      creadoPor: 7,
    });
    const service = new ProjectsService(prisma, {} as any);

    await expect(service.findPostulacionesPendientesPorRol(2, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reutiliza findPostulacionesByProject en vez de duplicar la consulta a Prisma', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 9 });
    prisma.postulacion.findMany.mockResolvedValue([]);
    const service = new ProjectsService(prisma, {} as any);
    const spy = vi.spyOn(service, 'findPostulacionesByProject');

    await service.findPostulacionesPendientesPorRol(1, 9);

    expect(spy).toHaveBeenCalledWith(1, 9);
    // La única consulta a Prisma la hace findPostulacionesByProject; este
    // método no agrega una segunda llamada a postulacion.findMany.
    expect(prisma.postulacion.findMany).toHaveBeenCalledTimes(1);
  });

  it('filtra solo postulaciones en estado PENDIENTE', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 9 });
    prisma.postulacion.findMany.mockResolvedValue([
      postulacion({ idPostulacion: 1, estadoPostulacion: 'PENDIENTE' }),
      postulacion({ idPostulacion: 2, estadoPostulacion: 'ACEPTADA' }),
      postulacion({ idPostulacion: 3, estadoPostulacion: 'RECHAZADA' }),
    ]);
    const service = new ProjectsService(prisma, {} as any);

    const grupos = await service.findPostulacionesPendientesPorRol(1, 9);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].postulaciones.map((p: any) => p.idPostulacion)).toEqual([1]);
  });

  it('agrupa las postulaciones pendientes por rol (idRolProyecto + nombreRol)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 9 });
    prisma.postulacion.findMany.mockResolvedValue([
      postulacion({
        idPostulacion: 1,
        idRolProyecto: 1,
        rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
      }),
      postulacion({
        idPostulacion: 2,
        idRolProyecto: 2,
        rolProyecto: { idRolProyecto: 2, nombreRol: 'Frontend' },
      }),
      postulacion({
        idPostulacion: 3,
        idRolProyecto: 1,
        rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
      }),
    ]);
    const service = new ProjectsService(prisma, {} as any);

    const grupos = await service.findPostulacionesPendientesPorRol(1, 9);

    expect(grupos).toEqual([
      expect.objectContaining({
        idRolProyecto: 1,
        nombreRol: 'Backend',
        postulaciones: expect.arrayContaining([
          expect.objectContaining({ idPostulacion: 1 }),
          expect.objectContaining({ idPostulacion: 3 }),
        ]),
      }),
      expect.objectContaining({
        idRolProyecto: 2,
        nombreRol: 'Frontend',
        postulaciones: [expect.objectContaining({ idPostulacion: 2 })],
      }),
    ]);
    expect(grupos[0].postulaciones).toHaveLength(2);
  });

  it('un rol sin ninguna postulación pendiente (todas resueltas) no aparece en el resultado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 9 });
    prisma.postulacion.findMany.mockResolvedValue([
      postulacion({
        idPostulacion: 1,
        idRolProyecto: 1,
        estadoPostulacion: 'ACEPTADA',
        rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' },
      }),
    ]);
    const service = new ProjectsService(prisma, {} as any);

    const grupos = await service.findPostulacionesPendientesPorRol(1, 9);

    expect(grupos).toEqual([]);
  });

  it('sin postulaciones en el proyecto, retorna un arreglo vacío', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 1, creadoPor: 9 });
    prisma.postulacion.findMany.mockResolvedValue([]);
    const service = new ProjectsService(prisma, {} as any);

    await expect(service.findPostulacionesPendientesPorRol(1, 9)).resolves.toEqual([]);
  });
});
