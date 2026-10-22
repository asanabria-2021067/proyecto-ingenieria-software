import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const gsapMock = vi.hoisted(() => {
  const revert = vi.fn();
  return {
    revert,
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert };
    }),
    to: vi.fn(),
    from: vi.fn(),
  };
});
const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { idUsuario: number; nombre: string; apellido: string; correo: string; roles: string[] } | undefined,
    isLoading: false,
  })),
);
const enviarContactoMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('gsap', () => ({ gsap: gsapMock, default: gsapMock }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span data-testid="imagen" data-alt={alt} /> }));
vi.mock('@/public/Logo UVG-01.png', () => ({ default: { src: '/Logo UVG-01.png', width: 1390, height: 1390 } }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => currentUserMock(),
  isAdminUser: (u?: { roles?: string[] } | null) => (u?.roles ?? []).includes('administrador'),
}));
vi.mock('@/lib/services/contacto', () => ({ enviarContacto: (...args: unknown[]) => enviarContactoMock(...args) }));

import ContactoPage from '../app/contacto/page';

const ESTUDIANTE = { idUsuario: 7, nombre: 'Ana', apellido: 'Pérez', correo: 'per23123@uvg.edu.gt', roles: ['estudiante'] };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactoPage />
    </QueryClientProvider>,
  );
}

function llenarYEnviar() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Visitante' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'visitante@gmail.com' } });
  fireEvent.change(screen.getByLabelText('Asunto'), { target: { value: 'Consulta' } });
  fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Necesito ayuda.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
}

function movimientoReducido(activo: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: activo }) as unknown as typeof window.matchMedia;
}

const matchMediaOriginal = window.matchMedia;

beforeEach(() => {
  movimientoReducido(false);
  currentUserMock.mockReturnValue({ data: undefined, isLoading: false });
  enviarContactoMock.mockResolvedValue({ mensaje: 'Tu mensaje fue enviado a administración' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = matchMediaOriginal;
});

describe('ContactoPage — diseño en dos columnas', () => {
  it('encabezado centrado con la pastilla, el título y la descripción', () => {
    const { container } = renderPage();

    const encabezado = container.querySelector('[data-contacto-encabezado]') as HTMLElement;
    expect(within(encabezado).getByText('Contacto')).toHaveClass('pill');
    expect(within(encabezado).getByRole('heading', { level: 1, name: 'Contacto y soporte' })).toBeInTheDocument();
    expect(within(encabezado).getByText(/administración te ayudará/)).toBeInTheDocument();
  });

  it('dos columnas: información con ilustración y la tarjeta del formulario', () => {
    const { container } = renderPage();

    const [informacion, formulario] = Array.from(container.querySelectorAll<HTMLElement>('[data-contacto-columna]'));
    expect(informacion.parentElement).toHaveClass('lg:grid-cols-2');
    expect(within(informacion).getByRole('heading', { level: 2, name: 'Ponte en contacto' })).toBeInTheDocument();
    expect(within(informacion).getByRole('img', { name: /Universidad del Valle de Guatemala/ })).toBeInTheDocument();
    expect(within(formulario).getByRole('heading', { level: 2, name: 'Envía un mensaje' })).toBeInTheDocument();
    expect(formulario.querySelector('[data-slot="separator"]')).toBeInTheDocument();
    expect(within(formulario).getByLabelText('Mensaje')).toBeInTheDocument();
  });

  it('las tres tarjetas informan a quién llega, cuándo se responde y para qué usarlo, sin datos de contacto inventados', () => {
    const { container } = renderPage();

    const tarjetas = Array.from(container.querySelectorAll<HTMLElement>('[data-contacto-tarjeta]'));
    expect(tarjetas.map((t) => within(t).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Llega a administración',
      'Tiempo de respuesta',
      '¿Para qué usarlo?',
    ]);
    expect(tarjetas[0]).toHaveTextContent('notificación');
    expect(within(tarjetas[2]).getByRole('link', { name: 'recuperación de contraseña' })).toHaveAttribute(
      'href',
      '/recuperar-contrasena',
    );
    const texto = tarjetas.map((t) => t.textContent ?? '').join(' ');
    expect(texto).not.toMatch(/@|\+?\d{4}[-\s]?\d{4}/);
  });

  it('anima la entrada del encabezado, las columnas y las tarjetas', () => {
    renderPage();

    const selectores = gsapMock.from.mock.calls.map(([selector]) => selector);
    expect(selectores).toEqual(
      expect.arrayContaining(['[data-contacto-encabezado] > *', '[data-contacto-columna]', '[data-contacto-tarjeta]']),
    );
  });

  it('con movimiento reducido no hay animaciones y todo queda visible', () => {
    movimientoReducido(true);
    renderPage();

    expect(gsapMock.context).not.toHaveBeenCalled();
    expect(gsapMock.from).not.toHaveBeenCalled();
    expect(gsapMock.to).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
  });

  it('al salir de la página revierte las animaciones', () => {
    const { unmount } = renderPage();

    unmount();

    expect(gsapMock.revert).toHaveBeenCalledTimes(2);
  });
});

describe('ContactoPage', () => {
  it('mientras carga la sesión muestra el esqueleto y no el formulario', () => {
    currentUserMock.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();

    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('sin sesión muestra el formulario vacío y vuelve al inicio', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Contacto y soporte' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('con sesión precarga nombre y correo y vuelve al panel', () => {
    currentUserMock.mockReturnValue({ data: ESTUDIANTE, isLoading: false });
    renderPage();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText('Correo')).toHaveValue('per23123@uvg.edu.gt');
    expect(screen.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', '/dashboard');
  });

  it('al enviar llama al backend, muestra el éxito y limpia el formulario', async () => {
    renderPage();

    llenarYEnviar();

    await waitFor(() =>
      expect(enviarContactoMock).toHaveBeenCalledWith({
        nombre: 'Visitante',
        correo: 'visitante@gmail.com',
        asunto: 'Consulta',
        mensaje: 'Necesito ayuda.',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Mensaje enviado');
    expect(toastMock.success).toHaveBeenCalledWith('Mensaje enviado', expect.anything());
    await waitFor(() => expect(screen.getByLabelText('Mensaje')).toHaveValue(''));
  });

  it('si el backend limita los envíos muestra el error y conserva lo escrito', async () => {
    enviarContactoMock.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }));
    renderPage();

    llenarYEnviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enviaste varios mensajes seguidos. Espera un minuto antes de volver a intentarlo.',
    );
    expect(toastMock.error).toHaveBeenCalledWith('No se pudo enviar tu mensaje', expect.anything());
    expect(screen.getByLabelText('Asunto')).toHaveValue('Consulta');
  });
});
