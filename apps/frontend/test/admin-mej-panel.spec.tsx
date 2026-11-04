import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: undefined, isSuccess: false }), isAdminUser: () => false }));
vi.mock('@/hooks/use-login', () => ({
  useLogin: () => ({ isPending: false, isSuccess: false, isError: false, error: null, mutate: vi.fn(), reset: vi.fn() }),
}));
vi.mock('@/lib/services/admin', () => ({ getAdminPendientes: vi.fn(), getAdminMetricasEntidades: vi.fn() }));
vi.mock('@/lib/services/horas-semestre', () => ({ getHorasComparativo: vi.fn(), getResumenAsociaciones: vi.fn() }));

import LoginPage from '../app/login/page';
import AdminBandejaPage from '../app/dashboard/admin/bandeja/page';
import AdminEntidadesPage from '../app/dashboard/admin/entidades/page';
import { HorasComparativo } from '../components/admin/horas/horas-comparativo';
import { RESPUESTAS_RAPIDAS, agregarRespuesta } from '../lib/admin/respuestas-rapidas';
import { getAdminMetricasEntidades, getAdminPendientes } from '../lib/services/admin';
import { getHorasComparativo, getResumenAsociaciones } from '../lib/services/horas-semestre';

function conCliente(hijo: ReturnType<typeof createElement>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, hijo));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-37: login sin Microsoft', () => {
  it('no ofrece «Continúa con Microsoft» ni el separador de proveedores', () => {
    render(createElement(LoginPage));
    expect(screen.queryByText(/microsoft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continúa con/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeInTheDocument();
  });
});

describe('MEJ-71: respuestas rápidas', () => {
  it('agrega la frase sin borrar lo escrito y no la repite', () => {
    const texto = RESPUESTAS_RAPIDAS[0].texto;
    expect(agregarRespuesta('', texto)).toBe(texto);
    expect(agregarRespuesta('Hola', texto)).toBe(`Hola\n${texto}`);
    const una = agregarRespuesta('Hola', texto);
    expect(agregarRespuesta(una, texto)).toBe(una);
  });
});

describe('MEJ-69: bandeja única', () => {
  it('lista cada pendiente con su contador y enlace', async () => {
    vi.mocked(getAdminPendientes).mockResolvedValue({
      total: 9,
      items: [
        { clave: 'cuentas', total: 3 },
        { clave: 'revisiones', total: 2 },
        { clave: 'cierres', total: 0 },
        { clave: 'recuperaciones', total: 1 },
        { clave: 'apelaciones', total: 1 },
        { clave: 'desactivaciones', total: 2 },
      ],
    });
    conCliente(createElement(AdminBandejaPage));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bandeja única' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Cuentas pendientes' })).toHaveAttribute(
      'href',
      '/dashboard/admin/cuentas-pendientes',
    );
    expect(screen.getByRole('link', { name: 'Solicitudes de cierre' })).toHaveAttribute(
      'href',
      '/dashboard/admin/proyectos?grupo=cierres',
    );
    expect(document.querySelector('[data-fila="cuentas"]')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Desactivación de cuentas' })).toHaveAttribute(
      'href',
      '/dashboard/admin/solicitudes-desactivacion',
    );
    expect(screen.getByRole('status')).toHaveTextContent('9');
  });

  it('con todo en cero muestra «Todo al día» con una acción', async () => {
    vi.mocked(getAdminPendientes).mockResolvedValue({ total: 0, items: [] });
    conCliente(createElement(AdminBandejaPage));
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al Panel Admin' })).toBeInTheDocument();
  });

  it('si falla la carga ofrece reintentar', async () => {
    vi.mocked(getAdminPendientes).mockRejectedValueOnce(new Error('x')).mockResolvedValue({ total: 0, items: [] });
    conCliente(createElement(AdminBandejaPage));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
  });
});

const SEM = { anio: 2026, periodo: 1 as const, inicio: '2026-01-01', fin: '2026-06-30' };

