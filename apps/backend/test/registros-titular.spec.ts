import { describe, expect, it, vi } from 'vitest';
import { registrosDelTitular } from '../src/time-records/registros-titular';
import { TasksContextService } from '../src/tasks/tasks-context.service';

describe('registrosDelTitular (MEJ-109)', () => {
  it('deja solo los registros del titular del tramo', () => {
    const tramo = { idUsuario: 1, registrosTiempo: [{ idUsuario: 1, horas: 3 }, { idUsuario: 2, horas: 2 }] };
    expect(registrosDelTitular(tramo)).toEqual([{ idUsuario: 1, horas: 3 }]);
  });
});

describe('TasksContextService.esResponsableAdicional (MEJ-109)', () => {
  const crear = (fila: unknown, participacion: unknown) => {
    const prisma = {
      tareaResponsable: { findUnique: vi.fn().mockResolvedValue(fila) },
      participacionProyecto: { findFirst: vi.fn().mockResolvedValue(participacion) },
    };
    return { servicio: new TasksContextService(prisma as never), prisma };
  };

  it('es responsable solo si la fila existe y sigue con participacion ACTIVO en el proyecto', async () => {
    const activo = crear({ tarea: { idProyecto: 7 } }, { idParticipacion: 1 });
    expect(await activo.servicio.esResponsableAdicional(5, 9)).toBe(true);
    expect(activo.prisma.participacionProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idUsuario: 9, estadoParticipacion: 'ACTIVO' }) }),
    );
  });

  it('quien dejo el proyecto conserva la fila pero deja de ser responsable', async () => {
    expect(await crear({ tarea: { idProyecto: 7 } }, null).servicio.esResponsableAdicional(5, 9)).toBe(false);
  });

  it('sin fila no consulta la participacion', async () => {
    const sinFila = crear(null, { idParticipacion: 1 });
    expect(await sinFila.servicio.esResponsableAdicional(5, 9)).toBe(false);
    expect(sinFila.prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
  });
});
