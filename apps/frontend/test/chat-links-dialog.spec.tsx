import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const cargarMas = vi.fn();
let estado: Record<string, unknown> = {};
let estadoArchivos: Record<string, unknown> = {};
vi.mock('@/hooks/use-chat', () => ({
  useConversationLinks: () => ({
    enlaces: [],
    hasMore: false,
    isLoading: false,
    isError: false,
    cargarMas,
    cargandoMas: false,
    ...estado,
  }),
  useConversationFiles: () => ({
    archivos: [],
    hasMore: false,
    isLoading: false,
    isError: false,
    cargarMas,
    cargandoMas: false,
    ...estadoArchivos,
  }),
}));
vi.mock('@/lib/services/chat', () => ({ getAttachmentUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { ChatLinksDialog } from '../components/chat-dock/chat-links-dialog';

const remitente = { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null };
const enlace = (url: string, dominio: string, idMensaje: number) => ({
  url,
  dominio,
  idMensaje,
  remitente,
  enviadoEn: '2026-10-01T12:00:00.000Z',
});

function abrir() {
  render(createElement(ChatLinksDialog, { open: true, onOpenChange: vi.fn(), idProyecto: 10, idConversacion: 5 }));
}

afterEach(() => {
  cleanup();
  estado = {};
  estadoArchivos = {};
});

const archivo = (idAdjunto: number, nombreOriginal: string, mime: string) => ({
  idAdjunto,
  idMensaje: idAdjunto + 100,
  nombreOriginal,
  mime,
  tamanoBytes: 2048,
  creadoEn: '2026-10-01T12:00:00.000Z',
  remitente,
});

function abrirArchivos() {
  abrir();
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Archivos' }), { button: 0 });
}

describe('ChatLinksDialog - pestana Archivos', () => {
  it('empieza en Enlaces y ofrece la pestana Archivos', () => {
    abrir();
    expect(screen.getByRole('tab', { name: 'Enlaces', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Archivos', selected: false })).toBeInTheDocument();
  });

  it('muestra el estado de carga, el error y el vacio', () => {
    estadoArchivos = { isLoading: true };
    abrirArchivos();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando archivos');
    cleanup();
    estadoArchivos = { isError: true };
    abrirArchivos();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los archivos');
    cleanup();
    estadoArchivos = {};
    abrirArchivos();
    expect(screen.getByText(/Todavía no se han compartido archivos/)).toBeInTheDocument();
  });

  it('lista archivos con tipo, tamano, remitente y descarga', () => {
    estadoArchivos = {
      archivos: [archivo(2, 'plano.pdf', 'application/pdf'), archivo(1, 'foto.png', 'image/png')],
    };
    abrirArchivos();
    expect(screen.getByText('plano.pdf')).toBeInTheDocument();
    expect(screen.getAllByText(/Rosa Fuentes/)).toHaveLength(2);
    expect(screen.getByText(/PDF · 2.0 KB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar foto.png' })).toBeInTheDocument();
  });

  it('carga mas archivos con el boton', () => {
    estadoArchivos = { archivos: [archivo(1, 'a.pdf', 'application/pdf')], hasMore: true };
    abrirArchivos();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(cargarMas).toHaveBeenCalled();
  });
});

describe('ChatLinksDialog', () => {
  it('muestra el estado de carga', () => {
    estado = { isLoading: true };
    abrir();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando enlaces');
  });

  it('muestra el error', () => {
    estado = { isError: true };
    abrir();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar');
  });

  it('muestra el estado vacio', () => {
    abrir();
    expect(screen.getByText(/Todavía no se han compartido enlaces/)).toBeInTheDocument();
  });

  it('lista dominio y remitente con enlace seguro, sin repetir urls', () => {
    estado = {
      enlaces: [
        enlace('https://uvg.edu.gt/a', 'uvg.edu.gt', 3),
        enlace('https://uvg.edu.gt/a', 'uvg.edu.gt', 2),
        enlace('http://ejemplo.org/b', 'ejemplo.org', 1),
      ],
    };
    abrir();
    const link = screen.getByRole('link', { name: /uvg\.edu\.gt/ });
    expect(link).toHaveAttribute('href', 'https://uvg.edu.gt/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByText(/Rosa Fuentes/)).toHaveLength(2);
  });

  it('un esquema no http no es clicable', () => {
    estado = { enlaces: [enlace('javascript:alert(1)', 'x', 1)] };
    abrir();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('carga mas con el boton', () => {
    estado = { enlaces: [enlace('https://a.com/', 'a.com', 1)], hasMore: true };
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(cargarMas).toHaveBeenCalled();
  });

  it('deshabilita el boton mientras carga mas', () => {
    estado = { enlaces: [enlace('https://a.com/', 'a.com', 1)], hasMore: true, cargandoMas: true };
    abrir();
    expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled();
  });
});
