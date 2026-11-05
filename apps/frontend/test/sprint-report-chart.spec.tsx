import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// recharts no se dibuja en jsdom: el plot cargado de forma diferida se sustituye.
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="plot" /> }));

import {
  SERIES,
  SprintReportChart,
  estimadasContraReales,
  horasPorIntegrante,
  tareasPorEstadoEnElTiempo,
  tiempoPorColumna,
} from '../components/projects/sprint-report-chart';
import type { SprintBurndownDto, SprintDetailDto } from '../lib/types/sprints';

afterEach(cleanup);

const usuario = (idUsuario: number, nombre: string) => ({ idUsuario, nombre, apellido: 'Pérez', fotoUrl: null });
const asig = (idUsuario: number, nombre: string, horasReales: number | null) => ({
  idAsignacion: idUsuario * 10,
  usuario: usuario(idUsuario, nombre),
  fechaAsignacion: '2026-10-01T00:00:00Z',
  desasignadaEn: null,
  horasReales,
});
const tarea = (idTarea: number, titulo: string, estimado: number | null, asignaciones: ReturnType<typeof asig>[]) =>
  ({ idTarea, tituloTarea: titulo, tiempoEstimadoHoras: estimado, asignaciones }) as never;

const detalle = {
  tareas: [
    tarea(1, 'Diseñar API', 10, [asig(1, 'Ana', 4), asig(2, 'Luis', 3.5)]),
    tarea(2, 'Pruebas', 5, [asig(1, 'Ana', 2)]),
    tarea(3, 'Sin estimar', null, [asig(2, 'Luis', null)]),
  ],
} as unknown as SprintDetailDto;

describe('series de los informes del Sprint', () => {
  it('suma las horas reales por integrante, de mayor a menor', () => {
    expect(horasPorIntegrante(detalle)).toEqual([
      { integrante: 'Ana Pérez', horas: 6 },
      { integrante: 'Luis Pérez', horas: 3.5 },
    ]);
  });

  it('compara estimadas y reales solo de tareas con estimación', () => {
    expect(estimadasContraReales(detalle)).toEqual([
      { tarea: 'Diseñar API', estimadas: 10, reales: 7.5 },
      { tarea: 'Pruebas', estimadas: 5, reales: 2 },
    ]);
  });

  it('toma pendientes y completadas por día de las instantáneas', () => {
    const burndown = {
      instantaneas: [
        { fecha: '2026-10-01T00:00:00.000Z', tareasPendientes: 5, tareasCompletadas: 0, puntosHistoriaRestantes: 0 },
        { fecha: '2026-10-02T00:00:00.000Z', tareasPendientes: 3, tareasCompletadas: 2, puntosHistoriaRestantes: 0 },
      ],
    } as SprintBurndownDto;
    expect(tareasPorEstadoEnElTiempo(burndown)).toEqual([
      { fecha: expect.stringMatching(/1/), pendientes: 5, completadas: 0 },
      { fecha: expect.stringMatching(/2/), pendientes: 3, completadas: 2 },
    ]);
  });

  it('nombra las columnas del tablero y omite HECHO', () => {
    expect(
      tiempoPorColumna({
        idSprint: 1,
        columnas: [
          { estado: 'POR_HACER', promedioHoras: 12, tareas: 3 },
          { estado: 'EN_REVISION', promedioHoras: 2, tareas: 1 },
          { estado: 'HECHO', promedioHoras: 0, tareas: 0 },
        ],
      }),
    ).toEqual([
      { columna: 'Por hacer', horas: 12 },
      { columna: 'En revisión', horas: 2 },
    ]);
  });
});

describe('SprintReportChart', () => {
  it('con datos dibuja la gráfica y ofrece una tabla equivalente para lectores de pantalla', () => {
    render(
      <SprintReportChart
        titulo="Horas por integrante"
        datos={[{ integrante: 'Ana Pérez', horas: 6 }]}
        ejeX="integrante"
        series={SERIES.horas}
        vacio="Sin horas"
      />,
    );
    expect(screen.getByTestId('plot')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gráfica: Horas por integrante' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Horas por integrante' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '6' })).toBeInTheDocument();
  });

  it('sin datos muestra el estado vacío y no dibuja nada', () => {
    render(
      <SprintReportChart
        titulo="Horas por integrante"
        datos={[]}
        ejeX="integrante"
        series={SERIES.horas}
        vacio="Aún no hay horas reportadas en este Sprint."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Aún no hay horas reportadas en este Sprint.');
    expect(screen.queryByTestId('plot')).not.toBeInTheDocument();
  });

  it('datos en cero también cuentan como vacío', () => {
    render(
      <SprintReportChart
        titulo="Tiempo"
        datos={[{ columna: 'Por hacer', horas: 0 }]}
        ejeX="columna"
        series={SERIES.columnas}
        vacio="Sin movimientos"
      />,
    );
    expect(screen.queryByTestId('plot')).not.toBeInTheDocument();
  });
});
