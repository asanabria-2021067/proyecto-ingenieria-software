import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const usuarioMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => usuarioMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).some((r) => r.toLowerCase() === 'administrador'),
}));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/cuenta', async (original) => ({
  ...(await original<typeof import('@/lib/services/cuenta')>()),
  getDesactivacion: vi.fn(),
  solicitarDesactivacion: vi.fn(),
}));

import { getDesactivacion, solicitarDesactivacion } from '@/lib/services/cuenta';
import { DesactivacionSection } from '../components/profile/desactivacion-section';

const SOLICITUD = {
  idSolicitud: 1,
  estado: 'PENDIENTE' as const,
  motivo: 'Ya no participo',
  creadaEn: '2026-11-01T10:00:00.000Z',
  resueltaEn: null,
  comentarioResolucion: null,
};

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(DesactivacionSection)));
}

beforeEach(() => {
  usuarioMock.mockReturnValue({ data: { idUsuario: 5, roles: ['estudiante'] } });
  vi.mocked(getDesactivacion).mockResolvedValue({ solicitud: null });
  vi.mocked(solicitarDesactivacion).mockResolvedValue(SOLICITUD);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-85: Solicitar desactivar mi cuenta', () => {
  it('pide confirmación que explica que se conservan las horas y el historial, y luego envía el motivo', async () => {
    montar();
    fireEvent.change(await screen.findByLabelText('Motivo (opcional)'), { target: { value: '  Ya no participo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar desactivación' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Se conservan las horas acreditadas y el historial de tus proyectos');
    expect(solicitarDesactivacion).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(solicitarDesactivacion).toHaveBeenCalledWith('Ya no participo'));
  });

  it('cancelar la confirmación no envía nada', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar desactivación' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(solicitarDesactivacion).not.toHaveBeenCalled();
  });

  it('con una solicitud pendiente muestra su estado y bloquea una segunda', async () => {
    vi.mocked(getDesactivacion).mockResolvedValue({ solicitud: SOLICITUD });
    montar();
    expect(await screen.findByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Ya tienes una solicitud pendiente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solicitar desactivación' })).not.toBeInTheDocument();
  });

  it('una solicitud rechazada muestra el comentario y permite pedir de nuevo', async () => {
    vi.mocked(getDesactivacion).mockResolvedValue({
      solicitud: { ...SOLICITUD, estado: 'RECHAZADA', resueltaEn: '2026-11-02T10:00:00.000Z', comentarioResolucion: 'Habla con tu líder' },
    });
    montar();
    expect(await screen.findByText('Rechazada')).toBeInTheDocument();
    expect(screen.getByText(/Habla con tu líder/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar desactivación' })).toBeInTheDocument();
  });

  it('los administradores no ven la sección ni consultan el estado', async () => {
    usuarioMock.mockReturnValue({ data: { idUsuario: 1, roles: ['administrador'] } });
    const { container } = montar();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(getDesactivacion).not.toHaveBeenCalled();
  });
});
