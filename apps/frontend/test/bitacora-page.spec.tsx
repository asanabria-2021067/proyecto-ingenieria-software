import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProyectoDetalleDTO } from '../lib/dto/project.dto';
import type { EventoBitacoraDto } from '../lib/types/bitacora';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('../hooks/use-project-detail', () => ({ useProjectDetail: vi.fn() }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));
vi.mock('../hooks/use-project-members', () => ({ useProjectMembers: vi.fn() }));
vi.mock('../hooks/use-project-bitacora', () => ({ useProjectBitacora: vi.fn() }));

import BitacoraPage from '../app/dashboard/proyectos/[id]/bitacora/page';
import { useProjectDetail } from '../hooks/use-project-detail';
import { useCurrentUser } from '../hooks/use-current-user';
import { useProjectSprints } from '../hooks/use-project-sprints';
import { useProjectMembers } from '../hooks/use-project-members';
import { useProjectBitacora } from '../hooks/use-project-bitacora';

const proyectoFixture = {
  idProyecto: 42,
  creador: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' },
} as unknown as ProyectoDetalleDTO;

function evento(overrides: Partial<EventoBitacoraDto> = {}): EventoBitacoraDto {
  return {
    idAuditoria: 1,
    tipoEvento: 'TASK_CREATED',
    tipoEntidad: 'TAREA',
    idEntidad: 100,
    idProyecto: 42,
    idSprint: 3,
    valorAnterior: null,
    valorNuevo: { tituloTarea: 'Implementar login' },
    fechaEvento: '2026-08-12T15:30:00.000Z',
    actor: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
    ...overrides,
  };
}

function mockLeader(isLeader = true) {
  (useProjectDetail as any).mockReturnValue({ data: proyectoFixture, isLoading: false });
  (useCurrentUser as any).mockReturnValue({ data: { idUsuario: isLeader ? 1 : 999 }, isLoading: false });
}

function mockSprints(sprints: any[] = [{ idSprint: 3, numero: 3 }]) {
  (useProjectSprints as any).mockReturnValue({ sprints });
}

function mockMembers(members: any[] = [{ idUsuario: 1, nombre: 'Ana', apellido: 'Lopez' }]) {
  (useProjectMembers as any).mockReturnValue({ members });
}

function mockBitacora(overrides: Record<string, unknown> = {}) {
  (useProjectBitacora as any).mockReturnValue({
    eventos: [evento()],
    total: 1,
    totalPages: 1,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function renderPage() {
  return render(createElement(BitacoraPage));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BitacoraPage — encabezado', () => {
  it('muestra el título, la descripción y el back-link al hub del líder', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();

    expect(screen.getByRole('heading', { name: 'Bitácora' })).toBeInTheDocument();
    expect(
      screen.getByText('Registro de quién hizo qué, cuándo y cómo evolucionó el trabajo durante el sprint.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al proyecto/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/42',
    );
  });
});

describe('BitacoraPage — autorización (exclusiva del líder)', () => {
  it('un no-líder ve el aviso "¡No eres líder!" en vez de la línea de tiempo', () => {
    mockLeader(false);
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();

    expect(screen.getByText('¡No eres líder!')).toBeInTheDocument();
    expect(screen.getByText('No puedes acceder a la bitácora de este proyecto.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bitácora' })).not.toBeInTheDocument();
  });

  it('el líder ve la línea de tiempo normalmente', () => {
    mockLeader(true);
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();

    expect(screen.queryByText('¡No eres líder!')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bitácora' })).toBeInTheDocument();
  });

  it('un no-líder NUNCA dispara la petición al backend (useProjectBitacora recibe habilitado=false)', () => {
    mockLeader(false);
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();

    const ultimaLlamada = (useProjectBitacora as any).mock.calls.at(-1);
    expect(ultimaLlamada[2]).toBe(false);
  });

  it('el líder SÍ dispara la petición (useProjectBitacora recibe habilitado=true)', () => {
    mockLeader(true);
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();

    const ultimaLlamada = (useProjectBitacora as any).mock.calls.at(-1);
    expect(ultimaLlamada[2]).toBe(true);
  });
});

describe('BitacoraPage — loading', () => {
  it('mientras carga: skeletons, sin Empty ni eventos falsos', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ eventos: [], isLoading: true });

    const { container } = renderPage();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Todavía no hay eventos registrados.')).not.toBeInTheDocument();
  });
});

