import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import { securityEventDetailRows } from '../lib/admin/security-events';
import { getSecurityEvents } from '../lib/services/admin-security';
import type { SecurityEvent } from '../lib/types/admin-security';
import { ADA, SEIS_TIPOS, base, pagina, renderPagina } from './helpers/admin-security';

/** FG02-C05 (T-310). Detalle accesible de un evento: solo campos del contrato saneado. */

async function abrir(eventos: SecurityEvent[], fila = 0) {
  vi.mocked(getSecurityEvents).mockResolvedValue(pagina(eventos));
  renderPagina();
  const tabla = await screen.findByRole('table');
  const boton = within(tabla).getAllByRole('button', { name: /^Ver detalle:/ })[fila];
  boton.focus();
  fireEvent.click(boton);
  return { boton, dialogo: await screen.findByRole('dialog') };
}

/** Pares término → valor del detalle, en el orden en que se muestran. */
function filas(dialogo: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    within(dialogo)
      .getAllByRole('term')
      .map((dt) => [dt.textContent ?? '', dt.nextElementSibling?.textContent ?? '']),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG02-C05: detalle accesible del evento', () => {
  it('cada fila tiene un botón con un nombre que identifica su evento', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();
    const botones = within(await screen.findByRole('table')).getAllByRole('button', { name: /^Ver detalle:/ });
    expect(botones).toHaveLength(SEIS_TIPOS.length);
    expect(botones[0]).toHaveAccessibleName(/^Ver detalle: Cambio de estado de cuenta, 11 oct.* 2026.* 00:00:00$/);
    expect(new Set(botones.map((boton) => boton.getAttribute('aria-label'))).size).toBeGreaterThan(1);
  });

  it('abre un diálogo modal con título y descripción', async () => {
    const { dialogo } = await abrir(SEIS_TIPOS);
    expect(dialogo).toHaveAccessibleName('Detalle del evento de seguridad');
    expect(dialogo).toHaveAccessibleDescription(/^Cambio de estado de cuenta · 11 oct.* 00:00:00 \(hora de Guatemala\)$/);
    expect(within(dialogo).getByRole('heading', { name: 'Detalle del evento de seguridad' })).toBeInTheDocument();
  });

  it('muestra los datos del evento como lista de términos', async () => {
    const { dialogo } = await abrir(SEIS_TIPOS);
    expect(filas(dialogo)).toEqual({
      Tipo: 'Cambio de estado de cuenta',
      'Fecha y hora': expect.stringMatching(/^11 oct.* 2026.* 00:00:00$/),
      'Evento n.º': '6',
      Actor: 'Ada Admin (ID 7)',
      'Cuenta afectada': 'Eva Estudiante (ID 8)',
      Origen: 'IP verificada198.51.100.7',
      'Estado anterior': 'Activo',
      'Estado nuevo': 'Bloqueado',
    });
  });

  it.each([
    ['Escape', (dialogo: HTMLElement) => fireEvent.keyDown(dialogo, { key: 'Escape' })],
    ['la X', (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar detalle' }))],
    ['«Cerrar»', (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))],
  ])('%s lo cierra y devuelve el foco al botón que lo abrió', async (_nombre, cerrar) => {
    const { boton, dialogo } = await abrir(SEIS_TIPOS, 2);
    expect(dialogo).toContainElement(document.activeElement as HTMLElement);

    cerrar(dialogo);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(boton).toHaveFocus());
  });

  it('una IP no verificada lo dice y aclara que no es un origen confirmado', async () => {
    const { dialogo } = await abrir(SEIS_TIPOS, 5);
    const origen = within(dialogo).getByText('Origen').nextElementSibling as HTMLElement;
    expect(origen).toHaveTextContent('IP no verificada');
    expect(origen).toHaveTextContent('203.0.113.9');
    expect(origen).toHaveTextContent('No es un origen confirmado: puede ser la dirección de un proxy o de la red interna.');
    expect(origen).not.toHaveTextContent('IP verificada');
  });

  it('una IP verificada no lleva la advertencia', async () => {
    const { dialogo } = await abrir(SEIS_TIPOS, 0);
    expect(within(dialogo).queryByText(/No es un origen confirmado/)).not.toBeInTheDocument();
  });

  it('un evento sin actor, cuenta, IP ni detalle se explica con texto', async () => {
    const { dialogo } = await abrir([base({ id: 9, tipo: 'LOGIN_SUCCEEDED' })]);
    expect(filas(dialogo)).toMatchObject({
      Actor: 'Sin sesión: nadie había iniciado sesión',
      'Cuenta afectada': 'Sin cuenta asociada',
      Origen: 'Sin IP registrada',
    });
    expect(within(dialogo).getByText('Este evento no registra información adicional.')).toBeInTheDocument();
    expect(dialogo.textContent).not.toMatch(/null|undefined|\[object/);
  });

  it('una cuenta eliminada conserva su ID', async () => {
    const { dialogo } = await abrir([base({ id: 9, tipo: 'USER_STATUS_CHANGED', actor: ADA, cuenta: { idUsuario: 99, nombre: null } })]);
    expect(filas(dialogo)['Cuenta afectada']).toBe('Cuenta eliminada (ID 99)');
  });

  it('no expone claves internas, valores no reconocidos ni JSON, aunque llegaran en el evento', async () => {
    const { dialogo } = await abrir([
      base({
        id: 9,
        tipo: 'LOGIN_FAILED',
        detalle: {
          motivo: 'MOTIVO_NUEVO',
          cuentaConocida: 'quizá' as never,
          cuentaRef: 'correo@uvg.edu.gt',
          token: 'tok-secreto',
          ipTrusted: true,
          estadoNuevo: 'BLOQUEADO',
          payload: '{"interno":true}',
        },
      }),
    ]);
    const texto = dialogo.textContent ?? '';
    for (const prohibido of ['tok-secreto', 'MOTIVO_NUEVO', 'quizá', '@', 'ipTrusted', 'payload', 'interno', '{', 'Bloqueado', 'cuentaRef']) {
      expect(texto).not.toContain(prohibido);
    }
    expect(within(dialogo).getByText('Este evento no registra información adicional.')).toBeInTheDocument();
  });
});

