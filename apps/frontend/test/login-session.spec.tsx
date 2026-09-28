import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';

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

const swalFire = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('@/lib/swal', () => ({ default: { fire: swalFire } }));

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
import { useRegister } from '../hooks/use-register';
import LoginPage from '../app/login/page';
import { MENSAJE_ERROR_GENERICO } from '../components/projects/api-error';

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
  loginMock.mockResolvedValue({});
  getMeMock.mockResolvedValue(ESTUDIANTE);
});

afterEach(() => {
  cleanup();
  irA('/');
});

describe('T-221: useLogin', () => {
  it('tras iniciar sesión vuelve a la ruta anterior (`next`)', async () => {
    irA('/login?next=%2Fdashboard%2Fproyectos%2F123%3Ftab%3Dsprints&motivo=sesion-expirada');
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/proyectos/123?tab=sprints'));
  });

  it('un `next` externo se ignora y se usa el destino por rol', async () => {
    irA('/login?next=%2F%2Fevil.com');
    getMeMock.mockResolvedValue(ADMIN);
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/admin'));
  });

  it('sin `next` conserva el destino por rol de siempre', async () => {
    irA('/login');
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('401 de credenciales → muestra el mensaje del backend, no «sesión vencida»', async () => {
    loginMock.mockRejectedValue(Object.assign(new Error('Credenciales invalidas'), { statusCode: 401 }));
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));

    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: 'Credenciales invalidas' })),
    );
  });

  it('500 → mensaje genérico, nunca «Internal server error»', async () => {
    loginMock.mockRejectedValue(Object.assign(new Error('Internal server error'), { statusCode: 500 }));
    const { result } = renderHook(() => useLogin(), { wrapper });

    act(() => result.current.mutate({ correo: 'a@uvg.edu.gt', contrasena: 'x' }));

    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: MENSAJE_ERROR_GENERICO })),
    );
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
  it('la validación del backend se muestra traducida como texto (no HTML)', async () => {
    registerMock.mockRejectedValue(
      Object.assign(new Error('correo must be an email'), {
        statusCode: 400,
        details: ['correo must be an email', 'carne should not be empty'],
      }),
    );
    const { result } = renderHook(() => useRegister(), { wrapper });

    act(() => result.current.mutate({} as never));

    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'El campo «correo» debe ser un correo electrónico válido. El campo «carne» es obligatorio.',
        }),
      ),
    );
    expect(swalFire).not.toHaveBeenCalledWith(expect.objectContaining({ html: expect.anything() }));
  });

  it('409 de dominio (correo ya registrado) → se conserva el mensaje del backend', async () => {
    registerMock.mockRejectedValue(
      Object.assign(new Error('El correo ya está registrado'), { statusCode: 409 }),
    );
    const { result } = renderHook(() => useRegister(), { wrapper });

    act(() => result.current.mutate({} as never));

    await waitFor(() =>
      expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: 'El correo ya está registrado' })),
    );
  });
});
