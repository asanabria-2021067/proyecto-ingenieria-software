import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * NL-T2: errores del registro por campo, lista de requisitos de la contraseña
 * con palomitas, mapeo del 400 del backend, ayuda para quien ya tiene cuenta
 * (mensaje neutro de T-274) y botón deshabilitado durante el envío.
 */

if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/services/catalogs', () => ({
  getCarreras: () => Promise.resolve([{ idCarrera: 2, nombreCarrera: 'Ingeniería Mecatrónica' }]),
}));

const registro = vi.hoisted(() => ({
  state: { isPending: false, isSuccess: false, isError: false, error: null as unknown },
  mutate: vi.fn(),
}));
vi.mock('@/hooks/use-register', () => ({ useRegister: () => ({ ...registro.state, mutate: registro.mutate }) }));

import RegistroPage from '../app/registro/page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  registro.state = { isPending: false, isSuccess: false, isError: false, error: null };
});

function errorHttp(statusCode: number, details?: unknown) {
  return Object.assign(new Error('x'), { statusCode, details });
}

async function llenarFormularioValido() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Carnet'), { target: { value: '24725' } });
  await waitFor(() => expect(screen.getByLabelText('Correo institucional')).toHaveValue('san24725@uvg.edu.gt'));
  const carrera = screen.getByTestId('registro-carrera-select');
  await waitFor(() => expect(carrera).toBeEnabled());
  carrera.focus();
  fireEvent.keyDown(carrera, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Ingeniería Mecatrónica' }));
  // Radix devuelve el foco al disparador al cerrar la lista: se espera antes de seguir.
  await waitFor(() => expect(carrera).toHaveFocus());
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd!' } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Passw0rd!' } });
}

describe('NL-T2: lista de requisitos de la contraseña', () => {
  it('las palomitas se marcan mientras se escribe', () => {
    render(createElement(RegistroPage));
    const lista = screen.getByRole('list', { name: 'Requisitos de la contraseña' });
    expect(within(lista).getByText('Al menos 8 caracteres').closest('li')).toHaveTextContent('(pendiente)');

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'corta' } });
    expect(within(lista).getByText('Al menos 8 caracteres').closest('li')).toHaveTextContent('(pendiente)');
    expect(within(lista).getByText('No más de 72 caracteres').closest('li')).toHaveTextContent('(cumplido)');

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd!' } });
    expect(within(lista).getByText('Al menos 8 caracteres').closest('li')).toHaveTextContent('(cumplido)');

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'a'.repeat(73) } });
    expect(within(lista).getByText('No más de 72 caracteres').closest('li')).toHaveTextContent('(pendiente)');
  });

  it('una contraseña de más de 72 caracteres se rechaza en el campo antes de enviar', () => {
    render(createElement(RegistroPage));
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'a'.repeat(73) } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    expect(screen.getByText('La contraseña no puede tener más de 72 caracteres')).toBeInTheDocument();
    expect(registro.mutate).not.toHaveBeenCalled();
  });
});

describe('NL-T2: errores por campo', () => {
  it('al enviar vacío el foco va al primer campo con error', () => {
    render(createElement(RegistroPage));
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-describedby', 'nombre-error');
  });

  it('un 400 del backend se muestra en el campo correspondiente, con foco, y sin alerta genérica', async () => {
    registro.mutate.mockImplementation((_payload, opciones) =>
      opciones.onError(errorHttp(400, ['contrasena must be longer than or equal to 8 characters'])),
    );
    render(createElement(RegistroPage));
    await llenarFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));

    await waitFor(() => expect(registro.mutate).toHaveBeenCalled());
    expect(await screen.findByText('La contraseña debe tener entre 8 y 72 caracteres')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
  });
});

describe('NL-T2: mensaje neutro (T-274) con ayuda para quien ya tiene cuenta', () => {
  it.each([409, 400, 500])('con %i genérico: mensaje neutro y los dos enlaces', (statusCode) => {
    registro.state = { ...registro.state, isError: true, error: errorHttp(statusCode, 'Solicitud inválida') };
    render(createElement(RegistroPage));

    const alerta = screen.getByText('No se pudo completar el registro. Intenta de nuevo.').closest('[role="alert"]') as HTMLElement;
    expect(alerta).toHaveTextContent('Si ya tienes cuenta, inicia sesión o recupera tu contraseña.');
    expect(within(alerta).getByRole('link', { name: 'inicia sesión' })).toHaveAttribute('href', '/login');
    expect(within(alerta).getByRole('link', { name: 'recupera tu contraseña' })).toHaveAttribute('href', '/recuperar-contrasena');
  });

  it('con 429 (límite de intentos) no se ofrecen los enlaces', () => {
    registro.state = { ...registro.state, isError: true, error: errorHttp(429) };
    render(createElement(RegistroPage));
    expect(screen.getByText(/Demasiados intentos/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'inicia sesión' })).not.toBeInTheDocument();
  });
});

describe('NL-T2: doble envío', () => {
  it('mientras se crea la cuenta el botón se deshabilita y muestra el indicador de carga', () => {
    registro.state = { ...registro.state, isPending: true };
    render(createElement(RegistroPage));
    const boton = screen.getByRole('button', { name: /Creando cuenta/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
  });

  it('tras el éxito sigue deshabilitado hasta la redirección', () => {
    registro.state = { ...registro.state, isSuccess: true };
    render(createElement(RegistroPage));
    expect(screen.getByRole('button', { name: /Creando cuenta/ })).toBeDisabled();
  });
});
