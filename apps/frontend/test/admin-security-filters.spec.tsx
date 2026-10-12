import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import {
  SECURITY_EVENTS_NO_FILTERS,
  securityEventsFilterErrors,
  securityEventsQueryFromFilters,
} from '../lib/admin/security-events';
import { getSecurityEvents } from '../lib/services/admin-security';
import { SEIS_TIPOS, pagina, renderPagina } from './helpers/admin-security';

// Radix Select usa APIs de puntero y scroll que jsdom no implementa.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;

/** FG02-C04 (T-310). Filtros combinables del visor y su traducción a la consulta de la API. */

const ultimaConsulta = () => vi.mocked(getSecurityEvents).mock.calls.at(-1)?.[0];
const llamadas = () => vi.mocked(getSecurityEvents).mock.calls.length;

async function montar() {
  vi.mocked(getSecurityEvents).mockImplementation(async (query) =>
    pagina(SEIS_TIPOS, { total: 45, totalPages: 3, page: query?.page ?? 1 }),
  );
  renderPagina();
  await screen.findByRole('table');
  return within(screen.getByRole('search', { name: 'Filtros de eventos de seguridad' }));
}

function elegirTipo(opcion: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Tipo de evento' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG02-C04: de los filtros visibles a la consulta', () => {
  it('sin filtros no envía ninguno', () => {
    expect(securityEventsQueryFromFilters(SECURITY_EVENTS_NO_FILTERS)).toEqual({});
  });

  it('un día de Guatemala va de 00:00:00.000 a 23:59:59.999 con desplazamiento -06:00', () => {
    const query = securityEventsQueryFromFilters({ ...SECURITY_EVENTS_NO_FILTERS, desde: '2026-10-11', hasta: '2026-10-11' });
    expect(query).toEqual({ desde: '2026-10-11T00:00:00.000-06:00', hasta: '2026-10-11T23:59:59.999-06:00' });
    // En UTC: de las 06:00 del 11 a un milisegundo antes de las 06:00 del 12.
    expect(new Date(query.desde as string).toISOString()).toBe('2026-10-11T06:00:00.000Z');
    expect(new Date(query.hasta as string).toISOString()).toBe('2026-10-12T05:59:59.999Z');
  });

  it.each([
    ['fin de año', '2026-12-31', '2027-01-01T05:59:59.999Z'],
    ['29 de febrero', '2028-02-29', '2028-03-01T05:59:59.999Z'],
    // Sin horario de verano: el desplazamiento es el mismo en cualquier mes.
    ['pleno verano', '2026-07-01', '2026-07-02T05:59:59.999Z'],
  ])('el límite final de %s cae en el instante correcto', (_nombre, hasta, instante) => {
    const query = securityEventsQueryFromFilters({ ...SECURITY_EVENTS_NO_FILTERS, hasta });
    expect(new Date(query.hasta as string).toISOString()).toBe(instante);
  });

  it('combina tipo, rango e ID de usuario', () => {
    expect(
      securityEventsQueryFromFilters({ tipo: 'LOGIN_FAILED', desde: '2026-10-01', hasta: '2026-10-11', idUsuario: ' 8 ' }),
    ).toEqual({
      tipo: 'LOGIN_FAILED',
      desde: '2026-10-01T00:00:00.000-06:00',
      hasta: '2026-10-11T23:59:59.999-06:00',
      idUsuario: 8,
    });
  });

  it.each([
    [{ desde: '2026-10-12', hasta: '2026-10-11' }, { hasta: 'La fecha final no puede ser anterior a la inicial.' }],
    [{ desde: '2026-02-30' }, { desde: 'La fecha inicial no es válida.' }],
    [{ hasta: '11/10/2026' }, { hasta: 'La fecha final no es válida.' }],
    [{ idUsuario: 'abc' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
    [{ idUsuario: '0' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
    [{ idUsuario: '-3' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
    [{ idUsuario: '1.5' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
    [{ idUsuario: '2147483648' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
    [{ idUsuario: '8 OR 1=1' }, { idUsuario: 'El ID de usuario debe ser un número entero positivo.' }],
  ])('%j se marca como inválido', (parcial, errores) => {
    expect(securityEventsFilterErrors({ ...SECURITY_EVENTS_NO_FILTERS, ...parcial })).toEqual(errores);
  });

  it.each([{}, { desde: '2026-10-11', hasta: '2026-10-11' }, { idUsuario: '2147483647' }, { idUsuario: ' 8 ' }])(
    '%j es válido',
    (parcial) => {
      expect(securityEventsFilterErrors({ ...SECURITY_EVENTS_NO_FILTERS, ...parcial })).toEqual({});
    },
  );
});

describe('FG02-C04: filtros en la página', () => {
  it('cada control tiene su etiqueta y el tipo ofrece el catálogo real', async () => {
    const filtros = await montar();
    expect(filtros.getByLabelText('Desde')).toHaveAttribute('type', 'date');
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('type', 'date');
    expect(filtros.getByLabelText('ID de usuario')).toHaveAttribute('inputmode', 'numeric');
    expect(filtros.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Todos los tipos');
    expect(filtros.getByRole('button', { name: 'Limpiar' })).toBeDisabled();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Tipo de evento' }), { key: 'Enter' });
    expect(screen.getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Todos los tipos',
      'Inicio de sesión fallido',
      'Inicio de sesión',
      'Bloqueo temporal',
      'Enlace de recuperación emitido',
      'Contraseña restablecida',
      'Cambio de estado de cuenta',
    ]);
  });

  it('la primera consulta no lleva filtros', async () => {
    await montar();
    expect(ultimaConsulta()).toEqual({ page: 1, limit: 20 });
  });

  it('elegir un tipo consulta la API con ese tipo', async () => {
    await montar();
    elegirTipo('Bloqueo temporal');
    await waitFor(() => expect(ultimaConsulta()).toEqual({ tipo: 'ACCOUNT_LOCKED', page: 1, limit: 20 }));
    expect(screen.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Bloqueo temporal');
  });

  it('los filtros se combinan y la API recibe exactamente lo que se ve', async () => {
    const filtros = await montar();
    elegirTipo('Inicio de sesión fallido');
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(filtros.getByLabelText('Hasta'), { target: { value: '2026-10-11' } });
    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });

    await waitFor(() =>
      expect(ultimaConsulta()).toEqual({
        tipo: 'LOGIN_FAILED',
        desde: '2026-10-01T00:00:00.000-06:00',
        hasta: '2026-10-11T23:59:59.999-06:00',
        idUsuario: 8,
        page: 1,
        limit: 20,
      }),
    );
  });

  it('cambiar un filtro vuelve a la página 1', async () => {
    const filtros = await montar();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ page: 2 }));

    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });
    await waitFor(() => expect(ultimaConsulta()).toEqual({ idUsuario: 8, page: 1, limit: 20 }));
    await waitFor(() => expect(screen.getByText('Página 1 de 3')).toBeInTheDocument());
  });

  it('«Limpiar» quita todos los filtros, vuelve a la página 1 y se desactiva', async () => {
    const filtros = await montar();
    elegirTipo('Inicio de sesión');
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ tipo: 'LOGIN_SUCCEEDED', idUsuario: 8 }));

    fireEvent.click(filtros.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(ultimaConsulta()).toEqual({ page: 1, limit: 20 }));
    expect(filtros.getByLabelText('Desde')).toHaveValue('');
    expect(filtros.getByLabelText('ID de usuario')).toHaveValue('');
    expect(filtros.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Todos los tipos');
    expect(filtros.getByRole('button', { name: 'Limpiar' })).toBeDisabled();
  });

  it('un ID inválido se señala en su campo y NO lanza una consulta nueva', async () => {
    const filtros = await montar();
    const antes = llamadas();
    const campo = filtros.getByLabelText('ID de usuario');
    fireEvent.change(campo, { target: { value: '8 OR 1=1' } });

    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('El ID de usuario debe ser un número entero positivo.');
    expect(filtros.getByRole('alert')).toHaveTextContent('El ID de usuario debe ser un número entero positivo.');
    expect(screen.getByText('Corrige los filtros marcados para actualizar los resultados.')).toBeInTheDocument();
    expect(llamadas()).toBe(antes);

    fireEvent.change(campo, { target: { value: '8' } });
    await waitFor(() => expect(ultimaConsulta()).toEqual({ idUsuario: 8, page: 1, limit: 20 }));
    expect(campo).not.toHaveAttribute('aria-invalid');
    expect(filtros.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un rango invertido se señala y la tabla conserva los últimos filtros válidos', async () => {
    const filtros = await montar();
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-11' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ desde: '2026-10-11T00:00:00.000-06:00' }));
    const antes = llamadas();

    fireEvent.change(filtros.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(filtros.getByRole('alert')).toHaveTextContent('La fecha final no puede ser anterior a la inicial.');
    expect(llamadas()).toBe(antes);
    expect(ultimaConsulta()).not.toHaveProperty('hasta');
  });

  it('los límites del selector de fecha se acotan entre sí', async () => {
    const filtros = await montar();
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(filtros.getByLabelText('Hasta'), { target: { value: '2026-10-11' } });
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('min', '2026-10-01');
    expect(filtros.getByLabelText('Desde')).toHaveAttribute('max', '2026-10-11');
  });
});
