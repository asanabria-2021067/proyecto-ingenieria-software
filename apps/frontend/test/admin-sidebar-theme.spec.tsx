import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UserMenu } from '../components/dashboard/UserMenu';

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

describe('Superficie graphite de la sidebar', () => {
  it('los tokens de superficie y texto apuntan a la paleta graphite en ambos temas', () => {
    expect(token('--admin-bg')).toBe('var(--admin-graphite)');
    expect(token('--admin-border')).toBe('var(--admin-graphite-border)');
    expect(token('--admin-text')).toBe('var(--admin-ink)');
    expect(token('--admin-text-dim')).toBe('var(--admin-ink-muted)');
    expect(token('--admin-text-muted')).toBe('var(--admin-ink-secondary)');
    const oscuro = bloques('.dark').join('\n');
    for (const nombre of ['--admin-bg', '--admin-border', '--admin-text', '--admin-text-dim', '--admin-text-muted']) {
      expect(oscuro).not.toContain(`${nombre}:`);
    }
  });

  it('`.admin-sidebar` pinta fondo, borde y texto por defecto; los iconos inactivos usan --admin-icon', () => {
    const carcasa = bloques('.admin-sidebar')[0];
    expect(carcasa).toContain('background-color: var(--admin-bg)');
    expect(carcasa).toContain('border-right: 1px solid var(--admin-border)');
    expect(carcasa).toContain('color: var(--admin-text-dim)');
    expect(bloques('.admin-sidebar .admin-nav-inactive svg')[0]).toContain('color: var(--admin-icon)');
  });
});

describe('Encabezado de marca', () => {
  it('divisor con el borde graphite y nombre en tinta clara', () => {
    expect(bloques('.admin-sidebar-brand')[0]).toContain('border-bottom: 1px solid var(--admin-border)');
    expect(bloques('.admin-sidebar-brand-name')[0]).toContain('color: var(--admin-text)');
  });
});

describe('Etiquetas de sección', () => {
  it('usan el gris secundario, no el verde', () => {
    expect(bloques('.admin-nav-section-label')[0]).toContain('color: var(--admin-text-muted)');
  });
});

describe('Destinos raíz', () => {
  it('`.admin-nav-item`: radio del sistema, texto neutro y alto mínimo común', () => {
    const base = bloques('.admin-nav-item')[0];
    expect(base).toContain('border-radius: var(--radius-control)');
    expect(base).toContain('color: var(--admin-text-dim)');
    expect(base).toContain('min-height: 2.5rem');
    expect(base).toContain('gap: 0.75rem');
  });

  it('hover graphite con texto e icono en blanco', () => {
    expect(bloques('.admin-sidebar .admin-nav-item:hover')[0]).toContain('background-color: var(--admin-graphite-hover)');
    expect(bloques('.admin-sidebar .admin-nav-item:hover')[0]).toContain('color: var(--admin-ink)');
    expect(bloques('.admin-sidebar .admin-nav-item:hover svg')[0]).toContain('color: var(--admin-ink)');
  });
});

describe('Estado activo de los destinos raíz', () => {
  const activo = () => bloques(".admin-sidebar .admin-nav-item[aria-current='page']")[0];

  it('graphite elevado, blanco, semibold y barra lima de 3px (no un bloque lima/verde)', () => {
    expect(activo()).toContain('background-color: var(--admin-graphite-active)');
    expect(activo()).toContain('box-shadow: inset 3px 0 0 var(--admin-lime)');
    expect(activo()).toContain('color: var(--admin-ink)');
    expect(activo()).toContain('font-weight: 600');
    expect(activo()).not.toMatch(/background-color: var\(--admin-(lime|green|selector-bg)\)/);
    expect(bloques(".admin-sidebar .admin-nav-item[aria-current='page'] svg")[0]).toContain('color: var(--admin-ink)');
  });

  it('se declara después del hover para que el activo no cambie al pasar el cursor', () => {
    expect(CSS.indexOf(".admin-sidebar .admin-nav-item[aria-current='page'] {")).toBeGreaterThan(
      CSS.indexOf('.admin-sidebar .admin-nav-item:hover {'),
    );
  });
});

