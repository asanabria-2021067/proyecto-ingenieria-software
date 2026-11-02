import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/lib/services/catalogs', () => ({ getCarreras: () => Promise.resolve([]) }));
vi.mock('@/hooks/use-register', () => ({
  useRegister: () => ({ isPending: false, isSuccess: false, isError: false, error: null, mutate: vi.fn() }),
}));

import RegistroPage from '../app/registro/page';

afterEach(cleanup);

it('el registro avisa que la junta de la asociación de la carrera ve el avance de horas', () => {
  render(<RegistroPage />);
  expect(screen.getByText('La junta directiva de la asociación de tu carrera puede ver tu avance de horas.')).toBeVisible();
});
