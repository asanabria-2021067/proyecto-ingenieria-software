import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const currentUserMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { idUsuario: number; nombre: string; apellido: string; correo: string; roles: string[] } | undefined,
    isLoading: false,
  })),
);
const enviarContactoMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('@/public/logo.png', () => ({ default: 'logo.png' }));
vi.mock('@/public/login-foto.jpg', () => ({ default: 'login-foto.jpg' }));
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

beforeEach(() => {
  currentUserMock.mockReturnValue({ data: undefined, isLoading: false });
  enviarContactoMock.mockResolvedValue({ mensaje: 'Tu mensaje fue enviado a administración' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
