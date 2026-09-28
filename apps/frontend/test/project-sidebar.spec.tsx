import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// La sidebar del workspace de proyecto reemplazó a la navegación por tabs
// (commit 4f482be): debe exponer TODOS los destinos que antes vivían en la
// barra de pestañas (Resumen, Editar Información, Revisiones Pasadas, Editar
// Roles, Miembros, Sprints, Tablero) y marcar como activo únicamente el
// NavItem cuya ruta calza de forma más específica con la URL actual — un
// bug reportado hacía que, al entrar al tablero (ruta anidada bajo
// Resumen), "Resumen" y "Tablero" quedaran marcados activos a la vez.
//
// HU-154 (T-215): las ediciones (Editar Información, Editar Roles,
// Revisiones Pasadas) son acciones, no destinos: siguen disponibles con los
// mismos enlaces, pero dentro del menú «Acciones del proyecto».

// jsdom no implementa ResizeObserver y los tooltips de Radix del rail lo
// usan al montarse (mismo polyfill que historical-project-view.spec.ts).
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const pathnameMock = vi.fn(() => '/dashboard/projects/42');
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('@/hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('@/hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
// Doble mínimo: el panel real tiene su propio spec; aquí importa si está
// montado y habilitado, no su contenido.
vi.mock('@/components/projects/project-chat-panel', () => ({
  ProjectChatPanel: ({ habilitado }: { habilitado: boolean }) =>
    habilitado ? createElement('section', { 'data-testid': 'project-chat-panel' }, 'Chats del proyecto') : null,
}));
vi.mock('@/hooks/use-exit-request', () => ({ useCurrentExitRequest: vi.fn(() => ({ request: null })) }));
vi.mock('@/components/projects/leave-project-modal', () => ({ LeaveProjectModal: () => null }));

import { ProjectSidebar } from '@/components/projects/project-sidebar';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectMembers } from '@/hooks/use-project-members';
import {
  buildProjectNavGroups,
  flattenNavItems,
} from '@/components/projects/navigation/project-nav-model';

function mockLeader(overrides: Record<string, unknown> = {}) {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 1 } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 }, ...overrides },
  });
  (useProjectMembers as any).mockReturnValue({ members: [] });
}

function mockParticipante() {
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 2 } });
  (useProjectDetail as any).mockReturnValue({
    data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 } },
  });
  (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2 }] });
}

function renderSidebar() {
  return render(createElement(ProjectSidebar, { idProyecto: 42 }));
}

