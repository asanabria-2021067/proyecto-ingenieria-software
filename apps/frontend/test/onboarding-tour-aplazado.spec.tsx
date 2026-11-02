import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingTour from '@/components/dashboard/OnboardingTour';

const perfil = vi.hoisted(() => ({ incompleto: true }));
const useJoyrideMock = vi.fn((_opts: { run: boolean }) => ({ Tour: null }));
vi.mock('react-joyride', () => ({
  useJoyride: (opts: { run: boolean }) => useJoyrideMock(opts),
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));
const horasMock = vi.fn(() => ({ data: { necesitaRegistro: false }, isPending: false }));
vi.mock('@/hooks/use-horas-semestre', () => ({ useHorasActual: () => horasMock() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 7 } }),
  isProfileIncomplete: () => perfil.incompleto,
  perfilPospuesto: (id: number) => sessionStorage.getItem('k') === String(id),
}));

const corrio = () => useJoyrideMock.mock.calls.some(([o]) => o.run);

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  useJoyrideMock.mockClear();
  perfil.incompleto = true;
  horasMock.mockReturnValue({ data: { necesitaRegistro: false }, isPending: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('OnboardingTour y paso de horas', () => {
  it('con perfil completo y paso de horas pendiente, no arranca', () => {
    perfil.incompleto = false;
    horasMock.mockReturnValue({ data: { necesitaRegistro: true }, isPending: false });
    render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(false);
  });

  it('con perfil completo y sin paso pendiente, arranca', () => {
    perfil.incompleto = false;
    render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(true);
  });
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

describe('OnboardingTour temporizador de 800 ms', () => {
  it('no arranca si se desmonta antes de los 800 ms', () => {
    sessionStorage.setItem('k', '7');
    const { unmount } = render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(400));
    unmount();
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(false);
  });

  it('dos arranques seguidos dejan un solo temporizador', () => {
    sessionStorage.setItem('k', '7');
    render(<OnboardingTour />);
    const base = vi.getTimerCount();
    act(() => {
      window.dispatchEvent(new Event('perfil-asistente-pospuesto'));
      window.dispatchEvent(new Event('perfil-asistente-pospuesto'));
    });
    expect(vi.getTimerCount()).toBe(base);
  });

  it('reabrir el asistente cancela el arranque pendiente', () => {
    sessionStorage.setItem('k', '7');
    render(<OnboardingTour />);
    act(() => void vi.advanceTimersByTime(400));
    act(() => void window.dispatchEvent(new Event('perfil-asistente-reabierto')));
    act(() => void vi.advanceTimersByTime(2000));
    expect(corrio()).toBe(false);
  });
});
