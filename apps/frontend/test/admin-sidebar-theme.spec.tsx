import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sidebar del administrador «Enterprise Control Panel»: graphite + verde
// institucional + acento lima. La del estudiante no cambia.

const CSS = readFileSync(join(__dirname, '..', 'app/global.css'), 'utf-8');

/** Bloque de reglas de un selector exacto (p. ej. `:root` del bloque admin). */
function bloques(selector: string): string[] {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...CSS.matchAll(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]);
}

function token(nombre: string): string | undefined {
  for (const cuerpo of bloques(':root')) {
    const m = cuerpo.match(new RegExp(`${nombre}:\\s*([^;]+);`));
    if (m) return m[1].trim();
  }
  return undefined;
}

export const PALETA_ADMIN = {
  '--admin-graphite': '#191d20',
  '--admin-graphite-surface': '#20252a',
  '--admin-graphite-hover': '#262b30',
  '--admin-graphite-active': '#2d352f',
  '--admin-graphite-border': '#30363b',
  '--admin-ink': '#f7f8f9',
  '--admin-ink-muted': '#d1d5db',
  '--admin-ink-secondary': '#9ca3af',
  '--admin-icon': '#c4c8cc',
  '--admin-green': '#007a3d',
  '--admin-lime': '#a3e635',
} as const;

describe('Tokens del tema graphite del administrador', () => {
  it.each(Object.entries(PALETA_ADMIN))('%s vale %s', (nombre, valor) => {
    expect(token(nombre)).toBe(valor);
  });

  it('son fijos: el modo oscuro no los redefine (la sidebar es graphite en ambos temas)', () => {
    const oscuro = bloques('.dark').join('\n');
    for (const nombre of Object.keys(PALETA_ADMIN)) {
      expect(oscuro).not.toContain(`${nombre}:`);
    }
  });
});
