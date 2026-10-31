import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * NL-T1: errores del login por campo, alerta de credenciales sin decir cuál
 * falló (T-274), aviso de intentos restantes y botón deshabilitado en curso.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: undefined, isSuccess: false }), isAdminUser: () => false }));

const login = vi.hoisted(() => ({
  state: { isPending: false, isSuccess: false, isError: false, error: null as unknown },
  mutate: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@/hooks/use-login', () => ({ useLogin: () => ({ ...login.state, mutate: login.mutate, reset: login.reset }) }));

import LoginPage, { avisoIntentos } from '../app/login/page';

function error401(intentosRestantes?: number) {
  return Object.assign(new Error('Credenciales inválidas'), { statusCode: 401, body: { intentosRestantes } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  login.state = { isPending: false, isSuccess: false, isError: false, error: null };
});

function enviar(correo: string, contrasena: string) {
  fireEvent.change(screen.getByLabelText('Correo Institucional'), { target: { value: correo } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
}

describe('NL-T1: errores de formato por campo', () => {
  it('correo vacío: mensaje bajo el campo, aria-invalid, aria-describedby y foco en el correo', () => {
    render(createElement(LoginPage));
    enviar('', '');

    const correo = screen.getByLabelText('Correo Institucional');
    expect(document.getElementById('correo-error')).toHaveAttribute('role', 'alert');
    expect(correo).toHaveAttribute('aria-invalid', 'true');
    expect(correo).toHaveAttribute('aria-describedby', 'correo-error');
    expect(document.getElementById('correo-error')).toHaveTextContent('El correo es obligatorio');
    expect(correo).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(login.mutate).not.toHaveBeenCalled();
  });

  it('un correo que no es @uvg.edu.gt se marca en su campo', () => {
    render(createElement(LoginPage));
    enviar('ana@gmail.com', 'Passw0rd!');

    expect(screen.getByText('Usa tu correo institucional, que termina en @uvg.edu.gt')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo Institucional')).toHaveFocus();
    expect(login.mutate).not.toHaveBeenCalled();
  });

  it('solo falta la contraseña: el foco va a la contraseña', () => {
    render(createElement(LoginPage));
    enviar('san24725@uvg.edu.gt', '');

    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    expect(screen.getByLabelText('Correo Institucional')).toHaveAttribute('aria-invalid', 'false');
  });

  it('con datos válidos envía el formulario', () => {
    render(createElement(LoginPage));
    enviar('san24725@uvg.edu.gt', 'Passw0rd!');
    expect(login.mutate).toHaveBeenCalledWith({ correo: 'san24725@uvg.edu.gt', contrasena: 'Passw0rd!' });
  });
});

describe('NL-T1: credenciales incorrectas (T-274)', () => {
  it('muestra la alerta neutra, marca AMBOS campos y ofrece recuperar la contraseña', () => {
    login.state = { ...login.state, isError: true, error: error401(4) };
    render(createElement(LoginPage));

    expect(screen.getByText('Correo o contraseña incorrectos')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo Institucional')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Correo Institucional')).toHaveAttribute('aria-describedby', 'login-error');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-describedby', 'login-error');
    expect(screen.getByLabelText('Correo Institucional')).toHaveFocus();
    const alerta = screen.getByText('Correo o contraseña incorrectos').closest('[role="alert"]') as HTMLElement;
    expect(alerta.querySelector('a[href="/recuperar-contrasena"]')).toHaveTextContent('¿Olvidaste tu contraseña?');
    // Con 4 intentos de margen no se avisa nada.
    expect(screen.queryByText(/antes de un bloqueo temporal/)).not.toBeInTheDocument();
  });

  it('cuenta pendiente (403) conserva su mensaje propio y no marca los campos', () => {
    login.state = { ...login.state, isError: true, error: Object.assign(new Error('x'), { statusCode: 403 }) };
    render(createElement(LoginPage));

    expect(screen.getByText('Tu cuenta está pendiente de verificación por administración.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo Institucional')).toHaveAttribute('aria-invalid', 'false');
  });

  it.each([
    [2, 'Te quedan 2 intentos antes de un bloqueo temporal.'],
    [1, 'Te queda 1 intento antes de un bloqueo temporal.'],
  ])('con %i intentos restantes avisa «%s»', (restantes, texto) => {
    login.state = { ...login.state, isError: true, error: error401(restantes) };
    render(createElement(LoginPage));
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('avisoIntentos: nada si faltan más de 2 o el dato no viene; mensaje de bloqueo en 0', () => {
    expect(avisoIntentos(error401(3))).toBeNull();
    expect(avisoIntentos(error401(undefined))).toBeNull();
    expect(avisoIntentos(null)).toBeNull();
    expect(avisoIntentos(error401(0))).toMatch(/bloqueamos temporalmente/);
    expect(avisoIntentos(Object.assign(new Error('x'), { statusCode: 500, body: { intentosRestantes: 1 } }))).toBeNull();
  });
});

describe('NL-T1: doble envío', () => {
  it('mientras la petición está en curso el botón se deshabilita y muestra el indicador de carga', () => {
    login.state = { ...login.state, isPending: true };
    render(createElement(LoginPage));

    const boton = screen.getByRole('button', { name: /Iniciando sesión/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('tras el éxito sigue deshabilitado hasta que el panel se abre', () => {
    login.state = { ...login.state, isSuccess: true };
    render(createElement(LoginPage));
    expect(screen.getByRole('button', { name: /Iniciando sesión/ })).toBeDisabled();
  });
});
