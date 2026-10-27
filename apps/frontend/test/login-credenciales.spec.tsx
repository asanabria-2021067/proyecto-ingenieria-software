import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * IESUC-568 (B4, NeuroLab): el error de credenciales se muestra junto a los
 * campos, sin revelar si falló el correo o la contraseña (OWASP / T-274):
 * ambos campos quedan marcados, se indica qué hacer y se ofrece
 * «¿Olvidaste tu contraseña?». 429 y 403 siguen en el diálogo de siempre.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
const swalFireMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/swal', () => ({ default: { fire: swalFireMock, close: vi.fn() } }));
const loginMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/auth', () => ({ login: loginMock, register: vi.fn() }));
vi.mock('@/lib/services/users', () => ({ getMe: vi.fn().mockResolvedValue({ roles: ['estudiante'] }) }));
vi.mock('@/hooks/use-current-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-current-user')>()),
  useCurrentUser: () => ({ data: undefined, isSuccess: false }),
}));

import LoginPage, { MENSAJE_CREDENCIALES } from '../app/login/page';

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return render(createElement(LoginPage), { wrapper });
}

function enviar(correo = 'ana@uvg.edu.gt', contrasena = 'Incorrecta-1') {
  fireEvent.change(screen.getByLabelText('Correo Institucional'), { target: { value: correo } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesion' }));
}

function errorHttp(statusCode: number) {
  return Object.assign(new Error('Unauthorized: el usuario no existe'), { statusCode });
}

beforeEach(() => {
  loginMock.mockReset();
  swalFireMock.mockReset();
});

afterEach(cleanup);

describe('IESUC-568 (B4): credenciales inválidas', () => {
  it('muestra el mensaje genérico junto a los campos, no en un diálogo', async () => {
    loginMock.mockRejectedValue(errorHttp(401));
    renderLogin();

    enviar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveAttribute('id', 'login-error');
    expect(alerta).toHaveTextContent(MENSAJE_CREDENCIALES);
    expect(swalFireMock).not.toHaveBeenCalled();
  });

  it('marca los dos campos como inválidos y los asocia al mensaje', async () => {
    loginMock.mockRejectedValue(errorHttp(401));
    renderLogin();

    enviar();
    await screen.findByRole('alert');

    for (const etiqueta of ['Correo Institucional', 'Contraseña']) {
      const campo = screen.getByLabelText(etiqueta);
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(campo.getAttribute('aria-describedby')).toContain('login-error');
      // El estilo de error lo da el contenedor del campo cuando aria-invalid="true".
      expect(campo.parentElement?.className).toContain('[&_input[aria-invalid=true]]:border-error');
    }
  });

  it('no revela cuál de los dos datos falló ni repite el detalle del backend', async () => {
    loginMock.mockRejectedValue(errorHttp(401));
    renderLogin();

    enviar();
    const texto = (await screen.findByRole('alert')).textContent ?? '';

    expect(texto).not.toMatch(/no existe|no registrado|contraseña incorrecta|correo incorrecto|Unauthorized/i);
    expect(texto).toContain('correo');
    expect(texto).toContain('contraseña');
  });

  it('indica qué hacer y ofrece «¿Olvidaste tu contraseña?» junto al error', async () => {
    loginMock.mockRejectedValue(errorHttp(401));
    renderLogin();

    enviar();
    const alerta = await screen.findByRole('alert');

    expect(alerta).toHaveTextContent(/correo institucional completo/);
    const enlace = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' });
    expect(alerta).toContainElement(enlace);
    expect(enlace).toHaveAttribute('href', '/recuperar-contrasena');
  });

  it('un nuevo intento limpia el error mientras se envía', async () => {
    loginMock.mockRejectedValueOnce(errorHttp(401)).mockReturnValueOnce(new Promise(() => undefined));
    renderLogin();

    enviar();
    await screen.findByRole('alert');
    enviar('ana@uvg.edu.gt', 'Correcta-1');

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Correo Institucional')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'false');
  });

  it.each([429, 403])('un %i sigue en el diálogo y no marca los campos', async (statusCode) => {
    loginMock.mockRejectedValue(errorHttp(statusCode));
    renderLogin();

    enviar();

    await waitFor(() => expect(swalFireMock).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error' })));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'false');
  });
});
