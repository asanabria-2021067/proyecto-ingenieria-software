import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const servicio = vi.hoisted(() => ({
  getHabilidadesConfirmables: vi.fn(),
  confirmarHabilidad: vi.fn(),
  retirarConfirmacion: vi.fn(),
}));
vi.mock('@/lib/services/perfil-portafolio', () => servicio);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));

import { HabilidadesConfirmables, textoConfirmaciones } from '@/components/profile/habilidades-confirmables';

const FILAS = [
  { idHabilidad: 3, nombre: 'TypeScript', nivel: 'AVANZADO', confirmaciones: 2, confirmadaPorMi: false, puedoConfirmar: true },
  { idHabilidad: 4, nombre: 'SQL', nivel: 'BASICO', confirmaciones: 1, confirmadaPorMi: true, puedoConfirmar: false },
  { idHabilidad: 5, nombre: 'Figma', nivel: 'INTERMEDIO', confirmaciones: 0, confirmadaPorMi: false, puedoConfirmar: false },
];

function renderComponente() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HabilidadesConfirmables idUsuario={7} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('HabilidadesConfirmables', () => {
  it('muestra cuántas confirmaciones tiene cada habilidad', async () => {
    servicio.getHabilidadesConfirmables.mockResolvedValue(FILAS);
    renderComponente();
    expect(await screen.findByText('2 confirmaciones')).toBeInTheDocument();
    expect(screen.getByText('1 confirmación')).toBeInTheDocument();
    expect(screen.getByText('0 confirmaciones')).toBeInTheDocument();
    expect(servicio.getHabilidadesConfirmables).toHaveBeenCalledWith(7);
  });

  it('solo ofrece confirmar lo permitido y retirar lo ya confirmado por mí', async () => {
    servicio.getHabilidadesConfirmables.mockResolvedValue(FILAS);
    renderComponente();
    await screen.findByText('TypeScript');
    expect(screen.getByRole('button', { name: 'Confirmar la habilidad TypeScript' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar la habilidad SQL/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirar mi confirmación de SQL' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Figma/ })).not.toBeInTheDocument();
  });

  it('confirmar y retirar llaman al servicio con la persona y la habilidad', async () => {
    servicio.getHabilidadesConfirmables.mockResolvedValue(FILAS);
    servicio.confirmarHabilidad.mockResolvedValue({ ok: true });
    servicio.retirarConfirmacion.mockResolvedValue({ ok: true });
    renderComponente();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar la habilidad TypeScript' }));
    await waitFor(() => expect(servicio.confirmarHabilidad).toHaveBeenCalledWith(7, 3));
    fireEvent.click(screen.getByRole('button', { name: 'Retirar mi confirmación de SQL' }));
    await waitFor(() => expect(servicio.retirarConfirmacion).toHaveBeenCalledWith(7, 4));
  });

  it('textoConfirmaciones usa singular y plural', () => {
    expect(textoConfirmaciones(1)).toBe('1 confirmación');
    expect(textoConfirmaciones(0)).toBe('0 confirmaciones');
    expect(textoConfirmaciones(4)).toBe('4 confirmaciones');
  });
});