async function abrirAcciones() {
  const trigger = screen.getByRole('button', { name: 'Acciones del proyecto' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return within(await screen.findByRole('menu'));
}

function enlacesActivos() {
  return screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
}

describe('ProjectSidebar', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/dashboard/projects/42');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('el líder ve todos los destinos que antes exponía la barra de tabs (las ediciones, en el menú de acciones)', async () => {
    mockLeader();
    renderSidebar();

    expect(screen.getByRole('link', { name: /resumen/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
    expect(screen.getByRole('link', { name: /miembros/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/miembros',
    );
    expect(screen.getByRole('link', { name: /sprints/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/sprints',
    );
    expect(screen.getByRole('link', { name: /tablero/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/kanban',
    );
    expect(screen.getByRole('link', { name: /lista de tareas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/tareas',
    );

    const menu = await abrirAcciones();
    expect(menu.getByRole('menuitem', { name: /editar información/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/form?id=42',
    );
    expect(menu.getByRole('menuitem', { name: /revisiones pasadas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/mine/42?returnTo=/dashboard/projects/42',
    );
    expect(menu.getByRole('menuitem', { name: /editar roles/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42?openRoles=1',
    );
  });

  /**
   * El formulario de edición rechaza `EN_SOLICITUD_CIERRE` y redirige nada más
   * abrirse. Mientras la sidebar siguió ofreciendo el destino, el líder salía
   * disparado a un listado ajeno al pulsar «Volver»: la entrada prometía una
   * edición que ese estado no admite.
   */
  it.each(['EN_SOLICITUD_CIERRE', 'CERRADO'])(
    'en «%s» no ofrece editar información ni roles',
    async (estadoProyecto) => {
      mockLeader({ estadoProyecto });
      renderSidebar();

      const menu = await abrirAcciones();
      expect(menu.queryByRole('menuitem', { name: /editar información/i })).not.toBeInTheDocument();
      expect(menu.queryByRole('menuitem', { name: /editar roles/i })).not.toBeInTheDocument();
      // Lo que sí es de solo lectura sigue disponible.
      expect(menu.getByRole('menuitem', { name: /revisiones pasadas/i })).toBeInTheDocument();
    },
  );

  it('con el proyecto en progreso la edición sigue ofreciéndose', async () => {
    mockLeader({ estadoProyecto: 'EN_PROGRESO' });
    renderSidebar();

    const menu = await abrirAcciones();
    expect(menu.getByRole('menuitem', { name: /editar información/i })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /editar roles/i })).toBeInTheDocument();
  });

  it('el liderazgo tiene su propio destino, separado de «Miembros» (S7 VIEW-06)', () => {
    mockLeader();
    renderSidebar();

    expect(screen.getByRole('link', { name: /liderazgo/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/liderazgo',
    );
  });

  it('un integrante (no líder) no ve el destino de liderazgo, igual que no ve «Miembros»', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.queryByRole('link', { name: /liderazgo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /miembros/i })).not.toBeInTheDocument();
  });

  it('T-259/T-260: el líder ve el destino de Reportes', () => {
    mockLeader();
    renderSidebar();

    expect(screen.getByRole('link', { name: /reportes/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/reportes',
    );
  });

  it('T-259/T-260: un integrante (no líder) no ve «Reportes», igual que no ve «Miembros»/«Liderazgo»', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.queryByRole('link', { name: /reportes/i })).not.toBeInTheDocument();
  });

  it('HU-170: el líder ve el destino de Bitácora', () => {
    mockLeader();
    renderSidebar();

    expect(screen.getByRole('link', { name: /bitácora/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/bitacora',
    );
  });

  it('HU-170: un integrante (no líder) también ve «Bitácora», a diferencia de Miembros/Liderazgo/Sprints', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.getByRole('link', { name: /bitácora/i })).toHaveAttribute(
      'href',
      '/dashboard/proyectos/42/bitacora',
    );
    expect(screen.queryByRole('link', { name: /sprints/i })).not.toBeInTheDocument();
  });

  it('un usuario ajeno al proyecto (ni líder ni integrante) no ve «Bitácora»', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    (useProjectDetail as any).mockReturnValue({
      data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 } },
    });
    (useProjectMembers as any).mockReturnValue({ members: [{ idUsuario: 2 }] });
    renderSidebar();

    expect(screen.queryByRole('link', { name: /bitácora/i })).not.toBeInTheDocument();
  });

  it('al entrar al Tablero (ruta anidada bajo Resumen) solo un NavItem queda activo', () => {
    mockLeader();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban');
    renderSidebar();

    const activos = enlacesActivos();
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAccessibleName(/tablero/i);
  });

  it('al entrar al detalle de una tarea del tablero solo "Tablero" queda activo', () => {
    mockLeader();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban/tasks/7');
    renderSidebar();

    const activos = enlacesActivos();
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAccessibleName(/tablero/i);
  });

  it('un integrante (no líder) también ve "Lista de tareas", igual que "Tablero"', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.getByRole('link', { name: /tablero/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lista de tareas/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42/tareas',
    );
    expect(screen.queryByRole('link', { name: /editar información/i })).not.toBeInTheDocument();
  });
});

// ── HU-154 (T-215): agrupación, colapso y accesibilidad ──────────────────
describe('ProjectSidebar — navegación agrupada y colapsable', () => {
  const KEY = 'uvg-collab-project-sidebar';

  beforeEach(() => {
    window.localStorage.clear();
    pathnameMock.mockReturnValue('/dashboard/projects/42');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  function aside() {
    return document.querySelector('aside') as HTMLElement;
  }

  function hrefsDeLaNavegacion() {
    const nav = screen.getByRole('navigation', { name: 'Navegación del proyecto' });
    return within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
  }

  function colapsar() {
    fireEvent.click(screen.getByRole('button', { name: 'Contraer navegación del proyecto' }));
  }

  it('agrupa los destinos del líder bajo Trabajo, Equipo y Seguimiento', () => {
    mockLeader({ estadoProyecto: 'EN_PROGRESO' });
    renderSidebar();

    const trabajo = screen.getByRole('group', { name: 'Trabajo' });
    expect(within(trabajo).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Tablero',
      'Lista de tareas',
      'Sprints',
    ]);
    expect(within(screen.getByRole('group', { name: 'Equipo' })).getAllByRole('link').map((l) => l.textContent)).toEqual(
      ['Miembros', 'Liderazgo'],
    );
    expect(
      within(screen.getByRole('group', { name: 'Seguimiento' }))
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Bitácora', 'Analítica', 'Reportes', 'Cierre']);
  });

  it('el participante no recibe el grupo Equipo', () => {
    mockParticipante();
    renderSidebar();

    expect(screen.getByRole('group', { name: 'Trabajo' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Equipo' })).not.toBeInTheDocument();
  });

  it('las acciones no aparecen como enlaces de navegación', () => {
    mockLeader({ estadoProyecto: 'EN_PROGRESO' });
    renderSidebar();

    const hrefs = hrefsDeLaNavegacion();
    expect(hrefs).not.toContain('/dashboard/projects/mine/form?id=42');
    expect(hrefs).not.toContain('/dashboard/projects/42?openRoles=1');
    expect(hrefs).not.toContain('/dashboard/projects/mine/42?returnTo=/dashboard/projects/42');
  });

  it.each([
    ['líder', mockLeader, 'Líder'],
    ['participante', mockParticipante, 'Participante'],
  ])('muestra el chip de actor del %s', (_, mock, chip) => {
    mock();
    renderSidebar();
    expect(screen.getByText(chip)).toHaveClass('pill');
  });

  it('un visitante solo ve «Resumen», sin chip ni menú de acciones', () => {
    (useCurrentUser as any).mockReturnValue({ data: { idUsuario: 999 } });
    (useProjectDetail as any).mockReturnValue({
      data: { idProyecto: 42, tituloProyecto: 'Proyecto de prueba', creador: { idUsuario: 1 } },
    });
    (useProjectMembers as any).mockReturnValue({ members: [] });
    renderSidebar();

    expect(hrefsDeLaNavegacion()).toEqual(['/dashboard/proyectos/42']);
    expect(screen.queryByText('Líder')).not.toBeInTheDocument();
    expect(screen.queryByText('Participante')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones del proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-chat-panel')).not.toBeInTheDocument();
  });

  it('arranca expandida (w-64) y el control anuncia aria-expanded y a qué lista controla', () => {
    mockLeader();
    renderSidebar();

    expect(aside()).toHaveAttribute('data-state', 'expanded');
    expect(aside()).toHaveClass('w-64');
    const toggle = screen.getByRole('button', { name: 'Contraer navegación del proyecto' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'project-nav-42');
    expect(document.getElementById('project-nav-42')).toBeInTheDocument();
  });

  it('colapsada (w-14) conserva TODOS los destinos permitidos, con nombre accesible y en el mismo orden', () => {
    mockLeader({ estadoProyecto: 'EN_PROGRESO' });
    renderSidebar();
    const esperados = flattenNavItems(
      buildProjectNavGroups({ idProyecto: 42, actor: 'leader', estadoProyecto: 'EN_PROGRESO', tieneSolicitudSalida: false }),
    );

    colapsar();

    expect(aside()).toHaveAttribute('data-state', 'collapsed');
    expect(aside()).toHaveClass('w-14');
    expect(hrefsDeLaNavegacion()).toEqual(esperados.map((item) => item.href));
    for (const item of esperados) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
    // Sin encabezados de grupo en el rail: los separa una línea.
    expect(screen.queryByRole('group', { name: 'Trabajo' })).not.toBeInTheDocument();
    // El menú de acciones sigue disponible.
    expect(screen.getByRole('button', { name: 'Acciones del proyecto' })).toBeInTheDocument();
  });

  it('en el rail cada icono muestra su etiqueta en un tooltip', async () => {
    mockLeader();
    renderSidebar();
    colapsar();

    fireEvent.focus(screen.getByRole('link', { name: 'Tablero' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Tablero');
  });

  it('en el rail el destino activo mantiene aria-current', () => {
    mockLeader();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban/tasks/7');
    renderSidebar();
    colapsar();

    const activos = enlacesActivos();
    expect(activos).toHaveLength(1);
    expect(activos[0]).toHaveAccessibleName('Tablero');
  });

  it('al colapsar y expandir el foco pasa al control opuesto y la preferencia se guarda', () => {
    mockLeader();
    renderSidebar();

    colapsar();
    const expandir = screen.getByRole('button', { name: 'Expandir navegación del proyecto' });
    expect(expandir).toHaveFocus();
    expect(expandir).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(KEY)).toBe('collapsed');

    fireEvent.click(expandir);
    expect(screen.getByRole('button', { name: 'Contraer navegación del proyecto' })).toHaveFocus();
    expect(aside()).toHaveAttribute('data-state', 'expanded');
    expect(window.localStorage.getItem(KEY)).toBe('expanded');
  });

  it('restaura la preferencia colapsada guardada', () => {
    window.localStorage.setItem(KEY, 'collapsed');
    mockLeader();
    renderSidebar();

    expect(aside()).toHaveAttribute('data-state', 'collapsed');
    expect(screen.getByRole('button', { name: 'Expandir navegación del proyecto' })).toBeInTheDocument();
  });

  it('colapsada, el panel de chat sigue montado (oculto) y el icono de chats expande la sidebar', () => {
    mockParticipante();
    renderSidebar();
    colapsar();

    const panel = screen.getByTestId('project-chat-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.parentElement).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar chats del proyecto' }));
    expect(aside()).toHaveAttribute('data-state', 'expanded');
    expect(screen.getByTestId('project-chat-panel').parentElement).not.toHaveClass('hidden');
  });
});
// Sidebar del proyecto como navegación secundaria: fondo propio, encabezado
// «Proyecto actual», grupos con aire, activo neutro y el chat abajo.
describe('ProjectSidebar — identidad de navegación del proyecto', () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathnameMock.mockReturnValue('/dashboard/projects/42/kanban');
    mockLeader();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const aside = () => document.querySelector('aside') as HTMLElement;

  it('usa un fondo gris propio, distinto del blanco de la sidebar global', () => {
    renderSidebar();

    expect(aside()).toHaveClass('bg-surface-container', 'border-r');
    expect(aside()).not.toHaveClass('bg-card');
  });

  it('el encabezado dice «Proyecto actual» sobre el nombre, que admite dos líneas', () => {
    renderSidebar();

    const etiqueta = within(aside()).getByText('Proyecto actual');
    expect(etiqueta).toHaveClass('uppercase', 'text-xs', 'text-text-secondary');
    const nombre = within(aside()).getByText('Proyecto de prueba');
    expect(nombre).toHaveClass('line-clamp-2', 'font-semibold', 'text-text-primary');
    expect(nombre).toHaveAttribute('title', 'Proyecto de prueba');
    expect(etiqueta.compareDocumentPosition(nombre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(aside()).getByText('Líder')).toHaveClass('pill');
  });

  it('los grupos se separan con aire y sus títulos son encabezados discretos, sin iconos', () => {
    renderSidebar();

    const lista = document.getElementById('project-nav-42')!;
    expect(lista).toHaveClass('gap-card');
    for (const nombre of ['Trabajo', 'Equipo', 'Seguimiento']) {
      const titulo = within(lista).getByText(nombre);
      expect(titulo).toHaveClass('uppercase', 'text-xs', 'text-text-secondary');
      expect(titulo.querySelector('svg')).toBeNull();
    }
  });

  it('el destino activo se marca con fondo neutro y seminegrita, sin verde', () => {
    renderSidebar();

    const [activo] = enlacesActivos();
    expect(activo).toHaveTextContent('Tablero');
    expect(activo).toHaveClass('bg-on-surface/8', 'font-semibold', 'text-text-primary');
    expect(activo.className).not.toMatch(/(?<![\w-])(bg-primary|text-primary)\b/);
    const inactivo = within(aside()).getByRole('link', { name: 'Sprints' });
    expect(inactivo).toHaveClass('font-medium', 'text-text-secondary');
  });

  it('el menú ocupa el espacio libre y el chat del proyecto queda al final de la sidebar', () => {
    renderSidebar();

    const nav = within(aside()).getByRole('navigation', { name: 'Navegación del proyecto' });
    expect(nav).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
    const chat = screen.getByTestId('project-chat-panel');
    expect(nav.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside().lastElementChild).toContainElement(chat);
  });

  it('colapsada, el botón de chat se anuncia como «Chat del proyecto»', async () => {
    window.localStorage.setItem('uvg-collab-project-sidebar', 'collapsed');
    renderSidebar();

    const boton = screen.getByRole('button', { name: 'Mostrar chats del proyecto' });
    fireEvent.focus(boton);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Chat del proyecto');
  });
});
