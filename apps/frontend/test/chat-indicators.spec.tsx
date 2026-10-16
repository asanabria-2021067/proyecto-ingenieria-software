import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  quienesVieron,
  SeenBy,
  textoEscribiendo,
  textoVistoPor,
  TypingIndicator,
} from '../components/chat-dock/chat-indicators';
import type { ChatMensaje, ChatUsuario } from '../lib/types/chat';

const usuario = (idUsuario: number, nombre: string): ChatUsuario => ({ idUsuario, nombre, apellido: 'Lopez', fotoUrl: null });
const yo = usuario(1, 'Yo');
const rosa = usuario(2, 'Rosa');
const luis = usuario(3, 'Luis');
const ana = usuario(4, 'Ana');
const mensaje: ChatMensaje = {
  idMensaje: 1,
  idConversacion: 5,
  contenido: 'hola',
  enviadoEn: '2026-10-16T10:00:00Z',
  remitente: yo,
};

afterEach(cleanup);

describe('quienesVieron', () => {
  it('incluye a quien leyo en o despues del mensaje y excluye lecturas previas o nulas', () => {
    const lecturas = [
      { idUsuario: 2, ultimaLecturaEn: '2026-10-16T10:00:00Z' },
      { idUsuario: 3, ultimaLecturaEn: '2026-10-16T09:59:59Z' },
      { idUsuario: 4, ultimaLecturaEn: null },
    ];
    expect(quienesVieron(lecturas, [yo, rosa, luis, ana], mensaje)).toEqual([rosa]);
  });

  it('nunca cuenta al remitente aunque aparezca en las lecturas', () => {
    const lecturas = [{ idUsuario: 1, ultimaLecturaEn: '2026-10-16T11:00:00Z' }];
    expect(quienesVieron(lecturas, [yo, rosa], mensaje)).toEqual([]);
  });
});

describe('textos', () => {
  it('textoVistoPor: uno, dos y varios', () => {
    expect(textoVistoPor([rosa])).toBe('Visto por Rosa');
    expect(textoVistoPor([rosa, luis])).toBe('Visto por Rosa y Luis');
    expect(textoVistoPor([rosa, luis, ana])).toBe('Visto por Rosa y 2 más');
  });

  it('textoEscribiendo: nadie, uno, dos y varios', () => {
    expect(textoEscribiendo([])).toBe('');
    expect(textoEscribiendo(['Rosa'])).toBe('Rosa está escribiendo…');
    expect(textoEscribiendo(['Rosa', 'Luis'])).toBe('Rosa y Luis están escribiendo…');
    expect(textoEscribiendo(['Rosa', 'Luis', 'Ana'])).toBe('Varias personas están escribiendo…');
  });
});

describe('componentes', () => {
  it('SeenBy no renderiza nada sin lectores', () => {
    const { container } = render(createElement(SeenBy, { vieron: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('SeenBy muestra iniciales (max 3) y el texto visible', () => {
    render(createElement(SeenBy, { vieron: [rosa, luis, ana, usuario(5, 'Eva')] }));
    expect(screen.getByTestId('chat-visto-por')).toHaveTextContent('Visto por Rosa y 3 más');
    expect(screen.getByText('RL')).toBeInTheDocument();
    expect(screen.queryByText('EL')).not.toBeInTheDocument();
  });

  it('TypingIndicator es una region status en vivo, vacia sin nadie escribiendo', () => {
    const { rerender } = render(createElement(TypingIndicator, { nombres: [] }));
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    rerender(createElement(TypingIndicator, { nombres: ['Rosa'] }));
    expect(screen.getByRole('status')).toHaveTextContent('Rosa está escribiendo…');
  });
});
