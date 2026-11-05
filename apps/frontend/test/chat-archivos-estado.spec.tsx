import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Radix usa ResizeObserver, ausente en jsdom.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const filtrosPedidos: (string | undefined)[] = [];
let archivos: Record<string, unknown>[] = [];
vi.mock('@/hooks/use-chat', () => ({
  useConversationFiles: (_p: number, _c: number, _e: boolean, tipo?: string) => {
    filtrosPedidos.push(tipo);
    return { archivos, hasMore: false, isLoading: false, isError: false, cargarMas: vi.fn(), cargandoMas: false };
  },
  useMiEstado: () => ({ estado: { tipo: 'EN_REUNION', texto: null, venceEn: null } }),
  useSetMiEstado: () => ({ mutate: vi.fn(), isPending: false }),
  useClearMiEstado: () => ({ mutate: vi.fn(), isPending: false }),
  useNoMolestar: () => ({ config: undefined, isLoading: true }),
  useUpdateNoMolestar: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-chat-hilos', () => ({ useEstadoDe: () => ({ estado: { tipo: 'EN_REUNION', texto: null, venceEn: null } }) }));
vi.mock('@/lib/services/chat', () => ({ getAttachmentUrl: vi.fn() }));
vi.mock('../components/chat-dock/chat-nota-voz', () => ({ NotaVozReproductor: () => createElement('div', null, 'reproductor de voz') }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ChatFilesList } from '../components/chat-dock/chat-files-list';
import { EstadoPerfilAjeno, EstadoPerfilPropio } from '../components/chat-dock/estado-chat';

const remitente = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };

afterEach(() => {
  cleanup();
  filtrosPedidos.length = 0;
  archivos = [];
});

describe('Archivos de la conversacion (MEJ-135)', () => {
  it('filtra por tipo con los cuatro botones y vuelve a pedir con el tipo elegido', () => {
    render(createElement(ChatFilesList, { idProyecto: 10, idConversacion: 5 }));
    expect(filtrosPedidos.at(-1)).toBeUndefined();
    for (const [nombre, tipo] of [['Imágenes', 'imagen'], ['Documentos', 'documento'], ['Notas de voz', 'audio']] as const) {
      fireEvent.click(screen.getByRole('radio', { name: nombre }));
      expect(filtrosPedidos.at(-1)).toBe(tipo);
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }));
    expect(filtrosPedidos.at(-1)).toBeUndefined();
  });

  it('muestra la nota de voz con su reproductor y el documento con su descarga', () => {
    archivos = [
      { idAdjunto: 2, idMensaje: 20, nombreOriginal: 'nota.webm', mime: 'audio/webm', tamanoBytes: 100, duracionSegundos: 12, creadoEn: '2026-10-01T12:00:00.000Z', remitente },
      { idAdjunto: 1, idMensaje: 10, nombreOriginal: 'informe.pdf', mime: 'application/pdf', tamanoBytes: 2048, creadoEn: '2026-10-01T11:00:00.000Z', remitente },
    ];
    render(createElement(ChatFilesList, { idProyecto: 10, idConversacion: 5 }));
    expect(screen.getByText('reproductor de voz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar informe.pdf' })).toBeInTheDocument();
  });

  it('el vacio de cada filtro lo dice con sus palabras', () => {
    render(createElement(ChatFilesList, { idProyecto: 10, idConversacion: 5 }));
    fireEvent.click(screen.getByRole('radio', { name: 'Notas de voz' }));
    expect(screen.getByText('Todavía no se han enviado notas de voz en esta conversación.')).toBeInTheDocument();
  });
});

describe('Estado en el perfil (MEJ-132)', () => {
  const conCliente = (ui: React.ReactElement) =>
    render(createElement(QueryClientProvider, { client: new QueryClient() }, ui));

  it('el perfil propio muestra «En reunión» y permite cambiarlo, con acceso al horario de no molestar', () => {
    conCliente(createElement(EstadoPerfilPropio));
    expect(screen.getByText('En reunión')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    expect(screen.getByRole('radio', { name: 'En reunión' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Horario de no molestar' })).toBeInTheDocument();
  });

  it('el perfil de otra persona muestra su estado vigente', () => {
    conCliente(createElement(EstadoPerfilAjeno, { idUsuario: 3 }));
    expect(screen.getByText('En reunión')).toBeInTheDocument();
  });
});
