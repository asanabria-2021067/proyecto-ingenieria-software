import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PostulacionLineaTiempo } from '../components/projects/postulacion-linea-tiempo';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: apiFetchMock }));
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/components/projects/mis-invitaciones-rol', () => ({ MisInvitacionesRol: () => null }));

const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('@/lib/mensajes', () => mensajesMock);

import MisPostulacionesPage from '../app/dashboard/mis-postulaciones/page';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const rol = (nombreRol: string) => ({ idRolProyecto: 1, nombreRol, proyecto: { idProyecto: 5, tituloProyecto: 'Feria', estadoProyecto: 'PUBLICADO' } });
const POSTULACIONES = [
  {
    idPostulacion: 1,
    justificacion: 'Quiero participar en este proyecto',
    estadoPostulacion: 'PENDIENTE',
    fechaPostulacion: '2026-11-01T15:00:00.000Z',
    rolProyecto: rol('Desarrollo'),
    eventos: [
      { tipo: 'ENVIADA', fecha: '2026-11-01T15:00:00.000Z' },
      { tipo: 'VISTA', fecha: '2026-11-02T16:30:00.000Z' },
    ],
  },
  {
    idPostulacion: 2,
    justificacion: 'Me interesa este rol de diseño',
    estadoPostulacion: 'RECHAZADA',
    fechaPostulacion: '2026-10-20T15:00:00.000Z',
    motivoRechazo: 'HORARIO',
    comentarioResolucion: 'Las reuniones son por la tarde',
    rolProyecto: rol('Diseño'),
    eventos: [{ tipo: 'ENVIADA', fecha: '2026-10-20T15:00:00.000Z' }, { tipo: 'RECHAZADA', fecha: '2026-10-22T15:00:00.000Z' }],
  },
  {
    idPostulacion: 3,
    justificacion: 'Retiré esta postulación',
    estadoPostulacion: 'RETIRADA',
    fechaPostulacion: '2026-10-10T15:00:00.000Z',
    rolProyecto: rol('Datos'),
    eventos: [{ tipo: 'ENVIADA', fecha: '2026-10-10T15:00:00.000Z' }, { tipo: 'RETIRADA', fecha: '2026-10-11T15:00:00.000Z' }],
  },
];

function renderPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(MisPostulacionesPage)));
}

beforeEach(() => {
  apiFetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === '/postulaciones/mis-postulaciones') return POSTULACIONES;
    if (init?.method === 'DELETE') return { mensaje: 'ok', estadoPostulacion: 'RETIRADA' };
    return {};
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Mis postulaciones: retiro, motivo y línea de tiempo (MEJ-96, 99, 100)', () => {
  it('muestra la línea de tiempo con la fecha de cada paso', async () => {
    renderPagina();
    const pasos = (await screen.findAllByRole('list', { name: 'Línea de tiempo de la postulación' }))[0];
    const items = within(pasos).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Enviada');
    expect(items[1]).toHaveTextContent('Vista por el líder');
    expect(items[1].querySelector('time')).toHaveAttribute('datetime', '2026-11-02T16:30:00.000Z');
  });

  it('reconoce RETIRADA con su etiqueta y muestra el motivo del rechazo', async () => {
    renderPagina();
    expect(await screen.findByText('Datos')).toBeInTheDocument();
    expect(screen.getAllByText('Retirada').length).toBeGreaterThan(0);
    expect(screen.getByText('Motivo del rechazo')).toBeInTheDocument();
    expect(screen.getByText('El horario no es compatible')).toBeInTheDocument();
    expect(screen.getByText('Las reuniones son por la tarde')).toBeInTheDocument();
  });

  it('solo la pendiente se puede retirar y pide confirmación antes de llamar al API', async () => {
    mensajesMock.confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPagina();
    const boton = await screen.findByRole('button', { name: 'Retirar postulación a Desarrollo' });
    expect(screen.getAllByRole('button', { name: /Retirar postulación/ })).toHaveLength(1);

    fireEvent.click(boton);
    await waitFor(() => expect(mensajesMock.confirmar).toHaveBeenCalledTimes(1));
    expect(mensajesMock.confirmar).toHaveBeenCalledWith(expect.objectContaining({ textoAccion: 'Retirar postulación', destructiva: true }));
    expect(apiFetchMock).not.toHaveBeenCalledWith('/postulaciones/1', expect.anything());

    fireEvent.click(boton);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/postulaciones/1', { method: 'DELETE' }));
    await waitFor(() => expect(mensajesMock.aviso.exito).toHaveBeenCalledWith('Postulación retirada', expect.any(String)));
  });
});

describe('Mis postulaciones: fechas del pie salen de la línea de tiempo (FIX-31)', () => {
  it('"Enviada el" usa el evento ENVIADA aunque fechaPostulacion difiera, y "Resuelta el" el evento de resolución', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/postulaciones/mis-postulaciones') {
        return [
          {
            idPostulacion: 9,
            justificacion: 'Desfase',
            estadoPostulacion: 'RECHAZADA',
            fechaPostulacion: '2026-11-05T15:00:00.000Z',
            rolProyecto: rol('Soporte'),
            eventos: [{ tipo: 'ENVIADA', fecha: '2026-10-31T15:00:00.000Z' }, { tipo: 'RECHAZADA', fecha: '2026-11-03T15:00:00.000Z' }],
          },
          {
            idPostulacion: 10,
            justificacion: 'Sin eventos',
            estadoPostulacion: 'PENDIENTE',
            fechaPostulacion: '2026-11-05T15:00:00.000Z',
            rolProyecto: rol('Sin eventos'),
          },
        ];
      }
      return {};
    });
    renderPagina();
    expect(await screen.findByText(/Enviada el 31 de octubre de 2026/)).toHaveTextContent('Resuelta el 3 de noviembre de 2026');
    expect(screen.getByText(/Enviada el 5 de noviembre de 2026/)).not.toHaveTextContent('Resuelta el');
  });
});

describe('PostulacionLineaTiempo', () => {
  it('no pinta nada sin eventos', () => {
    const { container } = render(<PostulacionLineaTiempo eventos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