describe('BitacoraPage — error', () => {
  it('muestra role=alert y "Reintentar" llama a refetch', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    const refetch = vi.fn();
    mockBitacora({ eventos: [], isError: true, error: new Error('500'), refetch });

    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('BitacoraPage — vacío', () => {
  it('sin eventos muestra el Empty state', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ eventos: [] });

    renderPage();

    expect(screen.getByText('Todavía no hay eventos registrados.')).toBeInTheDocument();
  });
});

describe('BitacoraPage — rendering de eventos', () => {
  it('muestra el actor, el tipo de evento traducido y la fecha', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ eventos: [evento()] });

    renderPage();

    // "Tarea creada" también aparece como <option> del filtro de tipo de
    // evento — se busca específicamente la etiqueta del ítem de la línea de
    // tiempo (un <p>, no un <option>) para no depender de cuál aparece
    // primero en el DOM.
    expect(screen.getByText('Tarea creada', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Por Ana Lopez')).toBeInTheDocument();
    expect(screen.getByText('"Implementar login"')).toBeInTheDocument();
  });

  it('traduce TASK_STATUS_CHANGED como "anterior → nuevo"', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({
      eventos: [
        evento({
          tipoEvento: 'TASK_STATUS_CHANGED',
          valorAnterior: { estadoTarea: 'POR_HACER' },
          valorNuevo: { estadoTarea: 'EN_PROGRESO' },
        }),
      ],
    });

    renderPage();

    expect(screen.getByText('POR_HACER → EN_PROGRESO')).toBeInTheDocument();
  });

  it('resuelve idUsuario a nombre real cuando el usuario está en la lista de miembros', () => {
    mockLeader();
    mockSprints();
    mockMembers([{ idUsuario: 7, nombre: 'Carlos', apellido: 'Diaz' }]);
    mockBitacora({
      eventos: [evento({ tipoEvento: 'TASK_ASSIGNED', valorNuevo: { idUsuario: 7 } })],
    });

    renderPage();

    expect(screen.getByText('Asignada a Carlos Diaz')).toBeInTheDocument();
  });

  it('nunca muestra JSON crudo de valorAnterior/valorNuevo', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ eventos: [evento()] });

    renderPage();

    expect(screen.queryByText(/tituloTarea/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{.*\}/)).not.toBeInTheDocument();
  });
});

describe('BitacoraPage — filtros', () => {
  it('cambiar el filtro de sprint reinicia la página a 1 y se lo pasa al hook', () => {
    mockLeader();
    mockSprints([{ idSprint: 3, numero: 3 }]);
    mockMembers();
    mockBitacora({ totalPages: 2 });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(screen.getByLabelText('Filtrar por sprint'), { target: { value: '3' } });

    const ultimaLlamada = (useProjectBitacora as any).mock.calls.at(-1);
    expect(ultimaLlamada[1]).toEqual(expect.objectContaining({ idSprint: 3, page: 1 }));
  });

  it('cambiar el filtro de tipo de evento se lo pasa al hook', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora();

    renderPage();
    fireEvent.change(screen.getByLabelText('Filtrar por tipo de evento'), {
      target: { value: 'SPRINT_STARTED' },
    });

    const ultimaLlamada = (useProjectBitacora as any).mock.calls.at(-1);
    expect(ultimaLlamada[1]).toEqual(expect.objectContaining({ tipoEvento: 'SPRINT_STARTED' }));
  });
});

describe('BitacoraPage — paginación', () => {
  it('sin más de una página, no muestra controles de paginación', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ totalPages: 1 });

    renderPage();

    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });

  it('con varias páginas, "Siguiente" avanza y "Anterior" se deshabilita en la página 1', () => {
    mockLeader();
    mockSprints();
    mockMembers();
    mockBitacora({ totalPages: 3 });

    renderPage();

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    const ultimaLlamada = (useProjectBitacora as any).mock.calls.at(-1);
    expect(ultimaLlamada[1]).toEqual(expect.objectContaining({ page: 2 }));
  });
});
