import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/services/cuenta', async (original) => ({
  ...(await original<typeof import('@/lib/services/cuenta')>()),
  cambiarContrasena: vi.fn(),
}));

import { aviso } from '@/lib/mensajes';
import { cambiarContrasena } from '@/lib/services/cuenta';
import { CambiarContrasenaSection } from '../components/profile/cambiar-contrasena-section';

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(CambiarContrasenaSection)));
}

function llenar(actual: string, nueva: string, confirmar: string) {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: confirmar } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-83: Cambiar contraseña', () => {
  it('valida largo mínimo, coincidencia y campos vacíos sin llamar al servidor, con el error asociado al campo', async () => {
    montar();
    llenar('', 'corta', '');
    expect(await screen.findByText('Escribe tu contraseña actual.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Confirma la nueva contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nueva contraseña')).toHaveAccessibleDescription('La contraseña debe tener al menos 8 caracteres.');

    llenar('actual-123', 'nueva-12345', 'otra-12345');
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(cambiarContrasena).not.toHaveBeenCalled();
  });

  it('rechaza una nueva igual a la actual y una de más de 72 caracteres', async () => {
    montar();
    llenar('misma-clave-1', 'misma-clave-1', 'misma-clave-1');
    expect(await screen.findByText('La nueva contraseña debe ser distinta de la actual.')).toBeInTheDocument();
    const larga = 'a'.repeat(73);
    llenar('actual-123', larga, larga);
    expect(await screen.findByText('La contraseña no puede tener más de 72 caracteres.')).toBeInTheDocument();
    expect(cambiarContrasena).not.toHaveBeenCalled();
  });

  it('al cambiarla envía las contraseñas, limpia los campos y avisa que se cerraron las demás sesiones', async () => {
    vi.mocked(cambiarContrasena).mockResolvedValue({ mensaje: 'ok' });
    montar();
    llenar('actual-123', 'nueva-12345', 'nueva-12345');
    await waitFor(() => expect(cambiarContrasena).toHaveBeenCalledWith('actual-123', 'nueva-12345'));
    expect(await screen.findByText('Contraseña actualizada. Se cerraron tus otras sesiones.')).toBeInTheDocument();
    expect(aviso.exito).toHaveBeenCalled();
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('');
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('');
  });

  it('si la actual es incorrecta muestra el error del servidor en su campo', async () => {
    vi.mocked(cambiarContrasena).mockRejectedValue(
      Object.assign(new Error('La contraseña actual no es correcta'), {
        statusCode: 400,
        details: 'La contraseña actual no es correcta',
      }),
    );
    montar();
    llenar('equivocada-1', 'nueva-12345', 'nueva-12345');
    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute('aria-invalid', 'true');
  });

  it('con demasiados intentos (429) explica que debe esperar', async () => {
    vi.mocked(cambiarContrasena).mockRejectedValue(Object.assign(new Error('x'), { statusCode: 429 }));
    montar();
    llenar('actual-123', 'nueva-12345', 'nueva-12345');
    expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument();
  });
});
