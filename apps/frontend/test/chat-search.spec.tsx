import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const busqueda = {
  resultados: [] as unknown[],
  hasMore: false,
  isLoading: false,
  isError: false,
  cargarMas: vi.fn(),
  cargandoMas: false,
};
const useSearchMessages = vi.fn((..._args: unknown[]) => busqueda);
const cargarHasta = vi.fn();
vi.mock('@/hooks/use-chat', () => ({
  useSearchMessages: (...args: unknown[]) => useSearchMessages(...args),
  useLoadMessagesUntil: () => cargarHasta,
}));

import { ChatSearchPanel, TextoResaltado } from '../components/chat-dock/chat-search';

const PARTICIPANTES = [
  { idUsuario: 1, nombre: 'Yo', apellido: 'Usuario', fotoUrl: null },
  { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
];

const resultado = (idMensaje: number, contenido: string) => ({
  idMensaje,
  idConversacion: 5,
  contenido,
  enviadoEn: '2026-03-10T15:00:00.000Z',
  remitente: PARTICIPANTES[1],
});

function renderPanel() {
  const onJump = vi.fn();
  const onClose = vi.fn();
  render(
    createElement(ChatSearchPanel, { idProyecto: 10, idConversacion: 5, participantes: PARTICIPANTES, onJump, onClose }),
  );
  return { onJump, onClose };
}

const buscar = () => fireEvent.click(screen.getByRole('button', { name: /^Buscar$/ }));
const escribir = (valor: string) =>
  fireEvent.change(screen.getByLabelText('Buscar texto en la conversación'), { target: { value: valor } });

afterEach(() => {
  cleanup();
  Object.assign(busqueda, { resultados: [], hasMore: false, isLoading: false, isError: false, cargandoMas: false });
});

describe('TextoResaltado', () => {
  it('envuelve las coincidencias en <mark> sin distinguir acentos', () => {
    const { container } = render(createElement(TextoResaltado, { texto: 'La reunión de hoy', termino: 'REUNION' }));
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('reunión');
    expect(container).toHaveTextContent('La reunión de hoy');
  });

  it('sin termino no marca nada', () => {
    const { container } = render(createElement(TextoResaltado, { texto: 'hola' }));
    expect(container.querySelector('mark')).toBeNull();
  });
});

describe('ChatSearchPanel', () => {
  it('no consulta hasta que se envia el formulario y valida que haya algun filtro', () => {
    renderPanel();
    expect(useSearchMessages).toHaveBeenLastCalledWith(10, 5, {}, false);
    buscar();
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un texto');
    expect(useSearchMessages).toHaveBeenLastCalledWith(10, 5, {}, false);
  });

  it('exige al menos 2 caracteres en el texto', () => {
    renderPanel();
    escribir(' a ');
    buscar();
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 2 caracteres');
  });

  it('rechaza un rango con Desde posterior a Hasta', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-01' } });
    buscar();
    expect(screen.getByRole('alert')).toHaveTextContent('no puede ser posterior');
  });

  it('aplica texto, autor y fechas como filtros (dias completos en ISO)', () => {
    renderPanel();
    escribir('  reunión ');
    fireEvent.change(screen.getByLabelText('Autor'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-10' } });
    buscar();
    expect(useSearchMessages).toHaveBeenLastCalledWith(
      10,
      5,
      {
        q: 'reunión',
        idAutor: 2,
        desde: new Date('2026-03-01T00:00:00').toISOString(),
        hasta: new Date('2026-03-10T23:59:59.999').toISOString(),
      },
      true,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('permite buscar solo por autor, sin texto', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Autor'), { target: { value: '1' } });
    buscar();
    expect(useSearchMessages).toHaveBeenLastCalledWith(10, 5, expect.objectContaining({ idAutor: 1, q: undefined }), true);
  });

  it('muestra el estado de carga', () => {
    busqueda.isLoading = true;
    renderPanel();
    escribir('hola');
    buscar();
    expect(screen.getByRole('status')).toHaveTextContent('Buscando');
  });

  it('muestra el estado de error', () => {
    busqueda.isError = true;
    renderPanel();
    escribir('hola');
    buscar();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo realizar la búsqueda');
  });

  it('muestra el estado vacio', () => {
    renderPanel();
    escribir('hola');
    buscar();
    expect(screen.getByRole('status')).toHaveTextContent('No hay mensajes que coincidan');
  });

  it('lista resultados con el termino resaltado y permite cargar mas', () => {
    busqueda.resultados = [resultado(7, 'Confirmo la reunión'), resultado(3, 'otra REUNION')];
    busqueda.hasMore = true;
    renderPanel();
    escribir('reunion');
    buscar();
    const lista = screen.getByRole('list', { name: 'Resultados de la búsqueda' });
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    expect(lista.querySelectorAll('mark')).toHaveLength(2);
    expect(screen.getByText('2 resultados o más')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más resultados' }));
    expect(busqueda.cargarMas).toHaveBeenCalled();
  });

  it('al elegir un resultado carga el historial necesario y salta al mensaje', async () => {
    busqueda.resultados = [resultado(7, 'Confirmo la reunión')];
    cargarHasta.mockResolvedValue(undefined);
    const { onJump } = renderPanel();
    escribir('reunion');
    buscar();
    fireEvent.click(screen.getByRole('button', { name: /Confirmo la reunión/ }));
    await waitFor(() => expect(onJump).toHaveBeenCalledWith(7));
    expect(cargarHasta).toHaveBeenCalledWith(7);
  });

  it('si no se puede cargar el historial avisa y no salta', async () => {
    busqueda.resultados = [resultado(7, 'Confirmo la reunión')];
    cargarHasta.mockRejectedValue(new Error('fallo'));
    const { onJump } = renderPanel();
    escribir('reunion');
    buscar();
    fireEvent.click(screen.getByRole('button', { name: /Confirmo la reunión/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar ese mensaje');
    expect(onJump).not.toHaveBeenCalled();
  });

  it('el boton Cerrar busqueda llama a onClose', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }));
    expect(onClose).toHaveBeenCalled();
  });
});
