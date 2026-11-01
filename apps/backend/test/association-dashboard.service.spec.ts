import { describe, expect, it, vi } from 'vitest';
import { AssociationDashboardService } from '../src/associations/association-dashboard.service';
import { buildProyectosAsociacionCsv } from '../src/exports/proyectos-asociacion-report.builder';

function crear() {
  const prisma = {
    proyecto: {
      findMany: vi.fn().mockResolvedValue([
        { idProyecto: 1, tituloProyecto: 'Feria', estadoProyecto: 'EN_PROGRESO' },
        { idProyecto: 2, tituloProyecto: 'Vacio', estadoProyecto: 'PUBLICADO' },
      ]),
    },
    tarea: {
      groupBy: vi.fn().mockResolvedValue([
        { idProyecto: 1, estadoTarea: 'HECHO', _count: { _all: 1 } },
        { idProyecto: 1, estadoTarea: 'POR_HACER', _count: { _all: 3 } },
      ]),
    },
    sprint: {
      groupBy: vi.fn().mockResolvedValue([
        { idProyecto: 1, estado: 'CERRADO', _count: { _all: 2 } },
        { idProyecto: 1, estado: 'ACTIVO', _count: { _all: 1 } },
      ]),
    },
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue([
        { idUsuario: 5, rolProyecto: { idProyecto: 1 } },
        { idUsuario: 5, rolProyecto: { idProyecto: 1 } },
        { idUsuario: 6, rolProyecto: { idProyecto: 1 } },
      ]),
    },
    horasParticipacion: {
      findMany: vi.fn().mockResolvedValue([
        { horasAprobadas: '10.5', participacion: { rolProyecto: { idProyecto: 1 } } },
        { horasAprobadas: null, participacion: { rolProyecto: { idProyecto: 1 } } },
      ]),
    },
  };
  const horas = { paginaCentral: vi.fn().mockResolvedValue('pagina'), recorrerTodas: vi.fn().mockResolvedValue('todas') };
  return { service: new AssociationDashboardService(prisma as never, horas as never), prisma, horas };
}

describe('AssociationDashboardService', () => {
  it('fija la asociacion de la ruta aunque el filtro traiga otra y pide proyectos activos', async () => {
    const { service, horas } = crear();
    await service.estudiantes(3, { enRiesgo: true, idAsociacion: 99 } as never);
    expect(horas.paginaCentral).toHaveBeenCalledWith(expect.objectContaining({ idAsociacion: 3, enRiesgo: true, conProyectos: true }));
    await service.todosLosEstudiantes(3, { busqueda: 'ana', idAsociacion: 99 } as never);
    expect(horas.recorrerTodas).toHaveBeenCalledWith(expect.objectContaining({ idAsociacion: 3, busqueda: 'ana' }));
  });

  it('proyectos: solo los de la asociacion, con avance de tareas y sprints, integrantes y horas', async () => {
    const { service, prisma } = crear();
    const filas = await service.proyectos(3);
    expect(prisma.proyecto.findMany.mock.calls[0][0].where).toEqual({
      idAsociacion: 3,
      eliminadoEn: null,
      estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO'] },
    });
    expect(filas[0]).toEqual({
      idProyecto: 1,
      titulo: 'Feria',
      estado: 'EN_PROGRESO',
      avanceTareasPct: 25,
      avanceSprintsPct: 67,
      integrantes: 2,
      horasAcreditadas: 10.5,
    });
    expect(filas[1]).toMatchObject({ avanceTareasPct: 0, avanceSprintsPct: 0, integrantes: 0, horasAcreditadas: 0 });
  });

  it('CSV de proyectos con cabecera y una fila por proyecto', () => {
    const csv = buildProyectosAsociacionCsv([
      { titulo: '=Feria', estado: 'EN_PROGRESO', avanceTareasPct: 25, avanceSprintsPct: 67, integrantes: 2, horasAcreditadas: 10.5 },
    ]);
    expect(csv).toContain('Proyecto;Estado;Avance tareas (%)');
    expect(csv).toContain("'=Feria;EN_PROGRESO;25;67;2;10.5");
  });
});
