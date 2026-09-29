import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook } from '@testing-library/react';

/**
 * T-221 — lado del login: aviso de sesión vencida, regreso a la ruta
 * anterior (`next`) y mensajes de error de autenticación traducidos.
 */

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));
vi.mock('next/image', () => ({ default: () => null }));

const avisoMock = vi.hoisted(() => ({ exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() }));
vi.mock('@/lib/mensajes', () => ({ aviso: avisoMock }));

const loginMock = vi.hoisted(() => vi.fn());
const registerMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/auth', () => ({ login: loginMock, register: registerMock }));

const getMeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/users', () => ({ getMe: getMeMock }));

const currentUserMock = vi.hoisted(() => vi.fn(() => ({ data: undefined, isSuccess: false })));
vi.mock('@/hooks/use-current-user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/use-current-user')>();
  return { ...actual, useCurrentUser: () => currentUserMock() };
});

import { useLogin } from '../hooks/use-login';
import LoginPage, { mensajeError as mensajeErrorLogin } from '../app/login/page';
import { mensajeError as mensajeErrorRegistro } from '../app/registro/page';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function irA(url: string) {
  window.history.replaceState({}, '', url);
}

const ESTUDIANTE = { roles: ['estudiante'] };
const ADMIN = { roles: ['Administrador'] };

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
  loginMock.mockResolvedValue({});
  getMeMock.mockResolvedValue(ESTUDIANTE);
});

afterEach(() => {
  cleanup();
  irA('/');
});

describe('T-221: useLogin', () => {
  // La navegación real se retrasa 1200ms (setTimeout en use-login.ts) para
  // que el usuario vea el mensaje de éxito antes de salir del login. Con
  // temporizadores reales y `waitFor`, ese retraso queda a merced del reloj
  // de la maquina de CI: el push de una prueba puede terminar de disparar
  // durante la SIGUIENTE prueba (temporizador real, no ligado al ciclo de
  // vida de React) y contaminar su aserción. Con fake timers avanzamos el
  // reloj a mano, sin esa carrera.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tras iniciar sesión vuelve a la ruta anterior (`next`)', async () => {
    irA('/login?next=%2Fdashboard%2Fproyectos%2F123%3Ftab%3Dsprints&motivo=sesion-expirada');
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));
    await act(() => vi.advanceTimersByTimeAsync(1200));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/proyectos/123?tab=sprints');
  });

  it('un `next` externo se ignora y se usa el destino por rol', async () => {
    irA('/login?next=%2F%2Fevil.com');
    getMeMock.mockResolvedValue(ADMIN);
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));
    await act(() => vi.advanceTimersByTimeAsync(1200));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/admin');
  });

  it('sin `next` conserva el destino por rol de siempre', async () => {
    irA('/login');
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));
    await act(() => vi.advanceTimersByTimeAsync(1200));

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  // T-274 (OWASP): un solo mensaje neutro para cualquier fallo de login, sin
  // importar el status ni el texto del backend — decir "no existe esa
  // cuenta" o "credenciales invalidas" por separado permite enumerar
  // correos registrados. Solo 429 (limite de intentos) tiene mensaje propio.
  it.each([401, 500])('%i → mensaje neutro, nunca el detalle del backend', (statusCode) => {
    const error = Object.assign(new Error('Internal server error: constraint failed'), { statusCode });
    expect(mensajeErrorLogin(error)).toBe('No se pudo iniciar sesion. Verifica tu correo y contraseña.');
  });

  it('429 → aviso de limite de intentos, no el mensaje de credenciales', () => {
    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    expect(mensajeErrorLogin(error)).toMatch(/demasiados intentos/i);
  });
});

describe('T-221: página de login', () => {
  it('con motivo=sesion-expirada avisa al usuario que su sesión venció', () => {
    irA('/login?next=%2Fdashboard%2Fproyectos%2F123&motivo=sesion-expirada');

    render(<LoginPage />, { wrapper });

    expect(avisoMock.advertencia).toHaveBeenCalledWith('Tu sesión expiró', expect.stringMatching(/Inicia sesión/));
  });

  it('sin motivo no muestra el aviso de sesión vencida', () => {
    irA('/login');

    render(<LoginPage />, { wrapper });

    expect(avisoMock.advertencia).not.toHaveBeenCalled();
  });

  it('si la sesión sigue viva (refresh válido), redirige directo a `next`', () => {
    irA('/login?next=%2Fdashboard%2Fproyectos%2F123');
    currentUserMock.mockReturnValue({ data: ESTUDIANTE, isSuccess: true } as never);

    render(<LoginPage />, { wrapper });

    expect(replaceMock).toHaveBeenCalledWith('/dashboard/proyectos/123');
  });
});

describe('T-221: useRegister', () => {
  // T-274 (OWASP): antes se mostraba error.message crudo (p. ej. "El correo
  // ya esta registrado"), lo que permitia enumerar cuentas existentes. Ahora
  // cualquier fallo de registro (validacion del backend, correo duplicado,
  // 5xx) muestra el mismo mensaje neutro.
  it.each([400, 409, 500])('%i → mensaje neutro, nunca el detalle ni el correo duplicado', (statusCode) => {
    const error = Object.assign(new Error('El correo ya está registrado'), { statusCode });
    expect(mensajeErrorRegistro(error)).toBe('No se pudo completar el registro. Intenta de nuevo.');
  });

  it('429 → aviso de limite de intentos', () => {
    const error = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    expect(mensajeErrorRegistro(error)).toMatch(/demasiados intentos/i);
  });
});
