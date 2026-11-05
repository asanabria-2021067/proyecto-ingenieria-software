import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-calendario-organizacion', () => ({
  useCalendarioOrganizacion: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { OrgCalendario } from '../components/organizations/org-calendario';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OrgCalendario: encabezado del mes (FIX-31)', () => {
  it('muestra "noviembre de 2026" en minúsculas, sin capitalizar cada palabra', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 5, 12) });
    render(<OrgCalendario idOrganizacion={1} />);
    const titulo = screen.getByRole('heading', { level: 2 });
    expect(titulo).toHaveTextContent('noviembre de 2026');
    expect(titulo.className).not.toMatch(/capitalize/);
  });
});
