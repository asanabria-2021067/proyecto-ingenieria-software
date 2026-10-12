import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AdminAttentionQueue } from '../components/admin/dashboard/attention-queue';

/**
 * FG10-C02 (T-317). Nombres y asociaciones de los controles señalados por la
 * auditoría de T-316: A11Y-04 y A11Y-05 (campos sin etiqueta), A11Y-06
 * (jerarquía de encabezados), A11Y-03 y A11Y-07 (lista sin semántica) y
 * A11Y-08 (nombre accesible sin el texto visible).
 */

const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');

afterEach(cleanup);

describe('FG10-C02 · A11Y-04 y A11Y-05: «Editar perfil»', () => {
  const pagina = leer('app/dashboard/perfil/editar/page.tsx');
  const etiquetas = [...pagina.matchAll(/<label htmlFor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map((m) => ({ para: m[1], texto: m[2].replace(/\s+/g, ' ').trim() }));
  /** Cada control con sus atributos, tal como está escrito. */
  const controles = [...pagina.matchAll(/<(input|select|textarea)\b([\s\S]*?)(?:\/>|>)/g)].map((m) => ({ tipo: m[1], atributos: m[2] }));
  const idDe = (atributos: string) => atributos.match(/\bid="([^"]+)"/)?.[1] ?? null;

  it('toda etiqueta del formulario está asociada a un control', () => {
    expect(pagina.match(/<label\b/g)).toHaveLength(17);
    expect(etiquetas).toHaveLength(17);
    const ids = controles.map((c) => idDe(c.atributos)).filter(Boolean);
    for (const { para, texto } of etiquetas) expect(ids, `${texto} → ${para}`).toContain(para);
  });

  it('ningún identificador se repite', () => {
    const ids = controles.map((c) => idDe(c.atributos)).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(etiquetas.map((e) => e.para)).size).toBe(etiquetas.length);
  });

  it('todo campo del formulario tiene nombre: una etiqueta asociada o un `aria-label`', () => {
    expect(controles).toHaveLength(19);
    const conEtiqueta = new Set(etiquetas.map((e) => e.para));
    const sinNombre = controles.filter((c) => !conEtiqueta.has(idDe(c.atributos) ?? '') && !/aria-label="[^"]+"/.test(c.atributos));
    expect(sinNombre.map((c) => c.atributos.trim().slice(0, 60))).toEqual([]);
  });

  it.each([
    ['perfil-nombre', 'Nombre', 'input'],
    ['perfil-apellido', 'Apellido', 'input'],
    ['perfil-carrera', 'Carrera', 'select'],
    ['perfil-semestre-actual', 'Semestre Actual', 'input'],
    ['perfil-disponibilidad-horas-sem', 'Disponibilidad (horas/sem)', 'input'],
    ['perfil-horas-beca-requeridas', 'Horas Beca Requeridas', 'input'],
    ['perfil-horas-extension-requeridas', 'Horas Extensión Requeridas', 'input'],
  ])('el campo %s del primer paso se llama «%s»', (id, texto, tipo) => {
    expect(etiquetas).toContainEqual({ para: id, texto });
    expect(controles.find((c) => idDe(c.atributos) === id)?.tipo).toBe(tipo);
  });

  it('los dos campos que solo tenían texto de ayuda llevan un nombre propio: el placeholder no es una etiqueta', () => {
    expect(pagina).toContain('aria-label="Añadir un interés que no está en la lista"');
    expect(pagina).toContain('aria-label="Añadir una cualidad que no está en la lista"');
  });

  it('el nombre de cada campo es el texto que se ve: no se inventó un rótulo distinto', () => {
    for (const { texto } of etiquetas) {
      expect(texto.length).toBeGreaterThan(3);
      expect(texto).not.toMatch(/aria-|<\w/);
    }
  });
});

describe('FG10-C02 · A11Y-06: jerarquía de encabezados de «Editar perfil»', () => {
  const pagina = leer('app/dashboard/perfil/editar/page.tsx');

  it('hay un único h1 y los títulos de cada paso son h2: ningún nivel se salta', () => {
    expect(pagina.match(/<h1\b/g)).toHaveLength(1);
    expect(pagina.match(/<h2\b/g)).toHaveLength(6);
    expect(pagina).not.toMatch(/<h3\b|<\/h3>/);
    expect(pagina.match(/<\/h2>/g)).toHaveLength(6);
  });

  it('los títulos conservan sus clases: el cambio de nivel no altera el aspecto', () => {
    expect(pagina.match(/<h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant\/30 pb-3">/g)).toHaveLength(6);
  });
});

describe('FG10-C02 · A11Y-03 y A11Y-07: lista de indicadores del panel de administración', () => {
  const panel = leer('app/dashboard/admin/page.tsx');

  it('ningún `<li>` lleva un `role` que le quite su papel de elemento de lista', () => {
    expect(panel).not.toMatch(/<li[^>]*\brole=/);
    for (const archivo of ['components/admin/dashboard/attention-queue.tsx', 'components/admin/dashboard/sprint-planning-widget.tsx']) {
      expect(leer(archivo), archivo).not.toMatch(/<li[^>]*\brole="(?!listitem)/);
    }
  });

  it('el grupo con nombre de cada indicador se conserva, dentro del elemento de lista', () => {
    expect(panel).toMatch(/<li>\s*<div role="group" aria-label=\{label\} className="flex items-center gap-inline px-card py-stack">/);
  });
});

describe('FG10-C02 · A11Y-08: el nombre accesible incluye el texto visible', () => {
  it('cada enlace de la cola de atención empieza por su título visible y termina con el destino', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(3);
    for (const enlace of enlaces) {
      const visible = [...enlace.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
      expect(visible.length).toBeGreaterThan(3);
      // WCAG 2.5.3: lo que se ve forma parte del nombre.
      const nombre = (enlace.textContent ?? '').replace(/\s+/g, ' ').trim();
      expect(nombre.startsWith(`${visible}. Ver `), nombre).toBe(true);
      // El nombre que calcula el navegador empieza por lo visible (WCAG 2.5.3).
      expect(screen.getByRole('link', { name: new RegExp(`^${visible}`) })).toBe(enlace);
      expect(enlace).not.toHaveAttribute('aria-label');
      expect(within(enlace).getByText(/^\. Ver /)).toHaveClass('sr-only');
    }
  });

  it('los enlaces siguen distinguiéndose entre sí por su destino', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    const nombres = screen.getAllByRole('link').map((a) => a.textContent);
    expect(new Set(nombres).size).toBe(3);
    expect(screen.getByRole('link', { name: /\. Ver gestión de usuarios$/ })).toHaveAttribute('href', '/dashboard/admin/usuarios');
  });
});
