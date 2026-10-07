import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/services/admin', () => ({ getAdminMetricas: vi.fn() }));

import { AdminMetricsSection, formatearInicio, sinDatos } from '../components/admin/AdminMetricsSection';
import { getAdminMetricas, type AdminMetricas, type AdminMetricasPunto } from '../lib/services/admin';

/** jsdom no implementa ResizeObserver; ResponsiveContainer de recharts lo usa. */
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function punto(inicio: string, overrides: Partial<AdminMetricasPunto> = {}): AdminMetricasPunto {
  return {
    inicio,
    usuariosNuevos: 0,
    usuariosActivos: 0,
    proyectosCreados: 0,
    tareasCompletadas: 0,
    horasConfirmadas: 0,
    ...overrides,
  };
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(createElement(AdminMetricsSection), { wrapper });
}

const conDatos: AdminMetricas = {
  periodo: 'semana',
  serie: [
    punto('2026-09-28', { usuariosNuevos: 3, horasConfirmadas: 4.5 }),
    punto('2026-10-05', { usuariosNuevos: 2, tareasCompletadas: 4, horasConfirmadas: 5.5 }),
  ],
};

describe('AdminMetricsSection — HU-178', () => {
  it('pide la semana por defecto y muestra una tarjeta por métrica', async () => {
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();

    expect(await screen.findByText('Usuarios nuevos')).toBeInTheDocument();
    expect(getAdminMetricas).toHaveBeenCalledWith('semana');
    for (const label of ['Usuarios activos', 'Proyectos creados', 'Tareas completadas', 'Horas confirmadas']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Valor del periodo en curso + total de la ventana.
    expect(screen.getByText('esta semana · 5 en las últimas 8 semanas')).toBeInTheDocument();
    expect(screen.getByText('esta semana · 10 h en las últimas 8 semanas')).toBeInTheDocument();
  });

  it('el selector cambia a mes y vuelve a consultar', async () => {
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();
    await screen.findByText('Usuarios nuevos');

    fireEvent.click(screen.getByRole('radio', { name: 'Mes' }));

    await waitFor(() => expect(getAdminMetricas).toHaveBeenCalledWith('mes'));
  });

  it('sin datos en la ventana muestra el estado vacío, nunca gráficas en cero', async () => {
    vi.mocked(getAdminMetricas).mockResolvedValue({
      periodo: 'semana',
      serie: [punto('2026-09-28'), punto('2026-10-05')],
    });
    renderSection();

    expect(await screen.findByText('Aún no hay actividad para mostrar tendencias.')).toBeInTheDocument();
    expect(screen.queryByText('Usuarios nuevos')).not.toBeInTheDocument();
  });

  it('mientras carga muestra el esqueleto', () => {
    vi.mocked(getAdminMetricas).mockReturnValue(new Promise(() => {}));
    renderSection();

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('si la consulta falla muestra el error', async () => {
    vi.mocked(getAdminMetricas).mockRejectedValue(new Error('403'));
    renderSection();

    expect(await screen.findByText('No se pudieron cargar las tendencias de uso.')).toBeInTheDocument();
  });
});

describe('helpers de AdminMetricsSection', () => {
  it('formatearInicio no corre la fecha calendario por zona horaria', () => {
    expect(formatearInicio('2026-08-17', 'semana')).toBe('17 ago');
    expect(formatearInicio('2026-08-01', 'mes')).toBe('ago 2026');
  });

  it('sinDatos solo es verdadero si las cinco series están en cero', () => {
    expect(sinDatos({ periodo: 'mes', serie: [punto('2026-10-01')] })).toBe(true);
    expect(sinDatos({ periodo: 'mes', serie: [punto('2026-10-01', { horasConfirmadas: 1 })] })).toBe(false);
  });
});
