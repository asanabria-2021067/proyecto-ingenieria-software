import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('../lib/services/catalogs', () => ({
  getCarreras: vi.fn().mockResolvedValue([]),
  getHabilidades: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/swal', () => ({ default: { fire: vi.fn().mockResolvedValue(undefined) } }));

const updateProjectMock = vi.fn().mockResolvedValue({ idProyecto: 28, estadoProyecto: 'PUBLICADO' });
const getMyProjectByIdMock = vi.fn();
vi.mock('../lib/services/projects', () => ({
  createProject: vi.fn(),
  updateProject: (...a: unknown[]) => updateProjectMock(...a),
  getMyProjectById: (...a: unknown[]) => getMyProjectByIdMock(...a),
  submitProjectForReview: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('id=28'),
}));

import NewProjectFormPage from '../app/dashboard/projects/mine/form/page';

function proyectoPublicado() {
  return {
    idProyecto: 28,
    estadoProyecto: 'PUBLICADO',
    tituloProyecto: 'Sistema de Tutorías',
    descripcionProyecto: 'Descripción real del proyecto publicado.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    modalidadProyecto: 'MIXTA',
    objetivosProyecto: 'Objetivo A',
    ubicacionProyecto: 'Campus',
    contextoAcademico: 'Curso',
    urlRecursoExterno: '',
    fechaInicio: '2026-02-01',
    fechaFinEstimada: '2026-06-01',
    roles: [],
  };
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(NewProjectFormPage)));
}

describe('Formulario de edición — modo parcial (proyecto PUBLICADO)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra solo los campos editables (oculta tipo, modalidad y fecha de inicio)', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoPublicado());
    renderForm();

    await screen.findByRole('heading', { name: 'Editar información' });
    // Campos editables presentes.
    expect(screen.getByText('Título del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Objetivos')).toBeInTheDocument();
    expect(screen.getByText('Fecha fin estimada')).toBeInTheDocument();
    // Campos bloqueados ausentes.
    expect(screen.queryByText('Tipo')).not.toBeInTheDocument();
    expect(screen.queryByText('Modalidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Fecha de inicio')).not.toBeInTheDocument();
    // No hay pasos de roles.
    expect(screen.queryByText(/roles y habilidades/i)).not.toBeInTheDocument();
  });

  it('"Guardar cambios" envía SOLO el subconjunto permitido (sin tipo/modalidad/fecha inicio/roles)', async () => {
    getMyProjectByIdMock.mockResolvedValue(proyectoPublicado());
    renderForm();

    await screen.findByRole('heading', { name: 'Editar información' });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
    const [id, payload] = updateProjectMock.mock.calls[0];
    expect(id).toBe(28);
    expect(payload).toMatchObject({
      tituloProyecto: 'Sistema de Tutorías',
      descripcionProyecto: 'Descripción real del proyecto publicado.',
      fechaFinEstimada: '2026-06-01',
    });
    // Campos bloqueados NUNCA en el payload.
    expect(payload).not.toHaveProperty('tipoProyecto');
    expect(payload).not.toHaveProperty('modalidadProyecto');
    expect(payload).not.toHaveProperty('fechaInicio');
    expect(payload).not.toHaveProperty('roles');
    expect(payload).not.toHaveProperty('organizacionesIds');
  });
});
