import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Compass, Users } from 'lucide-react';
import { ProjectNavList, type NavListGroup } from '../components/projects/navigation/project-nav-list';

const GRUPOS: NavListGroup[] = [
  { id: 'explorar', label: 'Explorar', items: [{ id: 'a', href: '/a', label: 'Uno', icon: Compass }] },
  { id: 'conexiones', label: 'Conexiones', items: [{ id: 'b', href: '/b', label: 'Dos', icon: Users }] },
];

afterEach(cleanup);

describe('ProjectNavList — tono del destino activo', () => {
  it('por defecto conserva el velo neutro de la sidebar de proyecto', () => {
    render(<ProjectNavList groups={GRUPOS} activeHref="/a" variant="full" />);
    const activo = screen.getByRole('link', { name: 'Uno' });
    expect(activo).toHaveAttribute('aria-current', 'page');
    expect(activo).toHaveClass('bg-on-surface/8');
    expect(activo).not.toHaveClass('bg-sage-nav-active');
  });

  it('sage pinta el activo verde suave con indicador lateral, también en el riel', () => {
    const { rerender } = render(<ProjectNavList groups={GRUPOS} activeHref="/b" variant="full" activeTone="sage" />);
    expect(screen.getByRole('link', { name: 'Dos' })).toHaveClass('bg-sage-nav-active', 'shadow-[inset_3px_0_0_var(--color-sage-nav-accent)]');
    expect(screen.getByRole('link', { name: 'Uno' })).not.toHaveClass('bg-sage-nav-active');
    expect(screen.getByRole('group', { name: 'Conexiones' })).toBeInTheDocument();

    rerender(<ProjectNavList groups={GRUPOS} activeHref="/b" variant="rail" activeTone="sage" />);
    expect(screen.getByRole('link', { name: 'Dos' })).toHaveClass('bg-sage-nav-active');
  });
});
