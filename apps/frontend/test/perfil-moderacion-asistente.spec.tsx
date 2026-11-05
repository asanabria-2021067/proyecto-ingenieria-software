import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const servicio = vi.hoisted(() => ({
  getRestricciones: vi.fn(),
  aplicarRestriccion: vi.fn(),
  quitarRestriccion: vi.fn(),
  reportarPerfil: vi.fn(),
  listarReportesPerfil: vi.fn(),
  resolverReportePerfil: vi.fn(),
  getBienvenida: vi.fn(),
  guardarBienvenida: vi.fn(),
  getPersonasParecidas: vi.fn(),
  getAsistenteReuniones: vi.fn(),
}));
vi.mock('@/lib/services/perfil-portafolio', async (importOriginal) => ({ ...(await importOriginal<object>()), ...servicio }));
vi.mock('@/lib/services/social', () => ({ buscarUsuarios: vi.fn().mockResolvedValue({ items: [], hasMore: false }) }));
vi.mock('@/lib/mensajes', () => ({
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
  confirmar: vi.fn().mockResolvedValue(true),
}));

import { BloqueosSection } from '@/components/profile/bloqueos-section';
import { ReportarDialog } from '@/components/profile/reportar-dialog';
import { PersonasParecidas } from '@/components/profile/personas-parecidas';
import { BienvenidaProyectoCard } from '@/components/projects/bienvenida-proyecto-card';
import { ReportesPerfilLista } from '@/components/profile/reportes-perfil-lista';
import { AsistenteReunionesDialog, etiquetaFecha, etiquetaHora } from '@/components/calendar/asistente-reuniones-dialog';
import { aviso } from '@/lib/mensajes';

function renderConClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ANA = { idUsuario: 2, nombre: 'Ana', apellido: 'Paz', fotoUrl: null };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('MEJ-153 Bloqueos y silencios en Configuración', () => {
  it('lista bloqueados y silenciados y permite revertir cada uno', async () => {
    servicio.getRestricciones.mockResolvedValue({ bloqueados: [ANA], silenciados: [{ ...ANA, idUsuario: 3, nombre: 'Luis', apellido: 'Gil' }] });
    servicio.quitarRestriccion.mockResolvedValue({ bloqueados: [], silenciados: [] });
    renderConClient(<BloqueosSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear a Ana Paz' }));
    await waitFor(() => expect(servicio.quitarRestriccion).toHaveBeenCalledWith('bloqueo', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Dejar de silenciar a Luis Gil' }));
    await waitFor(() => expect(servicio.quitarRestriccion).toHaveBeenCalledWith('silencio', 3));
  });

  it('sin bloqueos lo dice', async () => {
    servicio.getRestricciones.mockResolvedValue({ bloqueados: [], silenciados: [] });
    renderConClient(<BloqueosSection />);
    expect(await screen.findByText('No has bloqueado a nadie.')).toBeInTheDocument();
    expect(screen.getByText('No has silenciado a nadie.')).toBeInTheDocument();
  });
});

describe('MEJ-154 Reportar', () => {
  it('exige un motivo y envía el reporte de un mensaje', async () => {
    servicio.reportarPerfil.mockResolvedValue({ mensaje: 'ok' });
    renderConClient(<ReportarDialog idReportado={2} nombre="Ana Paz" idMensaje={9} trigger={<button type="button">Reportar</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reportar' }));

    const enviar = await screen.findByRole('button', { name: 'Enviar reporte' });
    expect(enviar).toBeDisabled();
    expect(screen.getByText('Reportar mensaje')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Motivo del reporte' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Acoso o trato irrespetuoso' }));
    fireEvent.change(screen.getByLabelText('Detalle (opcional)'), { target: { value: 'me insulta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    await waitFor(() =>
      expect(servicio.reportarPerfil).toHaveBeenCalledWith({ idReportado: 2, idMensaje: 9, motivo: 'ACOSO', detalle: 'me insulta' }),
    );
    await waitFor(() => expect(aviso.exito).toHaveBeenCalledWith('Reporte enviado', 'Administración lo revisará.'));
  });
});

describe('MEJ-154 Bandeja de administración', () => {
  const reporte = {
    idReporte: 5,
    motivo: 'SPAM',
    detalle: null,
    idMensaje: 8,
    textoMensaje: 'compra ya',
    estado: 'PENDIENTE',
    nota: null,
    creadoEn: '2026-11-01T12:00:00.000Z',
    resueltoEn: null,
    reportante: { idUsuario: 1, nombre: 'Rosa', apellido: 'Lima' },
    reportado: { idUsuario: 2, nombre: 'Ana', apellido: 'Paz' },
  };

  it('muestra el mensaje reportado y permite descartar o actuar', async () => {
    servicio.listarReportesPerfil.mockResolvedValue([reporte]);
    servicio.resolverReportePerfil.mockResolvedValue({ idReporte: 5, estado: 'DESCARTADO' });
    renderConClient(<ReportesPerfilLista />);

    expect(await screen.findByText('Mensaje de Ana Paz')).toBeInTheDocument();
    expect(screen.getByText('compra ya')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar el reporte sobre Ana Paz' }));
    await waitFor(() => expect(servicio.resolverReportePerfil).toHaveBeenCalledWith(5, 'descartar', undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como atendido el reporte sobre Ana Paz' }));
    await waitFor(() => expect(servicio.resolverReportePerfil).toHaveBeenCalledWith(5, 'actuar', undefined));
  });
});

describe('MEJ-152 Personas que trabajaron en proyectos parecidos', () => {
  it('muestra a las personas con un enlace a su perfil y se oculta si no hay ninguna', async () => {
    servicio.getPersonasParecidas.mockResolvedValue([
      { ...ANA, carrera: 'Ingeniería', proyectosParecidos: 2, ejemploProyecto: 'Huerto UVG', interesesEnComun: 1 },
    ]);
    const { unmount } = renderConClient(<PersonasParecidas idUsuario={7} />);
    const enlace = await screen.findByRole('link', { name: /Ana Paz/ });
    expect(enlace).toHaveAttribute('href', '/dashboard/personas/2');
    expect(screen.getByText('2 proyectos')).toBeInTheDocument();
    unmount();

    servicio.getPersonasParecidas.mockResolvedValue([]);
    const { container } = renderConClient(<PersonasParecidas idUsuario={8} />);
    await waitFor(() => expect(servicio.getPersonasParecidas).toHaveBeenCalledWith(8));
    expect(container.querySelector('section')).toBeNull();
  });
});

describe('MEJ-102 Mensaje de bienvenida', () => {
  it('muestra el mensaje por defecto como ayuda y guarda uno propio', async () => {
    servicio.getBienvenida.mockResolvedValue({ mensaje: null, porDefecto: 'Bienvenido {nombre}' });
    servicio.guardarBienvenida.mockResolvedValue({ mensaje: 'Hola {nombre}', porDefecto: 'Bienvenido {nombre}' });
    renderConClient(<BienvenidaProyectoCard idProyecto={4} />);

    const campo = await screen.findByRole('textbox', { name: 'Mensaje de bienvenida' });
    expect(campo).toHaveAttribute('placeholder', 'Bienvenido {nombre}');
    expect(screen.getByRole('button', { name: 'Guardar mensaje' })).toBeDisabled();

    fireEvent.change(campo, { target: { value: 'Hola {nombre}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar mensaje' }));
    await waitFor(() => expect(servicio.guardarBienvenida).toHaveBeenCalledWith(4, 'Hola {nombre}'));
  });
});

describe('MEJ-142 Asistente de reuniones', () => {
  it('formatea fechas y horas sin depender de la zona horaria del navegador', () => {
    expect(etiquetaFecha('2030-03-04')).toBe('lun 4/3');
    expect(etiquetaHora(9)).toBe('09:00');
  });

  it('sin invitados pide agregar a alguien y no consulta', () => {
    renderConClient(<AsistenteReunionesDialog open onOpenChange={() => {}} />);
    expect(screen.getByText('Agrega al menos una persona para ver su disponibilidad.')).toBeInTheDocument();
    expect(servicio.getAsistenteReuniones).not.toHaveBeenCalled();
  });

  it('muestra las franjas sugeridas y solo libre/ocupado por persona', async () => {
    const { buscarUsuarios } = await import('@/lib/services/social');
    (buscarUsuarios as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ ...ANA }], hasMore: false });
    servicio.getAsistenteReuniones.mockResolvedValue({
      zonaHoraria: 'America/Guatemala',
      horaInicio: 7,
      horaFin: 21,
      fechas: ['2030-03-04', '2030-03-05'],
      personas: [
        { ...ANA, idUsuario: 1, nombre: 'Yo', apellido: 'Mismo', esYo: true, sinDisponibilidad: false, dias: [
          { fecha: '2030-03-04', libres: [9, 10], fechaLimite: false },
          { fecha: '2030-03-05', libres: [], fechaLimite: true },
        ] },
        { ...ANA, esYo: false, sinDisponibilidad: true, dias: [
          { fecha: '2030-03-04', libres: [9], fechaLimite: false },
          { fecha: '2030-03-05', libres: [], fechaLimite: false },
        ] },
      ],
      sugerencias: [{ fecha: '2030-03-04', horaInicio: 9, horaFin: 10 }],
    });
    renderConClient(<AsistenteReunionesDialog open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByLabelText('Buscar personas para invitar'), { target: { value: 'Ana' } });
    fireEvent.click(await screen.findByRole('button', { name: /Ana Paz/ }));

    expect(await screen.findByRole('button', { name: 'lun 4/3, 09:00 a 10:00' })).toBeInTheDocument();
    const semana = screen.getByLabelText('Disponibilidad de la semana');
    expect(within(semana).getAllByText(/h libres/)).toHaveLength(4);
    expect(servicio.getAsistenteReuniones).toHaveBeenCalledWith(expect.objectContaining({ invitados: [2], dias: 7, horas: 1 }));

    fireEvent.click(screen.getByRole('button', { name: 'lun 4/3, 09:00 a 10:00' }));
    const dia = await screen.findByLabelText('Disponibilidad del lun 4/3');
    expect(within(dia).getByText('Ana 09:00: libre')).toBeInTheDocument();
    expect(within(dia).getByText('Ana 10:00: ocupado')).toBeInTheDocument();
  });
});
