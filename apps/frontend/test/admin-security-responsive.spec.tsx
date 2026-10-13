import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';

vi.mock('../lib/services/admin-security', () => ({ getSecurityEvents: vi.fn() }));

import { SECURITY_EVENT_TONE } from '../lib/admin/security-events';
import { getSecurityEvents } from '../lib/services/admin-security';
import { SEIS_TIPOS, pagina, renderPagina } from './helpers/admin-security';

/**
 * FG02-C08 (T-310). Contrato responsive y de tema del visor, comprobado sobre
 * el DOM. jsdom no calcula diseño: aquí se fija QUÉ regla aplica a cada ancho
 * y que ningún dato se pierde al ocultar una columna. Que esas reglas no
 * recorten ni desborden en 375, 768 y 1440 px, en claro y en oscuro, lo mide
 * en un navegador real `e2e/admin-security-access.spec.ts`.
 */

const fuente = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');
const ARCHIVOS = [
  'app/dashboard/admin/seguridad/page.tsx',
  'components/admin/security/security-events-table.tsx',
  'components/admin/security/security-events-filters.tsx',
  'components/admin/security/security-event-detail.tsx',
  'lib/admin/security-events.ts',
];

async function montar() {
  vi.mocked(getSecurityEvents).mockResolvedValue(pagina(SEIS_TIPOS, { total: 45, totalPages: 3 }));
  renderPagina();
  return screen.findByRole('table');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FG02-C08: tabla en anchos pequeños', () => {
  it('la tabla vive en un contenedor con nombre: sus columnas responden al ancho de la tarjeta, no al de la ventana', async () => {
    const tabla = await montar();
    expect(tabla.closest('.\\@container\\/bandeja')).not.toBeNull();
  });

  it.each([
    ['Fecha', 0, '@lg/bandeja:table-cell', '@lg/bandeja:hidden', /^11 oct.* 2026.* 00:00:00$/],
    ['Actor', 2, '@4xl/bandeja:table-cell', '@4xl/bandeja:hidden', 'Actor: Ada Admin (ID 7)'],
    ['Cuenta', 3, '@3xl/bandeja:table-cell', '@3xl/bandeja:hidden', 'Cuenta: Eva Estudiante (ID 8)'],
    ['Origen', 4, '@5xl/bandeja:table-cell', '@5xl/bandeja:hidden', 'IP verificada198.51.100.7'],
  ])('%s se oculta como columna en tarjetas estrechas y reaparece bajo el tipo', async (nombre, indice, claseColumna, claseMeta, textoMeta) => {
    const tabla = await montar();
    const encabezado = within(tabla).getByRole('columnheader', { name: nombre });
    expect(encabezado).toHaveClass('hidden', claseColumna);

    const celdas = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    expect(celdas[indice]).toHaveClass('hidden', claseColumna);
    // Varias metadatas pueden compartir umbral: se busca la que lleva este dato.
    const metas = [...celdas[1].children].filter((hijo) => hijo.classList.contains(claseMeta));
    const coincide = (texto: string) => (typeof textoMeta === 'string' ? texto === textoMeta : textoMeta.test(texto));
    expect(metas.map((meta) => meta.textContent ?? '').filter(coincide), `falta la versión compacta de ${nombre}`).toHaveLength(1);
  });

  it('Tipo y Detalle nunca se ocultan', async () => {
    const tabla = await montar();
    for (const nombre of ['Tipo', 'Detalle']) {
      expect(within(tabla).getByRole('columnheader', { name: nombre })).not.toHaveClass('hidden');
    }
  });

  it('el resumen del detalle se muestra bajo el tipo cuando su columna no tiene sitio para el texto', async () => {
    const tabla = await montar();
    const celdas = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    const compacto = [...celdas[1].children].find(
      (hijo) => hijo.classList.contains('@4xl/bandeja:hidden') && hijo.textContent === 'Activo → Bloqueado',
    );
    expect(compacto).toBeDefined();
    expect(within(celdas[5]).getByText('Activo → Bloqueado')).toHaveClass('hidden', '@4xl/bandeja:block');
  });

  it('«Ver detalle» está en todas las filas y en todos los anchos; estrecho, queda el icono con su nombre accesible', async () => {
    const tabla = await montar();
    const botones = within(tabla).getAllByRole('button', { name: /^Ver detalle:/ });
    expect(botones).toHaveLength(SEIS_TIPOS.length);
    for (const boton of botones) {
      expect(boton).not.toHaveClass('hidden');
      expect(within(boton).getByText('Ver detalle')).toHaveClass('hidden', '@3xl/bandeja:inline');
      expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('la columna de fecha apila día y hora hasta que caben en una línea', async () => {
    const tabla = await montar();
    const [fecha] = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    const partes = [...(fecha.querySelector('time') as HTMLElement).children];
    expect(partes.map((parte) => parte.textContent)).toEqual([expect.stringMatching(/^11 oct.* 2026$/), ', ', '00:00:00']);
    expect(partes[0]).toHaveClass('block', 'whitespace-nowrap', '@5xl/bandeja:inline');
    expect(partes[1]).toHaveClass('hidden', '@5xl/bandeja:inline');
    expect(partes[2]).toHaveClass('block', 'whitespace-nowrap', '@5xl/bandeja:inline');
  });

  it('la etiqueta de tipo conserva la forma del sistema: una línea, sin clases que la deformen', async () => {
    const tabla = await montar();
    for (const etiqueta of tabla.querySelectorAll('[data-slot="tag"]')) {
      const clases = [...etiqueta.classList];
      expect(clases).toHaveLength(3);
      expect(clases).toEqual(expect.arrayContaining(['pill', 'pill-sm']));
      expect(clases.every((clase) => clase.startsWith('pill'))).toBe(true);
    }
  });

  it('estrecha, la columna Detalle mide lo que su botón', async () => {
    const tabla = await montar();
    const celdas = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    expect(celdas[5]).toHaveClass('w-px', '@4xl/bandeja:w-auto');
    expect(celdas[1]).toHaveClass('min-w-0');
  });

  it('los textos largos pueden partirse: nada obliga a una barra horizontal', async () => {
    const tabla = await montar();
    const celdas = within(within(tabla).getAllByRole('row')[1]).getAllByRole('cell');
    for (const celda of celdas) expect(celda).toHaveClass('whitespace-normal');
    expect(within(celdas[2]).getByText('Ada Admin (ID 7)')).toHaveClass('break-words');
    expect(within(celdas[4]).getByText('198.51.100.7')).toHaveClass('break-all');
  });
});

describe('FG02-C08: filtros y cabecera en anchos pequeños', () => {
  it('los filtros se apilan en una columna, pasan a dos y a una fila completa según el ancho', async () => {
    await montar();
    const filtros = screen.getByRole('search', { name: 'Filtros de eventos de seguridad' });
    expect(filtros).toHaveClass('grid', 'grid-cols-1', 'sm:grid-cols-2');
    expect(filtros.className).toContain('xl:grid-cols-[');
  });

  it('cada control ocupa todo el ancho de su columna y «Limpiar filtros» ocupa el de la fila en móvil', async () => {
    await montar();
    const filtros = within(screen.getByRole('search', { name: 'Filtros de eventos de seguridad' }));
    expect(filtros.getByRole('combobox', { name: 'Tipo de evento' })).toHaveClass('w-full');
    expect(filtros.getByRole('button', { name: 'Limpiar filtros' })).toHaveClass('w-full', 'xl:w-auto');
    for (const etiqueta of ['Desde', 'Hasta', 'ID de usuario']) {
      expect(filtros.getByLabelText(etiqueta).parentElement).toHaveClass('min-w-0');
    }
  });

  it('el detalle cabe en pantallas bajas: altura acotada con desplazamiento propio y filas apiladas en móvil', async () => {
    const tabla = await montar();
    fireEvent.click(within(tabla).getAllByRole('button', { name: /^Ver detalle:/ })[0]);
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveClass('max-h-[90dvh]', 'overflow-y-auto');
    const fila = within(dialogo).getAllByRole('term')[0].parentElement as HTMLElement;
    expect(fila).toHaveClass('grid');
    // Término y valor comparten línea también en móvil: el diálogo no duplica su altura.
    expect(fila.className).toContain('grid-cols-[minmax(0,7rem)_minmax(0,1fr)]');
    expect(fila.className).toContain('sm:grid-cols-[');
  });
});

describe('FG02-C08: tema claro y oscuro', () => {
  it('cada tipo usa un tono del sistema de etiquetas, que ya define su par claro/oscuro', async () => {
    const css = fuente('app/global.css');
    for (const tono of new Set(Object.values(SECURITY_EVENT_TONE))) {
      expect(css, `falta .pill-${tono}`).toContain(`.pill-${tono}`);
    }
    const tabla = await montar();
    const etiquetas = tabla.querySelectorAll('[data-slot="tag"]');
    expect(etiquetas).toHaveLength(SEIS_TIPOS.length);
    for (const etiqueta of etiquetas) expect(etiqueta.getAttribute('style')).toBeNull();
  });

  it.each(ARCHIVOS)('%s no fija colores: ni hex, ni rgb/hsl, ni la paleta cruda de Tailwind, ni estilos en línea', (ruta) => {
    const codigo = fuente(ruta);
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(codigo).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
    expect(codigo).not.toMatch(/\b(text|bg|border|ring|fill|stroke)-(red|green|blue|amber|yellow|gray|slate|zinc|neutral|white|black)(-\d{2,3})?\b/);
    expect(codigo).not.toMatch(/style=\{/);
    expect(codigo).not.toMatch(/\bdark:/);
  });

  it('ningún elemento de la vista lleva color en línea', async () => {
    await montar();
    expect(document.querySelectorAll('[style*="color"], [style*="background"]')).toHaveLength(0);
  });
});

describe('FG02-C08: foco y teclado', () => {
  it('todos los controles de la vista son alcanzables con Tab, en el orden en que se leen', async () => {
    await montar();
    const enfocables = [...document.querySelectorAll<HTMLElement>('button, input, [role="combobox"], a[href]')].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0,
    );
    const nombres = enfocables.map((el) => el.getAttribute('aria-label') ?? el.getAttribute('id') ?? el.textContent?.trim());
    expect(nombres.slice(0, 4)).toEqual(['filtro-tipo', 'filtro-desde', 'filtro-hasta', 'filtro-usuario']);
    expect(nombres.at(-1)).toBe('Página siguiente');
    expect(nombres.filter((nombre) => nombre?.startsWith('Ver detalle:'))).toHaveLength(SEIS_TIPOS.length);
    expect(document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
  });

  it('los controles propios conservan el anillo de foco del sistema: nadie anula el contorno', () => {
    for (const ruta of ARCHIVOS) {
      expect(fuente(ruta), ruta).not.toMatch(/outline-none|focus:outline-0|focus-visible:ring-0/);
    }
  });
});
