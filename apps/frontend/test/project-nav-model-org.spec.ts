import { describe, expect, it } from 'vitest';
import {
  buildProjectActions,
  buildProjectNavGroups,
  type ProjectNavContext,
} from '@/components/projects/navigation/project-nav-model';

const ctx: ProjectNavContext = { idProyecto: 42, actor: 'org-reader', estadoProyecto: 'EN_PROGRESO', tieneSolicitudSalida: false };

describe('org-reader (miembro de la organización dueña que no participa)', () => {
  it('ve Resumen, Tablero y Todas las tareas, sin Sprints, Equipo ni Seguimiento', () => {
    const estructura = buildProjectNavGroups(ctx).map((grupo) => ({
      id: grupo.id,
      items: grupo.items.map((item) => [item.label, item.href]),
    }));
    expect(estructura).toEqual([
      { id: 'resumen', items: [['Resumen', '/dashboard/proyectos/42']] },
      {
        id: 'trabajo',
        items: [
          ['Tablero (Kanban)', '/dashboard/projects/42/kanban'],
          ['Todas las tareas', '/dashboard/projects/42/tareas'],
        ],
      },
    ]);
  });

  it('no tiene acciones del proyecto: ni editar ni solicitar salida', () => {
    expect(buildProjectActions(ctx)).toEqual([]);
  });
});
