import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  resumen: { data: undefined as unknown, isLoading: false, isError: false },
  actividad: { data: undefined as unknown, isLoading: false, isError: false },
  descargarCvPdf: vi.fn(),
  descargar: vi.fn(),
  exito: vi.fn(),
}));

vi.mock('@/hooks/use-perfil-social', () => ({
  usePerfilResumen: () => state.resumen,
  useActividadReciente: () => state.actividad,
}));
vi.mock('@/lib/services/perfil-social', () => ({ descargarCvPdf: state.descargarCvPdf }));
vi.mock('@/lib/download-file', () => ({ downloadBlob: state.descargar }));
vi.mock('@/lib/mensajes', () => ({ aviso: { exito: state.exito, error: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { PerfilActividad, PerfilCvAcciones, PerfilOrganizaciones } from '@/components/profile/perfil-social-secciones';

afterEach(cleanup);
beforeEach(() => {
  state.resumen = { data: undefined, isLoading: false, isError: false };
  state.actividad = { data: undefined, isLoading: false, isError: false };
  vi.clearAllMocks();
});

const resumen = {
  organizaciones: [{ idOrganizacion: 4, nombreOrganizacion: 'Robótica UVG', logoUrl: null, rol: 'EDITOR' }],
  asociaciones: [{ idAsociacion: 2, nombre: 'Asociación de Computación', logoUrl: null }],
  horasSemestre: { anio: 2026, periodo: 2, becaAcreditadas: 12, extensionAcreditadas: 3.5 },
};

describe('PerfilOrganizaciones (MEJ-26)', () => {
  it('muestra organizaciones con su rol, la asociación de la carrera y las horas acreditadas', () => {
    state.resumen.data = resumen;
    render(<PerfilOrganizaciones idUsuario={9} />);
    expect(screen.getByRole('link', { name: /Robótica UVG/ })).toHaveAttribute('href', '/dashboard/organizaciones/4');
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Asociación de Computación')).toBeInTheDocument();
    expect(screen.getByText('Horas acreditadas 2026-2')).toBeInTheDocument();
    expect(screen.getByText('12 h')).toBeInTheDocument();
    expect(screen.getByText('3.5 h')).toBeInTheDocument();
  });

  it('en el perfil propio sin organizaciones ofrece explorarlas; en uno ajeno no', () => {
    state.resumen.data = { ...resumen, organizaciones: [], asociaciones: [] };
    const { rerender } = render(<PerfilOrganizaciones idUsuario={9} propio />);
    expect(screen.getByRole('link', { name: 'Explorar organizaciones' })).toBeInTheDocument();
    rerender(<PerfilOrganizaciones idUsuario={9} />);
    expect(screen.queryByRole('link', { name: 'Explorar organizaciones' })).not.toBeInTheDocument();
  });

  it('mostrarHoras=false omite la tarjeta de horas y la carga muestra esqueleto', () => {
    state.resumen.data = resumen;
    const { rerender } = render(<PerfilOrganizaciones idUsuario={9} mostrarHoras={false} />);
    expect(screen.queryByText(/Horas acreditadas/)).not.toBeInTheDocument();
    state.resumen = { data: undefined, isLoading: true, isError: false };
    rerender(<PerfilOrganizaciones idUsuario={9} />);
    expect(screen.getByRole('status', { name: 'Cargando organizaciones y horas' })).toBeInTheDocument();
  });
});

describe('PerfilActividad (MEJ-64)', () => {
  it('lista los movimientos con enlace a su proyecto u organización', () => {
    state.actividad.data = [
      { tipo: 'PROYECTO', fecha: '2026-10-01T00:00:00.000Z', titulo: 'Feria', detalle: 'Dev', idProyecto: 3, idOrganizacion: null },
      { tipo: 'INSIGNIA', fecha: '2026-09-01T00:00:00.000Z', titulo: 'Colaborador', detalle: 'ORO', idProyecto: null, idOrganizacion: null },
    ];
    render(<PerfilActividad idUsuario={9} />);
    expect(screen.getByRole('link', { name: /Se unió a Feria como Dev/ })).toHaveAttribute('href', '/dashboard/proyectos/3');
    expect(screen.getByText(/Obtuvo la insignia Colaborador \(oro\)/)).toBeInTheDocument();
  });

  it('sin actividad muestra el vacío y, en el perfil propio, la acción', () => {
    state.actividad.data = [];
    render(<PerfilActividad idUsuario={9} propio />);
    expect(screen.getByText('Sin actividad reciente para mostrar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorar proyectos' })).toBeInTheDocument();
  });
});

describe('PerfilCvAcciones (MEJ-27, MEJ-63)', () => {
  it('enlaza al CV, descarga el PDF y copia un enlace que exige sesión', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    state.descargarCvPdf.mockResolvedValue(new Blob(['%PDF']));
    render(<PerfilCvAcciones idUsuario={9} />);
    expect(screen.getByRole('link', { name: /Ver currículum de proyectos/ })).toHaveAttribute('href', '/dashboard/personas/9/cv');

    fireEvent.click(screen.getByRole('button', { name: /CV en PDF/ }));
    await waitFor(() => expect(state.descargar).toHaveBeenCalledWith(expect.any(Blob), 'cv-proyectos.pdf'));
    expect(state.descargarCvPdf).toHaveBeenCalledWith(9);

    fireEvent.click(screen.getByRole('button', { name: /Copiar enlace del CV/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/dashboard/personas/9/cv`));
    expect(state.exito).toHaveBeenCalledWith('Enlace copiado', expect.stringContaining('iniciar sesión'));
  });
});
