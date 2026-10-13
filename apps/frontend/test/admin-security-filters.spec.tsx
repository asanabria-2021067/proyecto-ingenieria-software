import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import {
  SECURITY_EVENTS_NO_FILTERS,
  securityEventsFilterErrors,
  securityEventsQueryFromFilters,
} from '../lib/admin/security-events';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '../components/dashboard/dashboard-search-field';
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

describe('Filtros con el aspecto del dashboard, sin cambiar lo que hacen', () => {
  it('el select usa la clase compartida de los filtros del dashboard y los tres campos igualan su alto y radio', async () => {
    const filtros = await montar();
    const tipo = filtros.getByRole('combobox', { name: 'Tipo de evento' });
    // `h-auto` lo descarta la fusión de clases (gana `h-11.5`, que va después en la clase compartida).
    const compartidas = DASHBOARD_FILTER_TRIGGER_CLASS.split(' ').filter((c) => c !== 'h-auto');
    expect(compartidas).toEqual(expect.arrayContaining(['h-11.5', 'rounded-lg', 'border-outline-variant', 'bg-surface-container-lowest']));
    for (const control of [tipo, filtros.getByLabelText('Desde'), filtros.getByLabelText('Hasta'), filtros.getByLabelText('ID de usuario')]) {
      for (const clase of compartidas) expect(control, clase).toHaveClass(clase);
      // Ningún control conserva el radio por defecto de su primitiva.
      expect(control).not.toHaveClass('rounded-md');
    }
    // El alto del disparador vive en una variante que gana a una clase simple: se iguala con la misma variante.
    expect(tipo).toHaveClass('data-[size=default]:h-11.5');
    expect(tipo).not.toHaveClass('data-[size=default]:h-9');
  });

  it('los filtros van sobre el fondo de la página, sin tarjeta, y «Limpiar filtros» queda por encima de los campos', async () => {
    const filtros = await montar();
    const formulario = screen.getByRole('search', { name: 'Filtros de eventos de seguridad' });
    expect(formulario).not.toHaveClass('card-base');
    expect(formulario.className).not.toMatch(/\bp-card\b|\bborder\b|\bshadow/);

    const limpiar = filtros.getByRole('button', { name: 'Limpiar filtros' });
    const tipo = filtros.getByRole('combobox', { name: 'Tipo de evento' });
    // En el documento el botón va antes que el primer campo: se lee y se pinta encima.
    expect(limpiar.compareDocumentPosition(tipo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(formulario.firstElementChild).toContainElement(limpiar);
    expect(formulario.firstElementChild).toHaveClass('justify-end', 'sm:col-span-2', 'xl:col-span-4');
  });

  it('las fechas siguen siendo campos nativos con rótulo visible: no se sustituyen por otro selector', async () => {
    const filtros = await montar();
    for (const [rotulo, id] of [['Tipo de evento', 'filtro-tipo'], ['Desde', 'filtro-desde'], ['Hasta', 'filtro-hasta'], ['ID de usuario', 'filtro-usuario']]) {
      const etiqueta = filtros.getByText(rotulo, { selector: 'label' });
      expect(etiqueta).toBeVisible();
      expect(etiqueta).toHaveAttribute('for', id);
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(filtros.getByLabelText('Desde').tagName).toBe('INPUT');
    expect(filtros.getByLabelText('Hasta').tagName).toBe('INPUT');
  });

  it('conserva la nota de zona horaria y la enlaza a los dos campos de fecha', async () => {
    const filtros = await montar();
    const nota = filtros.getByText('Las fechas son días completos en hora de Guatemala e incluyen ambos extremos.');
    expect(nota).toHaveAttribute('id', 'filtro-fechas-ayuda');
    expect(filtros.getByLabelText('Desde')).toHaveAttribute('aria-describedby', 'filtro-fechas-ayuda');
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('aria-describedby', 'filtro-fechas-ayuda');
  });

  it('«Limpiar filtros» es un botón que no envía el formulario y sigue montado, deshabilitado, cuando no hay filtros', async () => {
    const filtros = await montar();
    const limpiar = filtros.getByRole('button', { name: 'Limpiar filtros' });
    expect(limpiar).toHaveAttribute('type', 'button');
    expect(limpiar).toBeDisabled();
    // Mismo botón compacto que «Ver perfil» en Gestión de Usuarios.
    expect(limpiar).toHaveClass('min-h-8', 'rounded-tag', 'bg-surface-container-high', 'px-3', 'py-1.5', 'text-xs', 'font-bold', 'text-on-surface');
    const verPerfil = readFileSync(join(__dirname, '../app/dashboard/admin/usuarios/page.tsx'), 'utf8').match(/className="([^"]*)"\s*aria-label=\{`Ver perfil de/)?.[1] ?? '';
    for (const clase of verPerfil.split(' ').filter((c) => c && !c.startsWith('hover:'))) expect(limpiar, clase).toHaveClass(clase);
    expect(verPerfil).toContain('rounded-tag');

    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });
    await waitFor(() => expect(limpiar).toBeEnabled());
    // Es el mismo nodo: el botón no se desmonta ni se vuelve a montar, así la rejilla no salta.
    expect(filtros.getByRole('button', { name: 'Limpiar filtros' })).toBe(limpiar);
  });

  it('volver a «Todos los tipos» quita el tipo de la consulta', async () => {
    await montar();
    elegirTipo('Bloqueo temporal');
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ tipo: 'ACCOUNT_LOCKED' }));

    elegirTipo('Todos los tipos');
    await waitFor(() => expect(ultimaConsulta()).toEqual({ page: 1, limit: 20 }));
  });

  it('un rango invertido se señala y no consulta; al corregirlo se aplica con ambos extremos inclusivos', async () => {
    const filtros = await montar();
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-12' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ desde: '2026-10-12T00:00:00.000-06:00' }));
    const antes = llamadas();

    fireEvent.change(filtros.getByLabelText('Hasta'), { target: { value: '2026-10-11' } });
    expect(await filtros.findByText('La fecha final no puede ser anterior a la inicial.')).toHaveAttribute('role', 'alert');
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(llamadas()).toBe(antes);

    fireEvent.change(filtros.getByLabelText('Hasta'), { target: { value: '2026-10-12' } });
    await waitFor(() =>
      expect(ultimaConsulta()).toEqual({
        desde: '2026-10-12T00:00:00.000-06:00',
        hasta: '2026-10-12T23:59:59.999-06:00',
        page: 1,
        limit: 20,
      }),
    );
  });

  it('el visor solo lee: toda consulta sale por el servicio de lectura y ningún filtro añade parámetros nuevos', async () => {
    const filtros = await montar();
    elegirTipo('Inicio de sesión fallido');
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ idUsuario: 8 }));

    const permitidas = new Set(['tipo', 'desde', 'hasta', 'idUsuario', 'page', 'limit']);
    for (const [consulta] of vi.mocked(getSecurityEvents).mock.calls) {
      for (const clave of Object.keys(consulta ?? {})) expect(permitidas.has(clave), clave).toBe(true);
    }
  });
});

