import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingTour from '@/components/dashboard/OnboardingTour';

const useJoyrideMock = vi.fn((_opts: { run: boolean }) => ({ Tour: null }));
vi.mock('react-joyride', () => ({
  useJoyride: (opts: { run: boolean }) => useJoyrideMock(opts),
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 7 } }),
  isProfileIncomplete: () => true,
  perfilPospuesto: (id: number) => sessionStorage.getItem('k') === String(id),
}));

const corrio = () => useJoyrideMock.mock.calls.some(([o]) => o.run);

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  useJoyrideMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OnboardingTour y asistente de perfil', () => {
  it('con perfil incompleto y sin aplazar, no arranca', () => {
    render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(false);
  });

  it('con perfil incompleto y aplazado, arranca', () => {
    sessionStorage.setItem('k', '7');
    render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(true);
  });

  it('arranca al recibir el evento de aplazamiento y respeta onboarding_seen', () => {
    render(<OnboardingTour />);
    sessionStorage.setItem('k', '7');
    localStorage.setItem('onboarding_seen_7', 'true');
    act(() => {
      window.dispatchEvent(new Event('perfil-asistente-pospuesto'));
      vi.advanceTimersByTime(2000);
    });
    expect(corrio()).toBe(false);

    localStorage.clear();
    act(() => {
      window.dispatchEvent(new Event('perfil-asistente-pospuesto'));
      vi.advanceTimersByTime(2000);
    });
    expect(corrio()).toBe(true);
  });
});
