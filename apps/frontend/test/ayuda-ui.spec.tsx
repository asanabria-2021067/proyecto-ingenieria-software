import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

Element.prototype.scrollIntoView = () => {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => {};

const servicios = vi.hoisted(() => ({
  getPrimerosPasos: vi.fn(),
  cerrarPrimerosPasos: vi.fn(),
  enviarReporteProblema: vi.fn(),
}));
const usuario = vi.hoisted(() => ({ roles: [] as string[] }));
const subida = vi.hoisted(() => ({ uploadToCloudinary: vi.fn() }));

vi.mock('@/lib/services/ayuda', () => servicios);
vi.mock('@/lib/cloudinary', () => subida);
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, roles: usuario.roles } }),
  isAdminUser: (u?: { roles?: string[] }) => (u?.roles ?? []).includes('administrador'),
}));
vi.mock('@/hooks/use-asociaciones', () => ({ useMisJuntas: () => ({ data: [] }) }));
vi.mock('@/lib/services/projects', () => ({ getMyProjects: () => Promise.resolve([]) }));

import { PrimerosPasos } from '../components/dashboard/primeros-pasos';
import { ReportarProblemaDialog } from '../components/ayuda/reportar-problema-dialog';
import { BotonAyudaTour } from '../components/ayuda/boton-ayuda-tour';
import AyudaPage from '../app/dashboard/ayuda/page';

function conCliente(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  usuario.roles = [];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pasos = (completados: number) => ({
  pasos: (['perfil', 'horas', 'postulacion', 'organizacion', 'mensaje'] as const).map((clave, i) => ({ clave, completado: i < completados })),
  completados,
  total: 5,
  cerrada: false,
  visible: true,
});

describe('MEJ-88: tarjeta Primeros pasos', () => {
  it('muestra los cinco pasos con su enlace y el avance', async () => {
    servicios.getPrimerosPasos.mockResolvedValue(pasos(2));
    conCliente(<PrimerosPasos />);
    expect(await screen.findByText('2 de 5 completados')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de Primeros pasos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Postúlate a un proyecto/ })).toHaveAttribute('href', '/dashboard/proyectos');
    expect(screen.getByRole('link', { name: /Manda tu primer mensaje/ })).toHaveAttribute('href', '/dashboard/mensajes');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('se oculta cuando el backend dice que no es visible', async () => {
    servicios.getPrimerosPasos.mockResolvedValue({ ...pasos(5), visible: false });
    conCliente(<PrimerosPasos />);
    await waitFor(() => expect(servicios.getPrimerosPasos).toHaveBeenCalled());
    expect(screen.queryByText('Primeros pasos')).toBeNull();
  });

  it('cerrarla llama al endpoint de cerrar', async () => {
    servicios.getPrimerosPasos.mockResolvedValue(pasos(1));
    servicios.cerrarPrimerosPasos.mockResolvedValue({ cerrada: true });
    conCliente(<PrimerosPasos />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar Primeros pasos' }));
    await waitFor(() => expect(servicios.cerrarPrimerosPasos).toHaveBeenCalledTimes(1));
  });
});

describe('MEJ-90: diálogo Reportar un problema', () => {
  it('no deja enviar sin descripción', () => {
    conCliente(<ReportarProblemaDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Enviar reporte' })).toBeDisabled();
  });

  it('envía descripción, ruta y navegador, y sube la captura si la hay', async () => {
    servicios.enviarReporteProblema.mockResolvedValue({ mensaje: 'ok' });
    subida.uploadToCloudinary.mockResolvedValue({ url: 'https://res.cloudinary.com/demo/image/upload/x.png' });
    const alCerrar = vi.fn();
    conCliente(<ReportarProblemaDialog onClose={alCerrar} />);
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: '  No carga el tablero  ' } });
    const archivo = new File(['x'], 'captura.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Captura de pantalla (opcional)'), { target: { files: [archivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    expect(subida.uploadToCloudinary).toHaveBeenCalledWith(archivo, 'reportes-problema');
    expect(servicios.enviarReporteProblema).toHaveBeenCalledWith({
      ruta: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent.slice(0, 300),
      descripcion: 'No carga el tablero',
      urlCaptura: 'https://res.cloudinary.com/demo/image/upload/x.png',
    });
  });

  it('limita la descripción a 2000 caracteres', () => {
    conCliente(<ReportarProblemaDialog onClose={vi.fn()} />);
    expect(screen.getByLabelText('Descripción')).toHaveAttribute('maxlength', '2000');
  });
});

describe('MEJ-86: centro de ayuda', () => {
  it('muestra las preguntas del estudiante y filtra con la búsqueda', async () => {
    conCliente(<AyudaPage />);
    const buscador = screen.getByRole('textbox', { name: 'Buscar en el centro de ayuda' });
    const todas = screen.getAllByRole('button', { expanded: false }).length;
    expect(todas).toBeGreaterThan(5);
    fireEvent.change(buscador, { target: { value: 'zzzzzz' } });
    expect(await screen.findByText('No encontramos preguntas con esa búsqueda')).toBeInTheDocument();
    fireEvent.change(buscador, { target: { value: 'horas' } });
    expect(screen.queryByText('No encontramos preguntas con esa búsqueda')).toBeNull();
    expect(screen.getAllByRole('button', { expanded: false }).length).toBeLessThanOrEqual(todas);
  });

  it('quien no es administrador no puede ver las preguntas de otros roles', () => {
    conCliente(<AyudaPage />);
    expect(screen.queryByRole('tab', { name: 'Administración' })).toBeNull();
  });

  it('el administrador puede cambiar entre los cinco roles', () => {
    usuario.roles = ['administrador'];
    conCliente(<AyudaPage />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });
});

describe('MEJ-87: botón «?»', () => {
  it('lanza el tour de la pantalla por evento, sin tocar el de bienvenida', () => {
    const oyente = vi.fn();
    window.addEventListener('start-pantalla-tour', oyente);
    render(<BotonAyudaTour pasos={[{ target: '#x', title: 'Paso', content: 'Texto' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda de esta pantalla' }));
    window.removeEventListener('start-pantalla-tour', oyente);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect((oyente.mock.calls[0][0] as CustomEvent).detail[0]).toMatchObject({ target: '#x', title: 'Paso', skipBeacon: true });
  });
});
