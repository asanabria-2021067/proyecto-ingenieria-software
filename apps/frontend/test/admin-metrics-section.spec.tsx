import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/services/admin', () => ({ getAdminMetricas: vi.fn() }));
// El periodo vive en la URL: `url.search` hace de barra de direcciones.
const url = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin/metricas',
  useSearchParams: () => new URLSearchParams(url.search),
  useRouter: () => ({ replace: url.replace, push: vi.fn() }),
}));

import { AdminMetricsSection, formatearInicio, periodoDeLaUrl, sinDatos } from '../components/admin/AdminMetricsSection';
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
  url.search = '';
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
    // Valor del periodo en curso (marcado como tal) + total de la ventana.
    expect(screen.getByText('esta semana, en curso · 5 en las últimas 8 semanas')).toBeInTheDocument();
    expect(screen.getByText('esta semana, en curso · 10 h en las últimas 8 semanas')).toBeInTheDocument();
  });

  it('el selector escribe el periodo en la URL, sin desplazar la página y conservando otros parámetros', async () => {
    url.search = 'vista=a';
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();
    await screen.findByText('Usuarios nuevos');

    fireEvent.click(screen.getByRole('radio', { name: 'Mes' }));

    expect(url.replace).toHaveBeenCalledWith('/dashboard/admin/metricas?vista=a&periodo=mes', { scroll: false });
  });

  it('con `?periodo=mes` en la URL consulta el mes, marca «Mes» y rotula con los textos del mes', async () => {
    url.search = 'periodo=mes';
    vi.mocked(getAdminMetricas).mockResolvedValue({ ...conDatos, periodo: 'mes' });
    renderSection();

    expect(await screen.findByText('este mes, en curso · 5 en los últimos 6 meses')).toBeInTheDocument();
    expect(getAdminMetricas).toHaveBeenCalledTimes(1);
    expect(getAdminMetricas).toHaveBeenCalledWith('mes');
    expect(screen.getByRole('radio', { name: 'Mes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Cada punto es un mes calendario.*los últimos 6, incluido el actual/)).toBeInTheDocument();
  });

  it('un periodo desconocido en la URL cae en semana: nunca se consulta un valor inválido', async () => {
    url.search = 'periodo=anio';
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();
    await screen.findByText('Usuarios nuevos');

    expect(getAdminMetricas).toHaveBeenCalledTimes(1);
    expect(getAdminMetricas).toHaveBeenCalledWith('semana');
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveAttribute('aria-checked', 'true');
  });

  it('el selector Semana/Mes es holgado, marca la opción elegida en verde y realza la otra al pasar el cursor', async () => {
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();
    await screen.findByText('Usuarios nuevos');

    for (const opcion of [screen.getByRole('radio', { name: 'Semana' }), screen.getByRole('radio', { name: 'Mes' })]) {
      expect(opcion).toHaveClass('px-4', 'data-[state=on]:bg-primary', 'data-[state=on]:text-on-primary', 'hover:bg-primary', 'hover:text-on-primary');
      // El relleno estrecho y los grises de la primitiva ya no aplican.
      expect(opcion).not.toHaveClass('px-1.5');
      expect(opcion).not.toHaveClass('data-[state=on]:bg-muted');
      expect(opcion).not.toHaveClass('hover:bg-muted');
    }
    expect(screen.getByRole('radio', { name: 'Semana' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'Mes' })).toHaveAttribute('data-state', 'off');
  });

  it('explica la ventana y que el periodo en curso está incompleto', async () => {
    vi.mocked(getAdminMetricas).mockResolvedValue(conDatos);
    renderSection();
    await screen.findByText('Usuarios nuevos');

    expect(
      screen.getByText(/las últimas 8, incluida la actual\. La semana en curso todavía está incompleta/),
    ).toBeInTheDocument();
  });

  it('al cambiar de periodo deja a la vista el anterior, atenuado y con SU rótulo, hasta que llega el nuevo', async () => {
    let entregarMes: (valor: AdminMetricas) => void = () => {};
    vi.mocked(getAdminMetricas).mockImplementation((periodo) =>
      periodo === 'semana' ? Promise.resolve(conDatos) : new Promise((resolve) => (entregarMes = resolve)),
    );
    const { rerender } = renderSection();
    await screen.findByText('esta semana, en curso · 5 en las últimas 8 semanas');

    url.search = 'periodo=mes';
    rerender(createElement(AdminMetricsSection));

    // Se pidió el mes, pero lo que se ve sigue siendo la semana y así se rotula.
    expect(await screen.findByText('Cargando las tendencias por mes…')).toHaveAttribute('role', 'status');
    expect(screen.getByText('esta semana, en curso · 5 en las últimas 8 semanas')).toBeInTheDocument();
    expect(screen.queryByText(/este mes/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cada punto es una semana/)).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toHaveClass('opacity-60');

    entregarMes({ ...conDatos, periodo: 'mes' });

    expect(await screen.findByText('este mes, en curso · 5 en los últimos 6 meses')).toBeInTheDocument();
    expect(screen.queryByText('Cargando las tendencias por mes…')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
  });

  it('el estado vacío nombra la ventana del periodo que se consultó', async () => {
    url.search = 'periodo=mes';
    vi.mocked(getAdminMetricas).mockResolvedValue({ periodo: 'mes', serie: [punto('2026-10-01')] });
    renderSection();

    expect(
      await screen.findByText('No se registraron usuarios, proyectos, tareas ni horas en los últimos 6 meses.'),
    ).toBeInTheDocument();
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

  it('el error se anuncia como alerta y «Reintentar» vuelve a consultar en el sitio del fallo', async () => {
    vi.mocked(getAdminMetricas).mockRejectedValueOnce(new Error('500')).mockResolvedValue(conDatos);
    renderSection();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudieron cargar las tendencias de uso.');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Usuarios nuevos')).toBeInTheDocument();
    expect(getAdminMetricas).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('helpers de AdminMetricsSection', () => {
  it('formatearInicio no corre la fecha calendario por zona horaria', () => {
    expect(formatearInicio('2026-08-17', 'semana')).toBe('17 ago');
    expect(formatearInicio('2026-08-01', 'mes')).toBe('ago 2026');
  });

  it('periodoDeLaUrl solo acepta `mes`; todo lo demás, incluido nada, es `semana`', () => {
    expect(periodoDeLaUrl('mes')).toBe('mes');
    for (const valor of ['semana', 'MES', 'anio', '', null, undefined]) expect(periodoDeLaUrl(valor)).toBe('semana');
  });

  it('sinDatos solo es verdadero si las cinco series están en cero', () => {
    expect(sinDatos({ periodo: 'mes', serie: [punto('2026-10-01')] })).toBe(true);
    expect(sinDatos({ periodo: 'mes', serie: [punto('2026-10-01', { horasConfirmadas: 1 })] })).toBe(false);
  });
});
