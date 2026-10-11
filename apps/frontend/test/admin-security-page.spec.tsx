import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import { getSecurityEvents } from '../lib/services/admin-security';
import { ADA, SEIS_TIPOS, base, pagina, renderPagina } from './helpers/admin-security';

/** FG02 (T-310). Página del visor de eventos de seguridad sobre un servicio simulado. */

/** Celdas de la fila n (0 = primer evento), en el orden de las columnas. */
async function celdas(fila: number) {
  const tabla = await screen.findByRole('table');
  return within(within(tabla).getAllByRole('row')[fila + 1]).getAllByRole('cell');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG02-C03: tabla del visor de eventos de seguridad', () => {
  it('tiene título, miga de pan y una tabla con las seis columnas del visor', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();

    expect(screen.getByRole('heading', { level: 1, name: 'Eventos de seguridad' })).toBeInTheDocument();
    const miga = within(screen.getByRole('navigation', { name: /breadcrumb/i }));
    expect(miga.getByText('Eventos de seguridad')).toHaveAttribute('aria-current', 'page');
    expect(miga.getByText('Administración')).toBeInTheDocument();

    const tabla = await screen.findByRole('table', { name: /Eventos de seguridad/ });
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Fecha',
      'Tipo',
      'Actor',
      'Cuenta',
      'Origen',
      'Detalle',
    ]);
    expect(within(tabla).getAllByRole('row')).toHaveLength(SEIS_TIPOS.length + 1);
  });

  it.each([
    [0, 'Cambio de estado de cuenta', 'pill-slate', 'Activo → Bloqueado'],
    [1, 'Contraseña restablecida', 'pill-turquoise', 'Solicitud n.º 77 · 2 sesiones revocadas'],
    [2, 'Enlace de recuperación emitido', 'pill-blue', 'Solicitud n.º 77'],
    [3, 'Bloqueo temporal', 'pill-red', 'Intentos fallidos repetidos'],
    [4, 'Inicio de sesión', 'pill-success', 'Sesión iniciada'],
    [5, 'Inicio de sesión fallido', 'pill-amber', 'Credenciales incorrectas · Cuenta inexistente'],
  ])('la fila %i muestra «%s» con su etiqueta %s y el resumen «%s»', async (fila, etiqueta, clase, resumen) => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();
    const [, tipo, , , , detalle] = await celdas(fila);
    const tag = within(tipo).getByText(etiqueta);
    expect(tag).toHaveClass('pill', 'pill-sm', clase);
    expect(detalle).toHaveTextContent(resumen);
  });

  it('la fecha se muestra en hora de Guatemala y conserva el instante exacto en <time>', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina([base({ id: 1, tipo: 'LOGIN_SUCCEEDED', fecha: '2026-10-11T03:30:05.000Z' })]));
    renderPagina();
    const [fecha] = await celdas(0);
    const time = fecha.querySelector('time') as HTMLTimeElement;
    expect(time).toHaveAttribute('datetime', '2026-10-11T03:30:05.000Z');
    // 03:30 UTC del día 11 son las 21:30 del día 10 en Guatemala.
    expect(time.textContent).toMatch(/^10 oct.* 2026.* 21:30:05$/);
  });

  it('actor y cuenta se identifican con nombre e ID, nunca con correo', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();
    const [, , actor, cuenta] = await celdas(0);
    expect(actor).toHaveTextContent('Ada Admin (ID 7)');
    expect(cuenta).toHaveTextContent('Eva Estudiante (ID 8)');
    expect(document.body.textContent).not.toContain('@');
  });

  it('los datos ausentes se leen como texto, no como celdas vacías ni «null»', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(
      pagina([
        base({ id: 2, tipo: 'USER_STATUS_CHANGED', actor: ADA, cuenta: { idUsuario: 99, nombre: null } }),
        base({ id: 1, tipo: 'LOGIN_FAILED' }),
      ]),
    );
    renderPagina();
    const [, , , eliminada, , sinDetalle] = await celdas(0);
    expect(eliminada).toHaveTextContent('Cuenta eliminada (ID 99)');
    expect(sinDetalle).toHaveTextContent('Sin dato');

    const [, , actor, cuenta, origen, detalle] = await celdas(1);
    expect(actor).toHaveTextContent('Sin sesión');
    expect(cuenta).toHaveTextContent('Sin cuenta asociada');
    expect(origen).toHaveTextContent('Sin IP registrada');
    expect(detalle).toHaveTextContent('Sin dato');
    expect(document.body.textContent).not.toMatch(/null|undefined|\[object/);
  });

  it('una IP no confiable se rotula «IP no verificada»; solo la confirmada dice «IP verificada»', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();
    const confirmada = (await celdas(0))[4];
    expect(confirmada).toHaveTextContent('IP verificada');
    expect(confirmada).toHaveTextContent('198.51.100.7');

    const noVerificada = (await celdas(5))[4];
    expect(noVerificada).toHaveTextContent('IP no verificada');
    expect(noVerificada).toHaveTextContent('203.0.113.9');
    expect(noVerificada).not.toHaveTextContent('IP verificada');
  });

  it('no pinta JSON crudo, claves internas ni valores que el detalle no reconoce', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(
      pagina([
        base({
          id: 1,
          tipo: 'LOGIN_FAILED',
          detalle: { motivo: 'MOTIVO_NUEVO', cuentaRef: '0123456789abcdef', token: 'tok-secreto', extra: 'valor-inesperado' },
        }),
        base({ id: 2, tipo: 'USER_STATUS_CHANGED', detalle: { estadoAnterior: '<script>', estadoNuevo: 'tok-secreto' } }),
      ]),
    );
    renderPagina();
    await screen.findByRole('table');
    const texto = document.body.textContent ?? '';
    for (const prohibido of ['tok-secreto', 'valor-inesperado', 'MOTIVO_NUEVO', '0123456789abcdef', '<script>', '{', 'cuentaRef', 'motivo']) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it('informa el total y pagina con el paginador del sistema de diseño', async () => {
    vi.mocked(getSecurityEvents).mockImplementation(async (query) =>
      pagina(SEIS_TIPOS.slice(0, 2), { total: 45, page: query?.page ?? 1, totalPages: 3 }),
    );
    renderPagina();

    const paginador = await screen.findByRole('navigation', { name: 'Paginación de eventos de seguridad' });
    expect(screen.getByText('Eventos encontrados:').parentElement).toHaveTextContent('Eventos encontrados: 45');
    expect(within(paginador).getByText('Página 1 de 3')).toBeInTheDocument();
    expect(within(paginador).getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    fireEvent.click(within(paginador).getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(screen.getByText('Página 2 de 3')).toBeInTheDocument());
    expect(vi.mocked(getSecurityEvents).mock.calls.at(-1)?.[0]).toMatchObject({ page: 2, limit: 20 });
  });

  it('con una sola página no muestra el paginador', async () => {
    vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS));
    renderPagina();
    await screen.findByRole('table');
    expect(screen.queryByRole('navigation', { name: 'Paginación de eventos de seguridad' })).not.toBeInTheDocument();
  });
});