describe('MEJ-72: comparativo de semestres', () => {
  it('muestra una fila por semestre con declaradas y acreditadas en columnas distintas', async () => {
    vi.mocked(getHorasComparativo).mockResolvedValue({
      semestres: [
        {
          semestre: SEM,
          estudiantesConRegistro: 4,
          metaBeca: 400,
          becaDeclarada: 40,
          becaAcreditada: 60,
          metaExtension: 0,
          extensionDeclarada: 0,
          extensionAcreditada: 0,
        },
      ],
    });
    conCliente(createElement(HorasComparativo));
    expect(await screen.findByText('1.er semestre 2026')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Beca: declaradas' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Beca: acreditadas' })).toBeInTheDocument();
    expect(screen.getByText('60 h')).toBeInTheDocument();
  });

  it('sin horas muestra un estado vacío', async () => {
    vi.mocked(getHorasComparativo).mockResolvedValue({
      semestres: [
        {
          semestre: SEM,
          estudiantesConRegistro: 0,
          metaBeca: 0,
          becaDeclarada: 0,
          becaAcreditada: 0,
          metaExtension: 0,
          extensionDeclarada: 0,
          extensionAcreditada: 0,
        },
      ],
    });
    conCliente(createElement(HorasComparativo));
    expect(await screen.findByText('Aún no hay horas en estos semestres')).toBeInTheDocument();
  });
});

describe('MEJ-36 y MEJ-68: asociaciones y organizaciones', () => {
  const resumen = (nombre: string) => ({
    idAsociacion: 1,
    nombre,
    carreras: ['Computación'],
    integrantesJunta: 3,
    proyectosActivos: 2,
    estudiantes: 10,
    enRiesgo: 2,
    metaBeca: 1000,
    becaDeclarada: 100,
    becaAcreditada: 200,
    faltaBeca: 700,
    metaExtension: 0,
    extensionDeclarada: 0,
    extensionAcreditada: 0,
    faltaExtension: 0,
  });

  it('muestra el resumen por asociación y las métricas de asociaciones y organizaciones', async () => {
    vi.mocked(getResumenAsociaciones).mockResolvedValue({ semestre: SEM, asociaciones: [resumen('Asoc Uno')] });
    vi.mocked(getAdminMetricasEntidades).mockResolvedValue({
      asociaciones: [
        {
          idAsociacion: 1,
          nombre: 'Asoc Uno',
          archivada: false,
          integrantesJunta: 3,
          carreras: 1,
          proyectosTotales: 4,
          proyectosActivos: 2,
          proyectosCerrados: 1,
        },
      ],
      organizaciones: [
        {
          idOrganizacion: 2,
          nombre: 'Robótica',
          archivada: true,
          visibilidad: 'PUBLICA',
          miembros: 6,
          proyectosTotales: 1,
          proyectosActivos: 0,
          proyectosCerrados: 1,
        },
      ],
    });
    conCliente(createElement(AdminEntidadesPage));

    expect(await screen.findByRole('heading', { level: 2, name: 'Resumen por asociación' })).toBeInTheDocument();
    expect(await screen.findByText('Robótica')).toBeInTheDocument();
    expect(screen.getByText('Pública')).toBeInTheDocument();
    expect(screen.getByText('Archivada')).toBeInTheDocument();
    // En movil las tablas se desplazan de lado: cada una avisa (visible solo bajo md).
    const pistas = screen.getAllByTestId('pista-desplazar');
    expect(pistas).toHaveLength(3);
    for (const pista of pistas) expect(pista).toHaveClass('md:hidden');
  });

  it('sin asociaciones ni organizaciones ofrece una acción', async () => {
    vi.mocked(getResumenAsociaciones).mockResolvedValue({ semestre: SEM, asociaciones: [] });
    vi.mocked(getAdminMetricasEntidades).mockResolvedValue({ asociaciones: [], organizaciones: [] });
    conCliente(createElement(AdminEntidadesPage));
    expect(await screen.findByText('Aún no hay asociaciones activas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Asociaciones y juntas' })).toHaveAttribute(
      'href',
      '/dashboard/admin/asociaciones',
    );
    expect(await screen.findByText('Todavía no hay organizaciones')).toBeInTheDocument();
  });
});