describe('FG02-C04: filtros en la página', () => {
  it('cada control tiene su etiqueta y el tipo ofrece el catálogo real', async () => {
    const filtros = await montar();
    expect(filtros.getByLabelText('Desde')).toHaveAttribute('type', 'date');
    expect(filtros.getByLabelText('Hasta')).toHaveAttribute('type', 'date');
    expect(filtros.getByLabelText('ID de usuario')).toHaveAttribute('inputmode', 'numeric');
    expect(filtros.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Todos los tipos');
    expect(filtros.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();

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

  it('«Limpiar filtros» quita todos los filtros, vuelve a la página 1 y se desactiva', async () => {
    const filtros = await montar();
    elegirTipo('Inicio de sesión');
    fireEvent.change(filtros.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(filtros.getByLabelText('ID de usuario'), { target: { value: '8' } });
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ tipo: 'LOGIN_SUCCEEDED', idUsuario: 8 }));

    fireEvent.click(filtros.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(ultimaConsulta()).toEqual({ page: 1, limit: 20 }));
    expect(filtros.getByLabelText('Desde')).toHaveValue('');
    expect(filtros.getByLabelText('ID de usuario')).toHaveValue('');
    expect(filtros.getByRole('combobox', { name: 'Tipo de evento' })).toHaveTextContent('Todos los tipos');
    expect(filtros.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
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
