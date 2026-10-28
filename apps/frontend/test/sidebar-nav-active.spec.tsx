import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Compass, LayoutDashboard, Network, Users } from 'lucide-react';

const navegacion = vi.hoisted(() => ({ pathname: '/dashboard/personas' }));
vi.mock('next/navigation', () => ({ usePathname: () => navegacion.pathname }));

import { SidebarNav, flattenNavEntries, type NavEntry } from '../components/dashboard/SidebarNav';

const ENTRADAS: NavEntry[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  {
    type: 'group',
    label: 'Personas',
    icon: Users,
    mobile: { href: '/dashboard/personas', label: 'Personas', icon: Users },
    items: [
      { href: '/dashboard/personas', label: 'Descubrir personas', icon: Compass },
      { href: '/dashboard/personas?seccion=amigos', label: 'Mis amigos', icon: Users },
      { href: '/dashboard/personas?seccion=amigos-de-amigos', label: 'Amigos de amigos', icon: Network },
    ],
  },
];

function renderNav(pathname: string, search: string) {
  navegacion.pathname = pathname;
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<SidebarNav entries={ENTRADAS} search={search} />, { wrapper });
}

const activos = () =>
  within(screen.getByRole('navigation'))
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);

afterEach(cleanup);

describe('SidebarNav — un solo destino activo por grupo', () => {
  it.each([
    ['/dashboard/personas', '', 'Descubrir personas'],
    ['/dashboard/personas', 'seccion=amigos', 'Mis amigos'],
    ['/dashboard/personas', 'seccion=amigos-de-amigos', 'Amigos de amigos'],
    ['/dashboard/personas/12', '', 'Descubrir personas'],
  ])('%s?%s marca solo «%s» y deja el grupo abierto', (pathname, search, esperado) => {
    renderNav(pathname, search);
    expect(activos()).toEqual([esperado]);
    expect(screen.getByRole('button', { name: 'Personas' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('en la barra móvil el grupo con `mobile` aporta un único destino', () => {
    expect(flattenNavEntries(ENTRADAS).map((leaf) => leaf.label)).toEqual(['Dashboard', 'Personas']);
  });
});
