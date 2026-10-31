import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Login y Registro son dos pantallas del mismo sistema: comparten la pantalla
 * dividida (fotografía + mensaje, «Volver», tema y pie) y los mismos controles.
 */

// Radix Select en jsdom.
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

/** Abre un desplegable del sistema con el teclado y devuelve sus opciones. */
async function abrir(disparador: HTMLElement) {
  disparador.focus();
  fireEvent.keyDown(disparador, { key: 'ArrowDown' });
  return within(await screen.findByRole('listbox')).findAllByRole('option');
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// La fotografía y el logotipo se representan por su texto alternativo.
vi.mock('next/image', () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => createElement('img', { alt, className }),
}));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => createElement('button', { type: 'button' }, 'Cambiar tema') }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: undefined, isSuccess: false }), isAdminUser: () => false }));
vi.mock('@/hooks/use-login', () => ({ useLogin: () => ({ mutate: vi.fn(), isPending: false }) }));
const registrar = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-register', () => ({
  useRegister: () => ({ mutate: registrar, isPending: false, isError: false, isSuccess: false, error: null }),
}));
vi.mock('@/lib/services/catalogs', () => ({
  getCarreras: () =>
    Promise.resolve([
      { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencia de la Computación' },
      { idCarrera: 2, nombreCarrera: 'Ingeniería Mecatrónica' },
    ]),
}));

import LoginPage from '../app/login/page';
import RegistroPage from '../app/registro/page';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

/** Lo que el layout compartido aporta a una pantalla, sin su contenido propio. */
function estructura(container: HTMLElement) {
  const raiz = container.firstElementChild as HTMLElement;
  const [foto, panel] = Array.from(raiz.children) as HTMLElement[];
  const quitarAlto = (clases: string) => clases.replace(/\s*lg:(h-screen|overflow-y-auto)/g, '').trim();
  return {
    raiz: quitarAlto(raiz.className),
    foto: foto.className,
    fotoAlt: foto.querySelector('img')?.getAttribute('alt'),
    filtro: foto.querySelector('div')?.className,
    panel: quitarAlto(panel.className),
    cabecera: panel.querySelector('header')?.outerHTML,
    main: panel.querySelector('main')?.className,
    pie: panel.querySelector('footer')?.outerHTML,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Identidad visual compartida de Login y Registro', () => {
  it('ambas pantallas usan la misma pantalla dividida, fotografía, «Volver», tema y pie', () => {
    const login = estructura(render(<LoginPage />, { wrapper }).container);
    cleanup();
    const registro = estructura(render(<RegistroPage />, { wrapper }).container);

    expect(registro).toEqual(login);
    expect(login.foto).toContain('lg:w-1/2');
    expect(login.panel).toContain('lg:w-1/2');
    expect(login.fotoAlt).toBe('Estudiantes UVG');
    // Sin el filtro verde intenso: solo el velo tenue de Login.
    expect(login.filtro).toBe('absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent');
  });

  it('Registro conserva su mensaje institucional sobre la fotografía y deja desplazar solo el panel del formulario', () => {
    const { container } = render(<RegistroPage />, { wrapper });
    expect(screen.getByRole('heading', { level: 2, name: 'Comienza tu camino' })).toBeInTheDocument();
    expect(screen.getByText(/oportunidades de beca, extensión y experiencia académica/)).toBeInTheDocument();
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz).toHaveClass('lg:h-screen');
    expect(raiz.children[1]).toHaveClass('lg:overflow-y-auto');
  });

  it('los controles de Registro son los de Login: etiquetas, campos y botón principal', () => {
    render(<LoginPage />, { wrapper });
    const etiquetaLogin = screen.getByText('Correo Institucional').className;
    const campoLogin = screen.getByLabelText('Correo Institucional').className;
    const botonLogin = screen.getByRole('button', { name: 'Iniciar Sesión' }).className;
    cleanup();

    render(<RegistroPage />, { wrapper });
    expect(screen.getByText('Correo institucional').className).toBe(etiquetaLogin);
    // Mismo control; en el formulario largo solo cambia el relleno vertical.
    expect(screen.getByLabelText('Correo institucional').className).toBe(campoLogin.replace('py-4', 'py-3'));
    expect(screen.getByRole('button', { name: 'Crear Cuenta' }).className).toBe(botonLogin);
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login');
  });

  it('Registro conserva los ocho campos, el catálogo de carreras y los doce semestres', async () => {
    render(<RegistroPage />, { wrapper });
    for (const etiqueta of ['Nombre', 'Apellido', 'Carnet', 'Correo institucional', 'Carrera', 'Semestre', 'Contraseña', 'Confirmar contraseña']) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
    // Carrera y semestre usan el desplegable de los filtros de búsqueda, no un <select> nativo.
    const carrera = screen.getByTestId('registro-carrera-select');
    expect(carrera).toHaveAttribute('role', 'combobox');
    expect(carrera).toHaveAttribute('data-slot', 'select-trigger');
    expect(carrera).toHaveTextContent('Seleccionar...');
    await waitFor(async () => expect(await abrir(carrera)).toHaveLength(2));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Ingeniería en Ciencia de la Computación',
      'Ingeniería Mecatrónica',
    ]);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    const semestre = screen.getByLabelText('Semestre');
    expect(semestre).toHaveAttribute('data-slot', 'select-trigger');
    expect((await abrir(semestre)).map((o) => o.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
  });

  it('Registro mantiene validaciones, indicador de fortaleza y el envío sin la confirmación', async () => {
    render(<RegistroPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('Selecciona una carrera')).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'García' } });
    fireEvent.change(screen.getByLabelText('Carnet'), { target: { value: '24725' } });
    await waitFor(() => expect(screen.getByLabelText('Correo institucional')).toHaveValue('gar24725@uvg.edu.gt'));
    const carrera = screen.getByTestId('registro-carrera-select');
    await waitFor(async () => expect(await abrir(carrera)).toHaveLength(2));
    fireEvent.click(screen.getByRole('option', { name: 'Ingeniería Mecatrónica' }));
    await waitFor(() => expect(carrera).toHaveTextContent('Ingeniería Mecatrónica'));
    await abrir(screen.getByLabelText('Semestre'));
    fireEvent.click(screen.getByRole('option', { name: '7' }));
    await waitFor(() => expect(screen.getByLabelText('Semestre')).toHaveTextContent('7'));
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd!' } });
    expect(screen.getByText('Fuerte')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Passw0rd!' } });
    expect(screen.getByText('Las contraseñas coinciden')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear Cuenta' }));
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith({
        nombre: 'Ana',
        apellido: 'García',
        carne: '24725',
        correo: 'gar24725@uvg.edu.gt',
        contrasena: 'Passw0rd!',
        idCarrera: 2,
        semestre: 7,
      }),
    );
  });
});
