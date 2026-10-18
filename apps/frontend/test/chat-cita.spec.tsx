import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatCitaBloque, ChatCitaVistaPrevia, extractoDe } from '../components/chat-dock/chat-cita';

const cita = {
  idMensaje: 7,
  remitente: { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null },
  extracto: 'Nos vemos a las 3',
};

afterEach(cleanup);

describe('extractoDe', () => {
  it('colapsa espacios y deja intacto un texto corto', () => {
    expect(extractoDe('  hola \n\n  mundo ')).toBe('hola mundo');
  });

  it('recorta a 120 caracteres con puntos suspensivos', () => {
    expect(extractoDe('a'.repeat(200))).toBe(`${'a'.repeat(120)}…`);
  });
});

describe('ChatCitaBloque', () => {
  it('muestra remitente y extracto', () => {
    render(createElement(ChatCitaBloque, { cita, propio: false, onIrAlOriginal: vi.fn() }));
    expect(screen.getByText('Rosa Fuentes')).toBeInTheDocument();
    expect(screen.getByText('Nos vemos a las 3')).toBeInTheDocument();
  });

  it('es un boton accesible que salta al mensaje original', () => {
    const onIr = vi.fn();
    render(createElement(ChatCitaBloque, { cita, propio: true, onIrAlOriginal: onIr }));

    fireEvent.click(screen.getByRole('button', { name: /Ir al mensaje original de Rosa Fuentes/ }));

    expect(onIr).toHaveBeenCalledWith(7);
  });
});

describe('ChatCitaVistaPrevia', () => {
  it('muestra a quien se responde y cancela con el boton', () => {
    const onCancelar = vi.fn();
    render(createElement(ChatCitaVistaPrevia, { nombre: 'Rosa Fuentes', extracto: 'Hola', onCancelar }));

    expect(screen.getByText('Respondiendo a Rosa Fuentes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar respuesta' }));

    expect(onCancelar).toHaveBeenCalled();
  });
});
