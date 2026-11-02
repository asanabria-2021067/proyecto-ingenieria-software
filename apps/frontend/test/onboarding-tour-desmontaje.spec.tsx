import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingTour from '@/components/dashboard/OnboardingTour';

vi.mock('@/hooks/use-horas-semestre', () => ({ useHorasActual: () => ({ data: { necesitaRegistro: false }, isPending: false }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 7 } }),
  isProfileIncomplete: () => false,
  perfilPospuesto: () => false,
}));

// react-joyride real: tras terminar, saltar o recargar no debe quedar nada de la guía en el documento.
const restos = () => document.querySelectorAll('.react-joyride__loader, .react-joyride__overlay, .react-joyride__spotlight');
const avanzar = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OnboardingTour desmontaje', () => {
  it('un paso cuyo objetivo no está visible no pinta el spinner de carga de joyride', () => {
    render(<OnboardingTour />);
    avanzar(1000);
    fireEvent.click(screen.getByText('Siguiente'));
    avanzar(500);
    expect(document.querySelector('.react-joyride__loader')).toBeNull();
  });

  it('al saltar el tour no queda nada montado y se marca como visto', () => {
    render(<OnboardingTour />);
    avanzar(1000);
    fireEvent.click(screen.getByText('Saltar tour'));
    avanzar(2000);
    expect(restos()).toHaveLength(0);
    expect(screen.queryByText('Siguiente')).toBeNull();
    expect(localStorage.getItem('onboarding_seen_7')).toBe('true');
  });

  it('al desmontar durante el tour no queda nada en el documento', () => {
    const { unmount } = render(<OnboardingTour />);
    avanzar(1000);
    unmount();
    expect(restos()).toHaveLength(0);
    expect(screen.queryByText('Siguiente')).toBeNull();
  });

  it('tras recargar con el tour ya visto no monta nada', () => {
    localStorage.setItem('onboarding_seen_7', 'true');
    render(<OnboardingTour />);
    avanzar(3000);
    expect(restos()).toHaveLength(0);
    expect(screen.queryByText('Siguiente')).toBeNull();
  });
});
