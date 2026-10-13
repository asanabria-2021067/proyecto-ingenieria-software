import { describe, expect, it } from 'vitest';
import {
  buildProjectActions,
  buildProjectNavGroups,
  flattenNavItems,
  resolveActiveHref,
  type ProjectNavContext,
} from '@/components/projects/navigation/project-nav-model';

// HU-154 (T-215): el modelo es la única fuente de la navegación contextual.
// Los hrefs y condiciones son los que exponía la sidebar plana previa; aquí
// se congela la matriz actor × estado para que la agrupación no pueda
// cambiar a dónde lleva cada destino ni quién lo ve.

const ID = 42;

function ctx(overrides: Partial<ProjectNavContext> = {}): ProjectNavContext {
  return {
    idProyecto: ID,
    actor: 'leader',
    estadoProyecto: 'EN_PROGRESO',
    tieneSolicitudSalida: false,
    ...overrides,
  };
}

function estructura(context: ProjectNavContext) {
  return buildProjectNavGroups(context).map((grupo) => ({
    id: grupo.id,
    label: grupo.label,
    items: grupo.items.map((item) => [item.label, item.href]),
  }));
}

describe('buildProjectNavGroups', () => {
  it('líder EN_PROGRESO: cuatro grupos en orden, con todos sus destinos y hrefs', () => {
    expect(estructura(ctx())).toEqual([
      { id: 'resumen', label: null, items: [['Resumen', '/dashboard/projects/42']] },
      {
        id: 'trabajo',
        label: 'Trabajo',
        items: [
          ['Tablero', '/dashboard/projects/42/kanban'],
          ['Lista de tareas', '/dashboard/projects/42/tareas'],
          ['Sprints', '/dashboard/proyectos/42/sprints'],
        ],
      },
      {
        id: 'equipo',
        label: 'Equipo',
        items: [
          ['Miembros', '/dashboard/proyectos/42/miembros'],
          ['Liderazgo', '/dashboard/proyectos/42/liderazgo'],
        ],
      },
      {
        id: 'seguimiento',
        label: 'Seguimiento',
        items: [
          ['Bitácora', '/dashboard/proyectos/42/bitacora'],
          ['Analítica', '/dashboard/proyectos/42/sprints/analytics'],
          ['Reportes', '/dashboard/proyectos/42/reportes'],
          ['Cierre', '/dashboard/projects/42/cierre'],
        ],
      },
    ]);
  });

  it('líder EN_SOLICITUD_CIERRE conserva «Cierre» (puede corregir la solicitud)', () => {
    const labels = flattenNavItems(buildProjectNavGroups(ctx({ estadoProyecto: 'EN_SOLICITUD_CIERRE' }))).map(
      (i) => i.label,
    );
    expect(labels).toContain('Cierre');
  });

  it.each(['CERRADO', 'PUBLICADO', 'BORRADOR', undefined])('líder en %s no ve «Cierre»', (estado) => {
    const labels = flattenNavItems(buildProjectNavGroups(ctx({ estadoProyecto: estado }))).map((i) => i.label);
    expect(labels).not.toContain('Cierre');
    expect(labels).toContain('Reportes');
  });

  it('participante: Resumen por la ruta pública, Trabajo sin Sprints, sin Equipo, Seguimiento sin Reportes/Cierre', () => {
    expect(estructura(ctx({ actor: 'participant' }))).toEqual([
      { id: 'resumen', label: null, items: [['Resumen', '/dashboard/proyectos/42']] },
      {
        id: 'trabajo',
        label: 'Trabajo',
        items: [
          ['Tablero', '/dashboard/projects/42/kanban'],
          ['Lista de tareas', '/dashboard/projects/42/tareas'],
        ],
      },
      {
        id: 'seguimiento',
        label: 'Seguimiento',
        items: [
          ['Bitácora', '/dashboard/proyectos/42/bitacora'],
          ['Analítica', '/dashboard/proyectos/42/sprints/analytics'],
        ],
      },
    ]);
  });

  it('visitante: solo «Resumen»; los grupos vacíos no se emiten', () => {
    expect(estructura(ctx({ actor: 'visitor' }))).toEqual([
      { id: 'resumen', label: null, items: [['Resumen', '/dashboard/proyectos/42']] },
    ]);
  });

  it('ningún grupo emitido está vacío para ningún actor ni estado', () => {
    for (const actor of ['leader', 'participant', 'visitor'] as const) {
      for (const estadoProyecto of ['EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO', undefined]) {
        for (const grupo of buildProjectNavGroups(ctx({ actor, estadoProyecto }))) {
          expect(grupo.items.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('los ids de destino son únicos (sirven de key en las tres superficies)', () => {
    const ids = flattenNavItems(buildProjectNavGroups(ctx())).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildProjectActions', () => {
  it('líder con proyecto editable: editar información, editar roles y revisiones pasadas', () => {
    expect(buildProjectActions(ctx()).map((a) => [a.id, a.kind === 'link' ? a.href : null])).toEqual([
      ['editar-informacion', '/dashboard/projects/mine/form?id=42'],
      ['editar-roles', '/dashboard/projects/42?openRoles=1'],
      ['revisiones-pasadas', '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42'],
    ]);
  });

  it.each(['EN_SOLICITUD_CIERRE', 'CERRADO'])('líder en %s solo conserva «Revisiones pasadas»', (estado) => {
    expect(buildProjectActions(ctx({ estadoProyecto: estado })).map((a) => a.id)).toEqual(['revisiones-pasadas']);
  });

  it('participante sin solicitud: «Solicitar salida» abre el modal, no navega', () => {
    const acciones = buildProjectActions(ctx({ actor: 'participant', tieneSolicitudSalida: false }));
    expect(acciones).toHaveLength(1);
    expect(acciones[0]).toMatchObject({ id: 'solicitar-salida', kind: 'leave-modal', label: 'Solicitar salida' });
  });

  it('participante con solicitud abierta: «Ver solicitud de salida» lleva a su preparación', () => {
    const acciones = buildProjectActions(ctx({ actor: 'participant', tieneSolicitudSalida: true }));
    expect(acciones).toEqual([
      expect.objectContaining({
        id: 'ver-solicitud-salida',
        kind: 'link',
        href: '/dashboard/projects/42/salida/preparacion',
        label: 'Ver solicitud de salida',
      }),
    ]);
  });

  it('visitante: sin acciones', () => {
    expect(buildProjectActions(ctx({ actor: 'visitor' }))).toEqual([]);
  });

  it('una solicitud de salida del líder no le añade acciones de participante', () => {
    expect(buildProjectActions(ctx({ tieneSolicitudSalida: true })).map((a) => a.id)).not.toContain(
      'ver-solicitud-salida',
    );
  });

  it('ninguna acción aparece como destino de la navegación (acciones ≠ destinos)', () => {
    for (const actor of ['leader', 'participant'] as const) {
      for (const tieneSolicitudSalida of [false, true]) {
        const context = ctx({ actor, tieneSolicitudSalida });
        const destinos = flattenNavItems(buildProjectNavGroups(context));
        const hrefs = new Set(destinos.map((d) => d.href));
        const labels = new Set(destinos.map((d) => d.label.toLowerCase()));
        for (const accion of buildProjectActions(context)) {
          if (accion.kind === 'link') expect(hrefs.has(accion.href)).toBe(false);
          expect(labels.has(accion.label.toLowerCase())).toBe(false);
        }
      }
    }
  });
});

describe('resolveActiveHref', () => {
  const grupos = buildProjectNavGroups(ctx());

  it('en Resumen solo Resumen queda activo', () => {
    expect(resolveActiveHref(grupos, '/dashboard/projects/42')).toBe('/dashboard/projects/42');
  });

  it('en el tablero gana Tablero, no Resumen (href más específico)', () => {
    expect(resolveActiveHref(grupos, '/dashboard/projects/42/kanban')).toBe('/dashboard/projects/42/kanban');
  });

  it('en el detalle de una tarea del tablero sigue activo Tablero', () => {
    expect(resolveActiveHref(grupos, '/dashboard/projects/42/kanban/tasks/7')).toBe('/dashboard/projects/42/kanban');
  });

  it('en la analítica de sprints gana Analítica sobre Sprints', () => {
    expect(resolveActiveHref(grupos, '/dashboard/proyectos/42/sprints/analytics')).toBe(
      '/dashboard/proyectos/42/sprints/analytics',
    );
    expect(resolveActiveHref(grupos, '/dashboard/proyectos/42/sprints/9/finalizar')).toBe(
      '/dashboard/proyectos/42/sprints',
    );
  });

  it('no confunde prefijos parciales ni rutas de otro proyecto', () => {
    expect(resolveActiveHref(grupos, '/dashboard/projects/420')).toBeNull();
    expect(resolveActiveHref(grupos, '/dashboard/projects/42/kanbanx')).toBe('/dashboard/projects/42');
    expect(resolveActiveHref(grupos, '/dashboard/mis-tareas')).toBeNull();
  });
});

describe('flattenNavItems', () => {
  it('conserva el orden de grupos e ítems', () => {
    expect(flattenNavItems(buildProjectNavGroups(ctx({ actor: 'participant' }))).map((i) => i.label)).toEqual([
      'Resumen',
      'Tablero',
      'Lista de tareas',
      'Bitácora',
      'Analítica',
    ]);
  });
});
