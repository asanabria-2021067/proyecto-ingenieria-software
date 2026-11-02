import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const createProjectMock = vi.fn().mockResolvedValue({ idProyecto: 1 });
vi.mock('../lib/services/projects', () => ({
  createProject: (...a: unknown[]) => createProjectMock(...a),
  updateProject: vi.fn(),
  getMyProjectById: vi.fn(),
  submitProjectForReview: vi.fn(),
}));

const ORG = {
  idOrganizacion: 3,
  nombreOrganizacion: 'Grupo Robotica',
  descripcionOrganizacion: null,
  sitioWeb: null,
  logoUrl: null,
  visibilidad: 'PRIVADA',
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  archivada: false,
  miRol: 'PROPIETARIO',
  puedePublicar: true,
  totalMiembros: 2,
  totalProyectos: 0,
};
vi.mock('../hooks/use-organizations', () => ({
  useMisOrganizaciones: () => ({ data: [ORG], isLoading: false }),
  useOrganizacion: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('../hooks/use-asociaciones', () => ({ useMisJuntas: () => ({ data: [] }) }));
vi.mock('../hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: { idUsuario: 1 }, isLoading: false }) }));
vi.mock('../hooks/use-can', () => ({ useRequireCan: () => ({ denegado: false }) }));

const searchMock = vi.hoisted(() => ({ actual: '' }));
const routerMock = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(searchMock.actual),
}));

import { guardarBorrador } from '../lib/forms/borrador';
import NewProjectFormPage from '../app/dashboard/projects/mine/form/page';

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(NewProjectFormPage)));
}

const paso = (n: number, total: number, nombre: string) =>
  screen.getByRole('button', { name: `Paso ${n} de ${total}: ${nombre}` });

beforeEach(() => {
  localStorage.clear();
  searchMock.actual = '';
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Crear proyecto en pasos (MEJ-1)', () => {
  it('personal: datos, ¿a nombre de quién?, roles y revisar y enviar', async () => {
    renderForm();
    expect(await screen.findByRole('heading', { name: 'Crear proyecto' })).toBeInTheDocument();
    expect(paso(1, 4, 'Datos generales')).toHaveAttribute('aria-current', 'step');
    expect(paso(2, 4, '¿A nombre de quién?')).toBeInTheDocument();
    expect(paso(3, 4, 'Roles y habilidades')).toBeInTheDocument();
    expect(paso(4, 4, 'Revisar y enviar')).toBeInTheDocument();
  });

  it('no deja pasar del paso de datos mientras tenga errores', async () => {
    renderForm();
    await screen.findByRole('heading', { name: 'Crear proyecto' });
    fireEvent.click(paso(2, 4, '¿A nombre de quién?'));
    expect(paso(1, 4, 'Datos generales')).toHaveAttribute('aria-current', 'step');
    expect(await screen.findByText('El título debe tener al menos 5 caracteres.')).toBeInTheDocument();
  });

  it('el segundo paso ofrece Personal y las organizaciones; elegir una suma el paso de integrantes', async () => {
    // Un borrador con datos válidos permite avanzar sin rellenar los selectores a mano.
    guardarBorrador('1-proyecto-nuevo', {
      form: {
        tituloProyecto: 'Proyecto de prueba',
        descripcionProyecto: 'Una descripcion suficientemente larga',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        modalidadProyecto: 'VIRTUAL',
        objetivosProyecto: '',
        ubicacionProyecto: '',
        contextoAcademico: '',
        urlRecursoExterno: '',
        fechaInicio: '',
        fechaFinEstimada: '',
        roles: [],
      },
      idOrganizacion: null,
      idAsociacion: null,
      participantes: [],
    });
    renderForm();
    await screen.findByText('Recuperamos un borrador que no habías enviado.');
    fireEvent.click(paso(2, 4, '¿A nombre de quién?'));
    expect(screen.getByRole('radio', { name: /Personal/ })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /Grupo Robotica/ }));
    expect(paso(4, 5, 'Participantes de la organización')).toBeInTheDocument();
    expect(paso(5, 5, 'Revisar y enviar')).toBeInTheDocument();
  });
});

describe('Crear proyecto: borrador automático (MEJ-4)', () => {
  it('guarda lo escrito, lo recupera tras recargar y se puede descartar', async () => {
    const primera = renderForm();
    const titulo = await screen.findByLabelText('Título del proyecto', { exact: false });
    fireEvent.change(titulo, { target: { value: 'Proyecto sin terminar' } });
    await waitFor(() => expect(localStorage.getItem('uvg-borrador:1-proyecto-nuevo')).toContain('Proyecto sin terminar'));
    primera.unmount();

    renderForm();
    expect(await screen.findByText('Recuperamos un borrador que no habías enviado.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Título del proyecto', { exact: false })).toHaveValue('Proyecto sin terminar'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(screen.getByLabelText('Título del proyecto', { exact: false })).toHaveValue('');
    expect(localStorage.getItem('uvg-borrador:1-proyecto-nuevo')).toBeNull();
    expect(screen.queryByText('Recuperamos un borrador que no habías enviado.')).not.toBeInTheDocument();
  });

  it('la organización preseleccionada con ?org= no deja borrador si el usuario no escribe nada', async () => {
    searchMock.actual = 'org=3';
    renderForm();
    await screen.findByLabelText('Título del proyecto', { exact: false });
    await new Promise((r) => setTimeout(r, 700));
    expect(localStorage.getItem('uvg-borrador:1-proyecto-nuevo')).toBeNull();
  });
});
