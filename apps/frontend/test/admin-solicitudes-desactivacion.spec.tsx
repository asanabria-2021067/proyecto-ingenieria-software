import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/admin/solicitudes-desactivacion' }));
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn() } }));
vi.mock('@/lib/services/admin', () => ({
  listSolicitudesDesactivacion: vi.fn(),
  resolverSolicitudDesactivacion: vi.fn(),
}));

import uvgSwal from '@/lib/swal';
import { listSolicitudesDesactivacion, resolverSolicitudDesactivacion } from '@/lib/services/admin';
import AdminSolicitudesDesactivacionPage from '../app/dashboard/admin/solicitudes-desactivacion/page';

const SOLICITUD = {
  idSolicitud: 9,
  motivo: 'Ya no participo',
  creadaEn: '2026-11-01T10:00:00.000Z',
  usuario: { idUsuario: 7, nombre: 'Ana', apellido: 'Perez', correo: 'per23123@uvg.edu.gt' },
};

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(AdminSolicitudesDesactivacionPage)));
}

beforeEach(() => {
  vi.mocked(listSolicitudesDesactivacion).mockResolvedValue([SOLICITUD]);
  vi.mocked(resolverSolicitudDesactivacion).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-85: bandeja de desactivación de cuentas (admin)', () => {
  it('lista usuario, motivo y fecha de cada solicitud pendiente', async () => {
    montar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Desactivación de cuentas' })).toBeInTheDocument();
    expect(await screen.findByText('Ana Perez')).toBeInTheDocument();
    expect(screen.getByText('per23123@uvg.edu.gt')).toBeInTheDocument();
    expect(screen.getByText('Ya no participo')).toBeInTheDocument();
  });

  it('aprobar pide confirmación con comentario y llama al servicio', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar la desactivación de Ana Perez' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Sus horas acreditadas y el historial de sus proyectos se conservan');
    fireEvent.change(within(dialogo).getByLabelText('Comentario (opcional)'), { target: { value: ' De acuerdo ' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(resolverSolicitudDesactivacion).toHaveBeenCalledWith(9, 'aprobar', 'De acuerdo'));
    await waitFor(() => expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Cuenta desactivada' })));
  });

  it('rechazar llama al servicio con el comentario', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar la desactivación de Ana Perez' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialogo).getByLabelText('Comentario (opcional)'), { target: { value: 'Habla con tu líder' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(resolverSolicitudDesactivacion).toHaveBeenCalledWith(9, 'rechazar', 'Habla con tu líder'));
  });

  it('si otro administrador ya la resolvió (409) avisa y refresca la lista', async () => {
    vi.mocked(resolverSolicitudDesactivacion).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 409 }));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar la desactivación de Ana Perez' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'Solicitud ya atendida' })));
    await waitFor(() => expect(listSolicitudesDesactivacion).toHaveBeenCalledTimes(2));
  });

  it('sin solicitudes muestra el estado vacío', async () => {
    vi.mocked(listSolicitudesDesactivacion).mockResolvedValue([]);
    montar();
    expect(await screen.findByText('No hay solicitudes pendientes.')).toBeInTheDocument();
  });
});