describe('FG02-C05: securityEventDetailRows', () => {
  it.each([
    [
      SEIS_TIPOS[5],
      [
        { etiqueta: 'Motivo', valor: 'Credenciales incorrectas' },
        { etiqueta: 'La cuenta existe', valor: 'No' },
        { etiqueta: 'Referencia seudónima de la cuenta', valor: '0123456789abcdef' },
      ],
    ],
    [SEIS_TIPOS[4], []],
    [SEIS_TIPOS[3], [{ etiqueta: 'La cuenta existe', valor: 'Sí' }]],
    [
      SEIS_TIPOS[2],
      [
        { etiqueta: 'Solicitud de recuperación n.º', valor: '77' },
        { etiqueta: 'El enlace vence', valor: expect.stringMatching(/^11 oct.* 2026.* 01:00:00$/) },
      ],
    ],
    [
      SEIS_TIPOS[1],
      [
        { etiqueta: 'Solicitud de recuperación n.º', valor: '77' },
        { etiqueta: 'Sesiones revocadas', valor: '2' },
      ],
    ],
  ])('lee el detalle de $tipo', (evento, esperado) => {
    expect(securityEventDetailRows(evento)).toEqual(esperado);
  });

  it('una clave de otro tipo de evento no se muestra', () => {
    expect(securityEventDetailRows(base({ id: 1, tipo: 'LOGIN_SUCCEEDED', detalle: { motivo: 'CREDENCIALES', idSolicitud: 7 } }))).toEqual([]);
  });
});
