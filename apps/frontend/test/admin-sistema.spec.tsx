import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const pathnameMock = vi.hoisted(() => vi.fn(() => '/'));
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../lib/download-file', () => ({ downloadBlob: vi.fn() }));
vi.mock('../lib/services/admin-sistema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/services/admin-sistema')>();
  return {
    ...actual,
    getMantenimiento: vi.fn(),
    getAdminMantenimiento: vi.fn(),
    putAdminMantenimiento: vi.fn(),
    getEstadoSistema: vi.fn(),
    getTablas: vi.fn(),
    getTablaPagina: vi.fn(),
    getTablaRegistro: vi.fn(),
    getTablaCsv: vi.fn(),
  };
});

import { EVENTO_MANTENIMIENTO } from '../lib/api/client';
import { MantenimientoGate } from '../components/mantenimiento/mantenimiento-gate';
import AdminMantenimientoPage from '../app/dashboard/admin/mantenimiento/page';
import AdminTablasPage from '../app/dashboard/admin/tablas/page';
import { EstadoSistemaCard } from '../components/admin/dashboard/estado-sistema';
import { downloadBlob } from '../lib/download-file';
import * as api from '../lib/services/admin-sistema';

function renderConCliente(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PUBLICO = {
  bloqueando: true,
  mensaje: 'Volvemos pronto',
  regresoEstimado: '2026-11-04T18:00:00.000Z',
  inicioProgramado: null,
};
const ADMIN = {
  ...PUBLICO,
  activo: false,
  bloqueando: false,
  mensaje: 'La plataforma está en mantenimiento. Disculpa las molestias.',
  regresoEstimado: null,
};

beforeEach(() => {
  pathnameMock.mockReturnValue('/');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Pantalla de mantenimiento', () => {
  it('se muestra en una ruta pública cuando el estado público indica bloqueo, con mensaje y hora de regreso', async () => {
    vi.mocked(api.getMantenimiento).mockResolvedValue(PUBLICO);
    renderConCliente(
      <MantenimientoGate>
        <p>app</p>
      </MantenimientoGate>,
    );

    expect(await screen.findByText('Volvemos pronto')).toBeInTheDocument();
    expect(screen.getByText(/Regreso estimado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('no tapa el login aunque haya bloqueo', async () => {
    pathnameMock.mockReturnValue('/login');
    vi.mocked(api.getMantenimiento).mockResolvedValue(PUBLICO);
    renderConCliente(
      <MantenimientoGate>
        <p>formulario de login</p>
      </MantenimientoGate>,
    );

    await waitFor(() => expect(api.getMantenimiento).toHaveBeenCalled());
    expect(screen.getByText('formulario de login')).toBeInTheDocument();
    expect(screen.queryByText('Volvemos pronto')).not.toBeInTheDocument();
  });

  it('dentro del dashboard solo aparece con el 503 MANTENIMIENTO y «Reintentar» lo quita al terminar', async () => {
    pathnameMock.mockReturnValue('/dashboard');
    vi.mocked(api.getMantenimiento).mockResolvedValue(PUBLICO);
    renderConCliente(
      <MantenimientoGate>
        <p>app</p>
      </MantenimientoGate>,
    );
    await waitFor(() => expect(api.getMantenimiento).toHaveBeenCalled());
    expect(screen.getByText('app')).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent(EVENTO_MANTENIMIENTO));
    expect(await screen.findByText('Volvemos pronto')).toBeInTheDocument();

    vi.mocked(api.getMantenimiento).mockResolvedValue({ ...PUBLICO, bloqueando: false });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('app')).toBeInTheDocument();
  });
});

describe('Formulario de mantenimiento del administrador', () => {
  it('pide confirmación antes de activar y reenvía todos los campos', async () => {
    vi.mocked(api.getAdminMantenimiento).mockResolvedValue(ADMIN);
    vi.mocked(api.putAdminMantenimiento).mockResolvedValue({ ...ADMIN, activo: true, bloqueando: true });
    renderConCliente(<AdminMantenimientoPage />);

    fireEvent.click(await screen.findByRole('switch', { name: 'Activar mantenimiento ahora' }));
    fireEvent.change(screen.getByLabelText('Mensaje para los usuarios'), { target: { value: 'Migración de datos' } });
    fireEvent.change(screen.getByLabelText(/Regreso estimado/), { target: { value: '2030-01-02T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(api.putAdminMantenimiento).not.toHaveBeenCalled();
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Activar mantenimiento' }));

    await waitFor(() => expect(api.putAdminMantenimiento).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putAdminMantenimiento).mock.calls[0][0]).toEqual({
      activo: true,
      mensaje: 'Migración de datos',
      regresoEstimado: new Date('2030-01-02T10:00').toISOString(),
      inicioProgramado: null,
    });
  });

  it('un inicio vencido que bloquea aparece encendido y al apagarlo no se reenvía', async () => {
    vi.mocked(api.getAdminMantenimiento).mockResolvedValue({
      ...ADMIN,
      bloqueando: true,
      inicioProgramado: '2020-01-01T00:00:00.000Z',
    });
    vi.mocked(api.putAdminMantenimiento).mockResolvedValue(ADMIN);
    renderConCliente(<AdminMantenimientoPage />);

    const interruptor = await screen.findByRole('switch', { name: 'Activar mantenimiento ahora' });
    expect(interruptor).toBeChecked();
    expect(screen.getByLabelText(/Inicio programado/)).toHaveValue('');
    fireEvent.click(interruptor);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.putAdminMantenimiento).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putAdminMantenimiento).mock.calls[0][0]).toMatchObject({ activo: false, inicioProgramado: null });
  });

  it('rechaza un regreso anterior al inicio programado', async () => {
    vi.mocked(api.getAdminMantenimiento).mockResolvedValue(ADMIN);
    renderConCliente(<AdminMantenimientoPage />);
    await screen.findByRole('switch');
    fireEvent.change(screen.getByLabelText(/Inicio programado/), { target: { value: '2030-01-02T10:00' } });
    fireEvent.change(screen.getByLabelText(/Regreso estimado/), { target: { value: '2030-01-02T09:00' } });

    expect(screen.getByRole('alert')).toHaveTextContent('posterior al inicio programado');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });
});

const TABLAS: api.TablaMeta[] = [
  {
    clave: 'usuarios',
    etiqueta: 'Usuarios',
    columnas: ['idUsuario', 'correo', 'estado'],
    filtros: [{ columna: 'estado', tipo: 'enum', valores: ['ACTIVO', 'BLOQUEADO'] }],
    busqueda: true,
  },
  { clave: 'sprints', etiqueta: 'Sprints', columnas: ['idSprint'], filtros: [], busqueda: false },
];

describe('Vista de tablas del administrador', () => {
  beforeEach(() => {
    vi.mocked(api.getTablas).mockResolvedValue(TABLAS);
    vi.mocked(api.getTablaPagina).mockResolvedValue({
      filas: [{ idUsuario: 7, correo: 'a***@uvg.edu.gt', estado: 'ACTIVO' }],
      total: 1,
      pagina: 1,
      limite: 20,
    });
  });

  it('lista la entidad, no ofrece editar ni borrar y deja ordenar, exportar y ver el detalle completo', async () => {
    vi.mocked(api.getTablaRegistro).mockResolvedValue({ idUsuario: 7, correo: 'ana@uvg.edu.gt', estado: 'ACTIVO' });
    vi.mocked(api.getTablaCsv).mockResolvedValue(new Blob(['x']));
    renderConCliente(<AdminTablasPage />);

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('a***@uvg.edu.gt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|eliminar|borrar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Para editar o eliminar/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Estado/ }));
    await waitFor(() =>
      expect(api.getTablaPagina).toHaveBeenLastCalledWith('usuarios', expect.objectContaining({ orden: 'estado', dir: 'asc' })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'usuarios.csv'));

    fireEvent.click(screen.getByRole('button', { name: /Ver detalle del registro 7/ }));
    expect(await screen.findByText('ana@uvg.edu.gt')).toBeInTheDocument();
    expect(api.getTablaRegistro).toHaveBeenCalledWith('usuarios', '7');
  });

  it('aplica búsqueda y filtros en la consulta', async () => {
    renderConCliente(<AdminTablasPage />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(api.getTablaPagina).toHaveBeenLastCalledWith('usuarios', expect.objectContaining({ q: 'ana', pagina: 1 })),
    );
  });
});

describe('Tarjeta de estado del sistema', () => {
  it('muestra cada servicio con su estado, la versión y las migraciones', async () => {
    vi.mocked(api.getEstadoSistema).mockResolvedValue({
      baseDatos: 'operativo',
      redis: 'caido',
      cloudinary: 'no_configurado',
      socket: 'operativo',
      conexionesSocket: 3,
      version: { commit: 'abcdef1234567', fecha: '2026-11-03T12:00:00.000Z' },
      migraciones: [{ nombre: '20261101_algo', fecha: '2026-11-01T10:00:00.000Z' }],
    });
    renderConCliente(<EstadoSistemaCard />);

    const redis = (await screen.findByText('Redis')).closest('li') as HTMLElement;
    expect(within(redis).getByText('Caído')).toHaveClass('pill-red');
    expect(within(screen.getByText('Base de datos').closest('li') as HTMLElement).getByText('Operativo')).toHaveClass('pill-green');
    expect(within(screen.getByText('Cloudinary').closest('li') as HTMLElement).getByText('No configurado')).toBeInTheDocument();
    expect(screen.getByText('abcdef1')).toBeInTheDocument();
    expect(screen.getByText(/20261101_algo/)).toBeInTheDocument();
  });
});
