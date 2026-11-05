import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/cuenta', async (original) => ({
  ...(await original<typeof import('@/lib/services/cuenta')>()),
  getSesiones: vi.fn(),
  cerrarSesionAbierta: vi.fn(),
  cerrarOtrasSesiones: vi.fn(),
}));

import { aviso } from '@/lib/mensajes';
import { cerrarOtrasSesiones, cerrarSesionAbierta, getSesiones } from '@/lib/services/cuenta';
import { SesionesSection } from '../components/profile/sesiones-section';

const ACTUAL = { idSesion: 'a', navegador: 'Chrome', sistema: 'Windows', ultimoUso: '2026-11-03T15:00:00.000Z', actual: true };
const OTRA = { idSesion: 'b', navegador: 'Firefox', sistema: 'Android', ultimoUso: '2026-11-02T10:00:00.000Z', actual: false };

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(SesionesSection)));
}

beforeEach(() => {
  vi.mocked(getSesiones).mockResolvedValue([ACTUAL, OTRA]);
  vi.mocked(cerrarSesionAbierta).mockResolvedValue({ cerrada: true, actual: false });
  vi.mocked(cerrarOtrasSesiones).mockResolvedValue({ cerradas: 1 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-81: Sesiones abiertas', () => {
  it('lista navegador, sistema y último uso, y marca la sesión actual sin botón propio', async () => {
    montar();
    expect(await screen.findByText('Firefox en Android')).toBeInTheDocument();
    expect(screen.getByText('Chrome en Windows')).toBeInTheDocument();
    expect(screen.getAllByText(/Último uso:/)).toHaveLength(2);
    expect(screen.getByText('Sesión actual')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Cerrar la sesión de/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Cerrar la sesión de Chrome en Windows' })).not.toBeInTheDocument();
  });

  it('cierra una sesión ajena y recarga la lista', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar la sesión de Firefox en Android' }));
    await waitFor(() => expect(cerrarSesionAbierta).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(aviso.exito).toHaveBeenCalledWith('Sesión cerrada'));
    await waitFor(() => expect(getSesiones).toHaveBeenCalledTimes(2));
  });

  it('«Cerrar todas las demás» pide confirmación y no cierra nada si se cancela', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar todas las demás' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(cerrarOtrasSesiones).not.toHaveBeenCalled();
  });

  it('«Cerrar todas las demás» confirmado cierra las otras sesiones', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar todas las demás' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar sesiones' }));
    await waitFor(() => expect(cerrarOtrasSesiones).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(aviso.exito).toHaveBeenCalledWith('Se cerró 1 sesión'));
  });

  it('sin otras sesiones no ofrece cerrar las demás', async () => {
    vi.mocked(getSesiones).mockResolvedValue([ACTUAL]);
    montar();
    expect(await screen.findByText('Sesión actual')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar todas las demás' })).not.toBeInTheDocument();
  });

  it('si la carga falla ofrece reintentar', async () => {
    vi.mocked(getSesiones).mockRejectedValueOnce(new Error('x'));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Firefox en Android')).toBeInTheDocument();
  });
});
