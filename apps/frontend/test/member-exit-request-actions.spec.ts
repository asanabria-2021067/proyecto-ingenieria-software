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
vi.mock('@/lib/swal', () => ({ default: { fire: vi.fn() } }));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

import { ExitRequestActions, ExitRequestBadge } from '../components/projects/member-exit-request-actions';
import { approveExitRequest, rejectExitRequest } from '@/lib/services/exit-requests';
import uvgSwal from '@/lib/swal';

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
  it('click en Aprobar abre confirmación antes de llamar a B9', () => {
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));

    expect(screen.getByRole('heading', { name: 'Aprobar salida' })).toBeInTheDocument();
    expect(approveExitRequest).not.toHaveBeenCalled();
  });

  it('confirmar llama approveExitRequest exactamente una vez con idProyecto e idSolicitud correctos', async () => {
    (approveExitRequest as any).mockResolvedValue({ idSolicitud: 1, estadoSolicitud: 'APROBADA' });
    renderWithClient(
      createElement(ExitRequestActions, {
        request: solicitud({ idSolicitud: 500 }),
        idProyecto: 42,
        nombreCompleto: 'Ana García',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar salida' }));

    await waitFor(() => expect(approveExitRequest).toHaveBeenCalledTimes(1));
    expect(approveExitRequest).toHaveBeenCalledWith(42, 500);
  });

  it('éxito muestra feedback y cierra la confirmación', async () => {
    (approveExitRequest as any).mockResolvedValue({ idSolicitud: 1, estadoSolicitud: 'APROBADA' });
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar salida' }));

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'Salida aprobada' })),
    );
    await waitFor(() => expect(screen.queryByText('¿Confirmas que apruebas la salida de Ana García del proyecto? Esta acción no se puede deshacer.')).not.toBeInTheDocument());
  });

  it('mientras se resuelve, evita doble submit y bloquea también Rechazar de la misma solicitud', async () => {
    let resolverPromesa!: (value: unknown) => void;
    (approveExitRequest as any).mockImplementation(
      () => new Promise((resolve) => { resolverPromesa = resolve; }),
    );
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));
    const confirmar = await screen.findByRole('button', { name: 'Sí, aprobar salida' });
    fireEvent.click(confirmar);

    await waitFor(() => expect(confirmar).toBeDisabled());
    fireEvent.click(confirmar);
    expect(approveExitRequest).toHaveBeenCalledTimes(1);

    resolverPromesa({ idSolicitud: 1, estadoSolicitud: 'APROBADA' });
  });

  it('un error real muestra el mensaje del backend y no retira falsamente la acción', async () => {
    (approveExitRequest as any).mockRejectedValue(new Error('El integrante tiene tareas pendientes'));
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar salida' }));

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'error', text: 'El integrante tiene tareas pendientes' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Aprobar solicitud de salida de Ana García' })).toBeInTheDocument();
  });
});

describe('ExitRequestActions — Rechazar', () => {
  it('click en Rechazar abre confirmación antes de llamar a B9', () => {
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));

    expect(screen.getByRole('heading', { name: 'Rechazar salida' })).toBeInTheDocument();
    expect(rejectExitRequest).not.toHaveBeenCalled();
  });

  it('confirmar llama rejectExitRequest con idProyecto e idSolicitud correctos', async () => {
    (rejectExitRequest as any).mockResolvedValue({ idSolicitud: 500, estadoSolicitud: 'RECHAZADA' });
    renderWithClient(
      createElement(ExitRequestActions, {
        request: solicitud({ idSolicitud: 500 }),
        idProyecto: 42,
        nombreCompleto: 'Ana García',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, rechazar salida' }));

    await waitFor(() => expect(rejectExitRequest).toHaveBeenCalledTimes(1));
    expect(rejectExitRequest).toHaveBeenCalledWith(42, 500);
  });

  it('cancelar la confirmación no llama al endpoint', async () => {
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(rejectExitRequest).not.toHaveBeenCalled();
  });

  it('un error conserva las acciones visibles, sin fingir éxito', async () => {
    (rejectExitRequest as any).mockRejectedValue(new Error('Ya fue resuelta'));
    renderWithClient(
      createElement(ExitRequestActions, { request: solicitud(), idProyecto: 42, nombreCompleto: 'Ana García' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de salida de Ana García' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, rechazar salida' }));

    await waitFor(() =>
      expect(uvgSwal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: 'Ya fue resuelta' })),
    );
  });
});
