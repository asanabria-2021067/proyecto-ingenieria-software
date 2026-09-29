import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Miembros, Postulaciones pendientes y Solicitudes de salida muestran sus
// métricas con el mismo KPI que Mis Horas (variante en línea), no con cajas
// de icono verdes propias.
const VISTAS = [
  'app/dashboard/proyectos/[id]/miembros/page.tsx',
  'app/dashboard/proyectos/[id]/miembros/postulaciones/page.tsx',
  'app/dashboard/proyectos/[id]/miembros/solicitudes-salida/page.tsx',
];

describe('Métricas de las vistas de equipo', () => {
  it.each(VISTAS)('%s usa HoursKpiCard en línea', (ruta) => {
    const fuente = readFileSync(join(__dirname, '..', ruta), 'utf-8');
    expect(fuente).toContain("from '@/components/hours/hours-kpi-card'");
    expect(fuente).toMatch(/<HoursKpiCard variante="en-linea"/);
    expect(fuente).not.toMatch(/bg-primary-container">\s*<Icon|size-11 rounded-xl bg-primary\/10/);
  });
});
