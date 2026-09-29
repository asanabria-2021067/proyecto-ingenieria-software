import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_PAGE_CLASS, dashboardPage } from '../components/layout/dashboard-page';

// Todas las vistas principales del dashboard empiezan en la misma guía
// horizontal que «Proyectos Disponibles»: un solo contenedor compartido
// (1400 px centrado, 32 px de gutter) y ningún wrapper local que vuelva a
// fijar su propio ancho máximo o su propio gutter.

const VISTAS = [
  'app/dashboard/proyectos/page.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/personas/page.tsx',
  'app/dashboard/projects/mine/page.tsx',
  'app/dashboard/mis-tareas/page.tsx',
  'app/dashboard/mis-horas/page.tsx',
  'app/dashboard/calendario/page.tsx',
  'app/dashboard/mis-postulaciones/page.tsx',
  'app/dashboard/chats/archivados/page.tsx',
  'app/dashboard/notificaciones/page.tsx',
  'app/dashboard/perfil/page.tsx',
];

const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf-8');

/** Wrappers de página que centran con su propio ancho (el origen del desalineado). */
const WRAPPER_LOCAL = /\bmx-auto\b[^"'`]*\bmax-w-|\bmax-w-content\b|\bmax-w-\[1400px\]/g;

describe('Gutter compartido de las vistas del dashboard', () => {
  it('la regla es la de Proyectos Disponibles: 1400 px centrado y 32 px de gutter', () => {
    expect(DASHBOARD_PAGE_CLASS.split(' ')).toEqual(['mx-auto', 'w-full', 'max-w-[1400px]', 'px-section']);
  });

  it('dashboardPage añade solo el espaciado vertical de cada página', () => {
    expect(dashboardPage('pt-7 pb-10')).toBe('mx-auto w-full max-w-[1400px] px-section pt-7 pb-10');
    expect(dashboardPage()).toBe(DASHBOARD_PAGE_CLASS);
  });

  it.each(VISTAS)('%s usa el contenedor compartido', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toContain("from '@/components/layout/dashboard-page'");
    expect(fuente).toMatch(/className=\{dashboardPage\(/);
  });

  it.each(VISTAS)('%s no define un wrapper local con su propio ancho o centrado', (ruta) => {
    expect(leer(ruta).match(WRAPPER_LOCAL) ?? []).toEqual([]);
  });

  it.each(VISTAS)('%s no pasa gutter horizontal propio al contenedor', (ruta) => {
    const llamadas = leer(ruta).match(/dashboardPage\(([^)]*)\)/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);
    for (const llamada of llamadas) expect(llamada).not.toMatch(/\b(?:[a-z0-9]+:)?(?:px|pl|pr|ml|mr|mx)-/);
  });

  it('el patrón detecta los wrappers locales que debe prohibir', () => {
    expect('mx-auto max-w-content px-stack'.match(WRAPPER_LOCAL)).not.toBeNull();
    expect('mx-auto max-w-[1400px] px-8'.match(WRAPPER_LOCAL)).not.toBeNull();
    expect('mb-section max-w-content'.match(WRAPPER_LOCAL)).not.toBeNull();
    expect('relative w-full lg:max-w-xs'.match(WRAPPER_LOCAL)).toBeNull();
  });
});
