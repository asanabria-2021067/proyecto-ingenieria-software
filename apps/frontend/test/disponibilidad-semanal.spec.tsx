import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const servicio = vi.hoisted(() => ({ getDisponibilidad: vi.fn(), guardarDisponibilidad: vi.fn() }));
vi.mock('@/lib/services/perfil-portafolio', () => servicio);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));

import { DisponibilidadSemanal } from '@/components/profile/disponibilidad-semanal';

function renderGrilla(editable: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DisponibilidadSemanal idUsuario={7} editable={editable} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('DisponibilidadSemanal', () => {
  it('editable: marca bloques de una hora y guarda dia y hora (hora de Guatemala)', async () => {
    servicio.getDisponibilidad.mockResolvedValue({ zonaHoraria: 'America/Guatemala', bloques: [{ dia: 0, hora: 9 }] });
    servicio.guardarDisponibilidad.mockResolvedValue({ zonaHoraria: 'America/Guatemala', bloques: [] });
    renderGrilla(true);
    const lunes9 = await screen.findByRole('checkbox', { name: 'Lunes 09:00' });
    await waitFor(() => expect(lunes9).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText(/Hora de Guatemala/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Miércoles 14:00' }));
    expect(screen.getByRole('checkbox', { name: 'Miércoles 14:00' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(lunes9);
    expect(lunes9).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar disponibilidad' }));
    await waitFor(() => expect(servicio.guardarDisponibilidad).toHaveBeenCalledWith([{ dia: 2, hora: 14 }]));
  });

  it('solo lectura: sin botones ni casillas, indica qué bloques están disponibles', async () => {
    servicio.getDisponibilidad.mockResolvedValue({ zonaHoraria: 'America/Guatemala', bloques: [{ dia: 4, hora: 16 }] });
    renderGrilla(false);
    expect(await screen.findByLabelText('Viernes 16:00: disponible')).toBeInTheDocument();
    expect(screen.getByLabelText('Lunes 09:00: no disponible')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('solo lectura sin bloques: mensaje vacío', async () => {
    servicio.getDisponibilidad.mockResolvedValue({ zonaHoraria: 'America/Guatemala', bloques: [] });
    renderGrilla(false);
    expect(await screen.findByText('Sin disponibilidad registrada.')).toBeInTheDocument();
  });

  it('si la persona no es visible (error) no muestra nada', async () => {
    servicio.getDisponibilidad.mockRejectedValue(new Error('404'));
    const { container } = renderGrilla(false);
    await waitFor(() => expect(servicio.getDisponibilidad).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
  });
});
