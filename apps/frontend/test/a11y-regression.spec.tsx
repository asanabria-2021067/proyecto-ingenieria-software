import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FG10-C04 (T-317). Regresión de las correcciones de accesibilidad y coherencia
 * del informe de reauditoría. La reauditoría misma (axe y Lighthouse sobre las
 * cinco pantallas) corre con `scripts/qa/sprint9-a11y-audit.mjs`; aquí se fija
 * que ningún hallazgo corregido vuelva y que el informe no afirme de más.
 */

const FRONTEND = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(FRONTEND, ruta), 'utf8');
const auditoria = readFileSync(join(FRONTEND, '../../docs/qa/sprint9/accesibilidad-auditoria.md'), 'utf8');
const reauditoria = auditoria.split('## 6. Reauditoría tras las correcciones (T-317)')[1] ?? '';

describe('FG10-C04: ningún hallazgo corregido reaparece', () => {
  it('A11Y-01: el dashboard del estudiante no vuelve a atenuar texto sobre `primary` por debajo de AA', () => {
    const pagina = leer('app/dashboard/page.tsx');
    // El 70 % era el valor que fallaba. (Queda un `/80` en el saludo, sobre otro fondo: axe lo mide y pasa.)
    expect(pagina).not.toMatch(/text-on-primary\/([1-7]\d)\b/);
    expect(leer('app/global.css')).toMatch(/--color-on-primary-muted: color-mix\(in srgb, var\(--color-on-primary\) (8[5-9]|9\d|100)%, transparent\);/);
  });

  it('A11Y-02: el mini calendario de Sprints sigue pidiendo el tono con contraste AA para los días vecinos', () => {
    expect(leer('components/admin/dashboard/sprint-planning-widget.tsx')).toContain('adjacentMonthTone="secondary"');
  });

  it('A11Y-03 y A11Y-07: ningún `<li>` de las pantallas auditadas lleva un `role` ajeno', () => {
    for (const archivo of ['app/dashboard/admin/page.tsx', 'app/dashboard/page.tsx', 'app/dashboard/perfil/editar/page.tsx', 'app/dashboard/admin/proyectos/admin-projects-client.tsx']) {
      expect(leer(archivo), archivo).not.toMatch(/<li[^>]*\brole="(?!listitem)/);
    }
  });

  it('A11Y-04 y A11Y-05: en «Editar perfil» no hay etiquetas sin asociar', () => {
    const pagina = leer('app/dashboard/perfil/editar/page.tsx');
    expect(pagina.match(/<label\b/g)?.length).toBe(pagina.match(/<label htmlFor="perfil-[a-z0-9-]+"/g)?.length);
    expect(pagina).not.toMatch(/<label className=/);
  });

  it('A11Y-06: «Editar perfil» no salta niveles de encabezado', () => {
    const niveles = [...leer('app/dashboard/perfil/editar/page.tsx').matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    expect(niveles[0]).toBe(1);
    for (let i = 1; i < niveles.length; i += 1) expect(niveles[i] - niveles[i - 1]).toBeLessThanOrEqual(1);
  });

  it('A11Y-08: el enlace de la cola de atención no vuelve a sustituir su texto por un `aria-label`', () => {
    const cola = leer('components/admin/dashboard/attention-queue.tsx');
    expect(cola).not.toContain('aria-label={fila.enlaceLabel}');
    expect(cola).toContain('<span className="sr-only">. {fila.enlaceLabel}</span>');
  });

  it('las correcciones no silencian ni ocultan nada: sin `aria-hidden` nuevo ni reglas de axe desactivadas', () => {
    for (const archivo of ['app/dashboard/perfil/editar/page.tsx', 'components/admin/dashboard/attention-queue.tsx']) {
      expect(leer(archivo), archivo).not.toMatch(/axe-|disableRules|eslint-disable.*jsx-a11y/);
    }
    const harness = readFileSync(join(FRONTEND, '../../scripts/qa/sprint9-a11y-audit.mjs'), 'utf8');
    expect(harness).not.toMatch(/disableRules|rules: \{|exclude\(/);
  });
});

describe('FG10-C04: el informe de reauditoría', () => {
  it('compara las 10 combinaciones antes y después', () => {
    const filas = reauditoria.match(/^\| [^|]+ \| (claro|oscuro) \| \d+ → \d+ \| \d+ → \d+ \|/gm) ?? [];
    expect(filas).toHaveLength(10);
    expect(filas.every((fila) => / → 100 \| \d+ → 0 \|$/.test(fila))).toBe(true);
  });

  it('da cuenta de los ocho hallazgos, uno por uno', () => {
    for (const id of ['A11Y-01', 'A11Y-02', 'A11Y-03', 'A11Y-04', 'A11Y-05', 'A11Y-06', 'A11Y-07', 'A11Y-08']) {
      expect(reauditoria, id).toContain(`| ${id}`);
    }
  });

  it('declara lo que NO se corrigió, con su responsable', () => {
    expect(reauditoria).toContain('**No corregido**');
    expect(reauditoria).toContain('components/dashboard/UserMenu.tsx');
    expect(reauditoria).toContain('components/chat-dock/chat-dock.tsx');
    expect(reauditoria).toContain('### 6.3. Lo que sigue pendiente');
  });

  it('registra los casos que axe no pudo decidir y su revisión manual, sin darlos por aprobados', () => {
    expect(reauditoria).toContain('### 6.4. Casos que axe no pudo decidir, revisados a mano');
    for (const medida of ['**7.02:1**', '**7.74:1**', '**15.55:1**', '**15.64:1**']) expect(reauditoria).toContain(medida);
  });

  it('no afirma una certificación AA', () => {
    expect(reauditoria).toContain('**100 no significa AA**');
    expect(reauditoria).toContain('**no** es una certificación WCAG 2.1 AA');
    expect(auditoria).not.toMatch(/cumple (con )?WCAG|conforme a AA|certificad[oa] AA/i);
  });

  it('el spec de teclado que cita existe', () => {
    expect(() => leer('e2e/a11y-keyboard-regression.spec.ts')).not.toThrow();
    expect(reauditoria).toContain('apps/frontend/e2e/a11y-keyboard-regression.spec.ts');
  });
});
