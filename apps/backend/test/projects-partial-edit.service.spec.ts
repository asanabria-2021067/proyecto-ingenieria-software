import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProjectsService } from '../src/projects/projects.service';

const OWNER = 7;
const PID = 28;

function makePrisma() {
  return {
    proyecto: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as any;
}

function makeService(prisma: any) {
  return new ProjectsService(prisma, {} as any, {} as any);
}

function proyecto(estado: string) {
  return { idProyecto: PID, estadoProyecto: estado, creadoPor: OWNER, tituloProyecto: 'Demo' };
}

describe('ProjectsService.update — edición parcial (PUBLICADO / EN_PROGRESO)', () => {
  it('actualiza SOLO los campos permitidos y conserva el estado (PUBLICADO)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto('PUBLICADO'));
    prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: PID, estadoProyecto: 'PUBLICADO' });
    const service = makeService(prisma);

    await service.update(
      PID,
      {
        tituloProyecto: 'Nuevo título',
        descripcionProyecto: 'Nueva descripción del proyecto real.',
        objetivosProyecto: 'Objetivo 1',
        ubicacionProyecto: 'Campus',
        contextoAcademico: 'Curso X',
        urlRecursoExterno: 'https://x.com',
        fechaFinEstimada: '2026-12-01',
      } as any,
      OWNER,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled(); // no usa la ruta de edición completa
    expect(prisma.proyecto.update).toHaveBeenCalledTimes(1);
    const data = prisma.proyecto.update.mock.calls[0][0].data;
    // Campos permitidos aplicados…
    expect(data.tituloProyecto).toBe('Nuevo título');
    expect(data.fechaFinEstimada).toBeInstanceOf(Date);
    expect(data.fechaActualizacion).toBeInstanceOf(Date);
    // …y NINGÚN campo bloqueado ni el estado.
    expect(data.estadoProyecto).toBeUndefined();
    expect(data.tipoProyecto).toBeUndefined();
    expect(data.modalidadProyecto).toBeUndefined();
    expect(data.fechaInicio).toBeUndefined();
  });

  it('EN_PROGRESO también permite la edición parcial', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto('EN_PROGRESO'));
    prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: PID });
    const service = makeService(prisma);

    await service.update(PID, { descripcionProyecto: 'otra' } as any, OWNER);
    expect(prisma.proyecto.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['tipoProyecto', { tipoProyecto: 'ACADEMICO_HORAS_BECA' }],
    ['modalidadProyecto', { modalidadProyecto: 'MIXTA' }],
    ['fechaInicio', { fechaInicio: '2026-01-01' }],
    ['organizacionesIds', { organizacionesIds: [1] }],
    ['roles', { roles: [{ nombreRol: 'x', cupos: 1 }] }],
  ])('rechaza (400) un campo bloqueado en edición parcial: %s', async (_label, extra) => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto('PUBLICADO'));
    const service = makeService(prisma);

    await expect(
      service.update(PID, { tituloProyecto: 'ok', ...extra } as any, OWNER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.proyecto.update).not.toHaveBeenCalled();
  });

  it('un estado no editable (CERRADO) se rechaza con 400', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyecto('CERRADO'));
    const service = makeService(prisma);

    await expect(service.update(PID, { tituloProyecto: 'x' } as any, OWNER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.proyecto.update).not.toHaveBeenCalled();
  });
});
