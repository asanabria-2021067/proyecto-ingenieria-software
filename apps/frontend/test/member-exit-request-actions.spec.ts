import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PendingLeaderReviewDto } from '../lib/types/exit-requests';

vi.mock('@/lib/services/exit-requests', () => ({
  approveExitRequest: vi.fn(),
  rejectExitRequest: vi.fn(),
}));

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('@/lib/mensajes', () => mensajesMock);

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

import { ExitRequestActions, ExitRequestBadge } from '../components/projects/member-exit-request-actions';
import { approveExitRequest, rejectExitRequest } from '@/lib/services/exit-requests';

function solicitud(overrides: Partial<PendingLeaderReviewDto> = {}): PendingLeaderReviewDto {
  return {
    idSolicitud: 1,
    idProyecto: 42,
    idUsuario: 7,
    motivo: 'Cambio de disponibilidad',
    solicitadaEn: '2026-01-05T00:00:00.000Z',
    estadoSolicitud: 'PENDIENTE_LIDER',
    ...overrides,
  };
}

function renderWithClient(node: ReturnType<typeof createElement>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(node, { wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExitRequestBadge', () => {
  it('sin solicitud no renderiza nada', () => {
    const { container } = render(createElement(ExitRequestBadge, { request: undefined }));
    expect(container).toBeEmptyDOMElement();
  });

  it('con una solicitud PENDIENTE_LIDER muestra "Salida pendiente"', () => {
    render(createElement(ExitRequestBadge, { request: solicitud() }));
    expect(screen.getByText('Salida pendiente')).toBeInTheDocument();
  });
});

describe('ExitRequestActions — Aprobar', () => {
  it('click en Aprobar pide confirmación antes de llamar a B9', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(false);
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));

    await waitFor(() =>
      expect(mensajesMock.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ textoAccion: 'Aprobar salida', destructiva: true }),
      ),
    );
    expect(approveExitRequest).not.toHaveBeenCalled();
  });

  it('confirmar llama approveExitRequest exactamente una vez con idProyecto e idSolicitud correctos', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    (approveExitRequest as any).mockResolvedValue({ idSolicitud: 500, estadoSolicitud: 'APROBADA' });
    renderWithClient(
      createElement(ExitRequestActions, {
        request: solicitud({ idSolicitud: 500 }),
        idProyecto: 42,
        nombreCompleto: 'Ana García',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));

    await waitFor(() => expect(approveExitRequest).toHaveBeenCalledTimes(1));
    expect(approveExitRequest).toHaveBeenCalledWith(42, 500);
  });

  it('éxito avisa el resultado', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    (approveExitRequest as any).mockResolvedValue({ idSolicitud: 1, estadoSolicitud: 'APROBADA' });
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));

    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Salida aprobada'));
  });

  it('un error real avisa el mensaje del backend y no retira falsamente la acción', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    (approveExitRequest as any).mockRejectedValue(new Error('El integrante tiene tareas pendientes'));
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));

    await waitFor(() =>
      expect(mensajesMock.aviso.error).toHaveBeenCalledWith(
        'No se pudo resolver la solicitud de salida',
        'El integrante tiene tareas pendientes',
      ),
    );
    expect(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' })).toBeInTheDocument();
  });
});

describe('ExitRequestActions — Rechazar', () => {
  it('click en Rechazar pide confirmación antes de llamar a B9', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(false);
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));

    await waitFor(() =>
      expect(mensajesMock.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ textoAccion: 'Rechazar salida', destructiva: false }),
      ),
    );
    expect(rejectExitRequest).not.toHaveBeenCalled();
  });

  it('confirmar llama rejectExitRequest con idProyecto e idSolicitud correctos', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    (rejectExitRequest as any).mockResolvedValue({ idSolicitud: 500, estadoSolicitud: 'RECHAZADA' });
    renderWithClient(
      createElement(ExitRequestActions, {
        request: solicitud({ idSolicitud: 500 }),
        idProyecto: 42,
        nombreCompleto: 'Ana García',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));

    await waitFor(() => expect(rejectExitRequest).toHaveBeenCalledTimes(1));
    expect(rejectExitRequest).toHaveBeenCalledWith(42, 500);
  });

  it('cancelar la confirmación no llama al endpoint', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(false);
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));

    await waitFor(() => expect(mensajesMock.confirmar).toHaveBeenCalled());
    expect(rejectExitRequest).not.toHaveBeenCalled();
  });

  it('un error conserva las acciones visibles, sin fingir éxito', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(true);
    (rejectExitRequest as any).mockRejectedValue(new Error('Ya fue resuelta'));
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));

    await waitFor(() =>
      expect(mensajesMock.aviso.error).toHaveBeenCalledWith('No se pudo resolver la solicitud de salida', 'Ya fue resuelta'),
    );
  });
});