describe('Grupos desplegados', () => {
  it('el padre abierto usa la superficie graphite y texto blanco, nunca verde', () => {
    const abierto = bloques(".admin-sidebar .admin-nav-group[data-state='open']")[0];
    expect(abierto).toContain('background-color: var(--admin-graphite-surface)');
    expect(abierto).toContain('color: var(--admin-ink)');
    expect(abierto).not.toMatch(/--admin-(green|lime|selector-bg)/);
  });

  it('chevron gris cerrado, blanco abierto; hover propio sobre el grupo abierto', () => {
    expect(bloques('.admin-sidebar .admin-nav-group .admin-nav-chevron')[0]).toContain('color: var(--admin-text-muted)');
    expect(CSS).toMatch(/\.admin-nav-group\[data-state='open'\] \.admin-nav-chevron \{\s*color: var\(--admin-ink\)/);
    expect(bloques(".admin-sidebar .admin-nav-group[data-state='open']:hover")[0]).toContain(
      'background-color: var(--admin-graphite-hover)',
    );
  });
});

describe('Destinos anidados', () => {
  it('guía vertical con el borde graphite', () => {
    expect(bloques('.admin-nav-children')[0]).toContain('border-left: 1px solid var(--admin-graphite-border)');
  });

  it('hover propio y activo con graphite elevado + barra lima, igual que la raíz', () => {
    expect(bloques('.admin-sidebar .admin-nav-subitem:hover')[0]).toContain('background-color: var(--admin-graphite-hover)');
    const activo = bloques(".admin-sidebar .admin-nav-subitem[aria-current='page']")[0];
    expect(activo).toContain('background-color: var(--admin-graphite-active)');
    expect(activo).toContain('box-shadow: inset 3px 0 0 var(--admin-lime)');
    expect(activo).toContain('font-weight: 600');
    expect(bloques('.admin-nav-subitem')[0]).toContain('border-radius: var(--radius-control)');
  });
});

describe('Pie de cuenta del administrador', () => {
  afterEach(() => cleanup());
  const admin = { nombre: 'Admin', apellido: 'UVG', correo: 'admin@uvg.edu.gt', fotoUrl: null };

  it('avatar verde institucional con iniciales blancas, nunca lima', () => {
    expect(token('--admin-avatar-bg')).toBe('var(--admin-green)');
    expect(token('--admin-avatar-fg')).toBe('var(--admin-ink)');
    expect(bloques('.dark').join('\n')).not.toContain('--admin-avatar-bg:');
    expect(bloques('.admin-account-avatar')[0]).toContain('background-color: var(--admin-avatar-bg)');
  });

  it('nombre blanco, correo gris secundario, borde superior sutil y hover graphite', () => {
    expect(bloques('.admin-sidebar-footer')[0]).toContain('border-top: 1px solid var(--admin-border)');
    expect(bloques('.admin-account-name')[0]).toContain('color: var(--admin-text)');
    expect(CSS).toMatch(/\.admin-account-email,\s*\.admin-account-chevron \{\s*color: var\(--admin-text-muted\)/);
    expect(bloques('.admin-sidebar .admin-account-trigger:hover')[0]).toContain('background-color: var(--admin-graphite-hover)');
  });

  it('el menú de cuenta admin conserva datos e interacción y ya no usa estilos en línea', () => {
    const { container } = render(<UserMenu user={admin} onLogout={vi.fn()} variant="sidebar" theme="admin" />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('admin-account-trigger', 'rounded-control');
    expect(screen.getByText('AU')).toHaveClass('admin-account-avatar', 'rounded-full');
    expect(screen.getByText('Admin UVG')).toHaveClass('admin-account-name');
    expect(screen.getByText('admin@uvg.edu.gt')).toHaveClass('admin-account-email');
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('el menú de cuenta del estudiante no cambia', () => {
    render(<UserMenu user={admin} onLogout={vi.fn()} variant="sidebar" />);
    expect(screen.getByRole('button')).toHaveClass('hover:bg-muted', 'rounded-control');
    expect(screen.getByText('AU')).toHaveClass('bg-accent', 'text-on-accent');
    expect(screen.getByText('AU')).not.toHaveClass('admin-account-avatar');
  });
});

describe('Cuenta en la barra móvil (superficie clara)', () => {
  afterEach(() => cleanup());

  it('el disparador compacto del admin usa hover/foco de superficie clara y conserva el avatar verde', () => {
    render(
      <UserMenu
        user={{ nombre: 'Admin', apellido: 'UVG', correo: 'admin@uvg.edu.gt' }}
        onLogout={vi.fn()}
        variant="compact"
        theme="admin"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Cuenta de Admin UVG' });
    expect(trigger).toHaveClass('hover:bg-muted', 'focus-visible:ring-2');
    expect(trigger).not.toHaveClass('admin-nav-inactive');
    expect(screen.getByText('AU')).toHaveClass('admin-account-avatar');
  });
});

describe('Foco y contraste (WCAG AA)', () => {
  function luminancia(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contraste(a: string, b: string): number {
    const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }
  const P = PALETA_ADMIN;

  it.each([
    ['texto inactivo / fondo', P['--admin-ink-muted'], P['--admin-graphite'], 4.5],
    ['etiqueta y correo / fondo', P['--admin-ink-secondary'], P['--admin-graphite'], 4.5],
    ['texto hover / hover', P['--admin-ink'], P['--admin-graphite-hover'], 4.5],
    ['texto activo / activo', P['--admin-ink'], P['--admin-graphite-active'], 4.5],
    ['grupo abierto / superficie', P['--admin-ink'], P['--admin-graphite-surface'], 4.5],
    ['chevron cerrado / superficie', P['--admin-ink-secondary'], P['--admin-graphite-surface'], 3],
    ['iniciales / avatar verde', P['--admin-ink'], P['--admin-green'], 4.5],
    ['icono inactivo / fondo', P['--admin-icon'], P['--admin-graphite'], 3],
    ['barra y foco lima / activo', P['--admin-lime'], P['--admin-graphite-active'], 3],
    ['foco lima / fondo', P['--admin-lime'], P['--admin-graphite'], 3],
  ])('%s cumple %s:1 o más', (_nombre, frente, fondo, minimo) => {
    expect(contraste(frente, fondo)).toBeGreaterThanOrEqual(minimo as number);
  });

  it('items, subitems y cuenta tienen foco visible lima, distinto del hover', () => {
    expect(CSS).toMatch(
      /\.admin-sidebar \.admin-nav-item:focus-visible,\s*\.admin-sidebar \.admin-nav-subitem:focus-visible,\s*\.admin-sidebar \.admin-account-trigger:focus-visible \{\s*outline: 2px solid var\(--admin-lime\);/,
    );
    expect(bloques('.admin-sidebar .admin-nav-item:hover')[0]).not.toContain('outline');
  });
});
