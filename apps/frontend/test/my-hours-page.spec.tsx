import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MisHorasProyecto, MisHorasTarea, MisHorasView } from '../lib/services/users';

vi.mock('../hooks/use-my-hours', () => ({ useMisHoras: vi.fn() }));

import MisHorasPage from '../app/dashboard/mis-horas/page';
import { useMisHoras } from '../hooks/use-my-hours';
import { MENSAJE_ERROR_GENERICO } from '../components/projects/api-error';

// HU-158 (T-232): estados de «Mis Horas». Las cifras de los mocks NO cuadran
// a propósito entre niveles: si la página sumara algo en el cliente, las
// aserciones sobre los strings del API fallarían.

type Estado = Partial<ReturnType<typeof useMisHoras>>;

function mockEstado(estado: Estado) {
  vi.mocked(useMisHoras).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...estado,
  } as unknown as ReturnType<typeof useMisHoras>);
}

function tarea(overrides: Partial<MisHorasTarea> = {}): MisHorasTarea {
  return {
    idTarea: 101,
    tituloTarea: 'Diseñar sesiones',
    estadoTarea: 'HECHO',
    eliminada: false,
    sprint: { idSprint: 11, numero: 1, estado: 'CERRADO' },
    registradas: '3.00',
    legacy: '0.00',
    ...overrides,
  };
}

function proyecto(overrides: Partial<MisHorasProyecto> = {}): MisHorasProyecto {
  return {
    idProyecto: 1,
    tituloProyecto: 'Tutorías',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'EN_PROGRESO',
    abierto: true,
    eliminado: false,
    esLider: false,
    participacionActiva: true,
    registradas: '3.00',
    legacy: '0.00',
    propuestasPendientes: '0.00',
    acreditadas: '0.00',
    tareasDistintas: 1,
    tareas: [tarea()],
    ...overrides,
  };
}

const cero = { registradasEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' };

function vista(overrides: Partial<MisHorasView> = {}): MisHorasView {
  return {
    idUsuario: 18,
    requisitos: { horasBecaRequeridas: 150, horasExtensionRequeridas: 40 },
    totales: {
      registradasEnProyectosAbiertos: '75.00',
      legacyEnProyectosAbiertos: '0.00',
      propuestasPendientes: '4.50',
      acreditadas: '22.25',
    },
    porTipo: [
      { tipoProyecto: 'ACADEMICO_HORAS_BECA', ...cero, acreditadas: '22.25' },
      { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', ...cero },
      { tipoProyecto: 'ACADEMICO_EXPERIENCIA', ...cero },
    ],
    proyectos: [proyecto()],
    ...overrides,
  };
}

const kpi = (nombre: string) => screen.getByRole('group', { name: nombre });

describe('MisHorasPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('cargando: muestra el encabezado real y un esqueleto ocupado, sin cifras', () => {
    mockEstado({ isLoading: true });
    render(<MisHorasPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mis Horas' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cargando tus horas')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('error: estado de peligro con el mensaje traducido y «Reintentar» vuelve a pedir las horas', () => {
    const refetch = vi.fn();
    mockEstado({ isError: true, error: Object.assign(new Error('Internal server error'), { statusCode: 500 }), refetch });
    render(<MisHorasPage />);

    const alerta = screen.getByRole('alert');
    expect(within(alerta).getByText('No pudimos cargar tus horas')).toBeInTheDocument();
    // Un 5xx nunca muestra el texto técnico del servidor.
    expect(within(alerta).getByText(MENSAJE_ERROR_GENERICO)).toBeInTheDocument();
    expect(within(alerta).queryByText('Internal server error')).not.toBeInTheDocument();

    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('error de permisos: el mensaje depende del estado HTTP, no del texto del backend', () => {
    mockEstado({ isError: true, error: Object.assign(new Error('Forbidden resource'), { statusCode: 403 }) });
    render(<MisHorasPage />);

    expect(within(screen.getByRole('alert')).getByText(/No tienes permisos para realizar esta acción/)).toBeInTheDocument();
  });

  it('mientras reintenta, el botón queda deshabilitado', () => {
    mockEstado({ isError: true, error: new Error('x'), isFetching: true });
    render(<MisHorasPage />);

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled();
  });

  it('vacío total: KPIs en 0 h, progreso visible y un vacío con enlaces a Mis Tareas y Explorar Proyectos', () => {
    mockEstado({
      data: vista({
        totales: { registradasEnProyectosAbiertos: '0.00', legacyEnProyectosAbiertos: '0.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
        porTipo: [
          { tipoProyecto: 'ACADEMICO_HORAS_BECA', ...cero },
          { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', ...cero },
          { tipoProyecto: 'ACADEMICO_EXPERIENCIA', ...cero },
        ],
        proyectos: [],
      }),
    });
    render(<MisHorasPage />);

    for (const nombre of ['Registradas en proyectos abiertos', 'Propuestas para acreditación', 'Acreditadas']) {
      expect(within(kpi(nombre)).getByText('0 h')).toBeInTheDocument();
    }
    expect(screen.getByRole('region', { name: 'Progreso de acreditación' })).toBeInTheDocument();
    expect(screen.getByText('Aún no tienes horas registradas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Mis Tareas' })).toHaveAttribute('href', '/dashboard/mis-tareas');
    expect(screen.getByRole('link', { name: 'Explorar Proyectos' })).toHaveAttribute('href', '/dashboard/proyectos');
    expect(screen.queryByRole('region', { name: 'Proyectos abiertos' })).not.toBeInTheDocument();
  });

  it('las cifras de los KPIs son los strings del API formateados, no sumas de los proyectos', () => {
    // Los proyectos suman 3 h registradas; el API dice 75.00: manda el API.
    mockEstado({ data: vista() });
    render(<MisHorasPage />);

    expect(within(kpi('Registradas en proyectos abiertos')).getByText('75 h')).toBeInTheDocument();
    expect(within(kpi('Propuestas para acreditación')).getByText('4.5 h')).toBeInTheDocument();
    expect(within(kpi('Acreditadas')).getByText('22.25 h')).toBeInTheDocument();
    expect(kpi('Acreditadas')).toHaveAttribute('data-destacado', 'true');
    expect(within(kpi('Propuestas para acreditación')).getByText('Pendientes de aprobación al cierre del proyecto')).toBeInTheDocument();
    // Y el progreso usa las acreditadas por tipo del API: 22.25 / 150 → 14 %.
    expect(screen.getByRole('progressbar', { name: 'Progreso de horas beca' })).toHaveAttribute('aria-valuenow', '14');
  });

  it('legacy: nota aparte bajo las registradas, nunca sumada al KPI, y columna propia en la tabla', () => {
    mockEstado({
      data: vista({
        totales: { registradasEnProyectosAbiertos: '5.50', legacyEnProyectosAbiertos: '2.00', propuestasPendientes: '0.00', acreditadas: '0.00' },
        proyectos: [proyecto({ registradas: '5.50', legacy: '2.00', tareas: [tarea({ tituloTarea: 'Agenda', registradas: '0.00', legacy: '2.00' })] })],
      }),
    });
    render(<MisHorasPage />);

    const registradas = kpi('Registradas en proyectos abiertos');
    expect(within(registradas).getByText('5.5 h')).toBeInTheDocument();
    expect(within(registradas).getByText('+ 2 h históricas (legacy), mostradas aparte')).toBeInTheDocument();
    expect(registradas).not.toHaveTextContent('7.5 h');

    fireEvent.click(screen.getByRole('button', { name: /Tutorías/ }));
    const fila = within(screen.getByRole('table')).getByText('Agenda').closest('tr')!;
    expect(within(fila).getAllByRole('cell').map((td) => td.textContent).slice(-2)).toEqual(['0 h', '2 h']);
  });

  it('sin legacy no muestra la nota', () => {
    mockEstado({ data: vista() });
    render(<MisHorasPage />);

    expect(screen.queryByText(/históricas \(legacy\)/)).not.toBeInTheDocument();
  });

  it('solo cerrados: «Proyectos abiertos» vacío y los cerrados con su histórico', () => {
    mockEstado({
      data: vista({
        proyectos: [proyecto({ idProyecto: 30, tituloProyecto: 'Archivo', abierto: false, estadoProyecto: 'CERRADO', acreditadas: '6.00', tareas: [] })],
      }),
    });
    render(<MisHorasPage />);

    expect(within(screen.getByRole('region', { name: 'Proyectos abiertos' })).getByText('No tienes proyectos abiertos')).toBeInTheDocument();
    const cerrados = screen.getByRole('region', { name: 'Proyectos cerrados' });
    expect(within(cerrados).getByRole('link', { name: 'Ver histórico de Archivo' })).toHaveAttribute('href', '/dashboard/proyectos/30');
    expect(screen.queryByText('Aún no tienes horas registradas')).not.toBeInTheDocument();
  });

  it('retirado: el proyecto abierto muestra «Participación finalizada» y sus tareas no enlazan', () => {
    mockEstado({ data: vista({ proyectos: [proyecto({ participacionActiva: false })] }) });
    render(<MisHorasPage />);

    expect(screen.getByText('Participación finalizada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tutorías/ }));
    expect(within(screen.getByRole('table')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('líder: pill «Líder» y tareas con enlace al tablero', () => {
    mockEstado({ data: vista({ proyectos: [proyecto({ idProyecto: 6, esLider: true, participacionActiva: false, tareas: [tarea({ idTarea: 601 })] })] }) });
    render(<MisHorasPage />);

    expect(screen.getByText('Líder')).toHaveClass('pill-accent');
    fireEvent.click(screen.getByRole('button', { name: /Tutorías/ }));
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Diseñar sesiones' })).toHaveAttribute(
      'href',
      '/dashboard/projects/6/kanban/tasks/601',
    );
  });

  it('tarea eliminada: se ve con su pill y sus horas, sin enlace', () => {
    mockEstado({ data: vista({ proyectos: [proyecto({ tareas: [tarea({ tituloTarea: 'Borrador', eliminada: true, registradas: '1.00' })] })] }) });
    render(<MisHorasPage />);

    fireEvent.click(screen.getByRole('button', { name: /Tutorías/ }));
    const fila = within(screen.getByRole('table')).getByText('Borrador').closest('tr')!;
    expect(within(fila).getByText('Eliminada')).toBeInTheDocument();
    expect(within(fila).getByText('1 h')).toBeInTheDocument();
    expect(within(fila).queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin meta: «Sin meta configurada» con enlace al perfil', () => {
    mockEstado({ data: vista({ requisitos: { horasBecaRequeridas: null, horasExtensionRequeridas: null } }) });
    render(<MisHorasPage />);

    const progreso = screen.getByRole('region', { name: 'Progreso de acreditación' });
    expect(within(progreso).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(progreso).getAllByRole('link', { name: 'Configúrala en tu perfil' })[0]).toHaveAttribute('href', '/dashboard/perfil');
  });

  it('meta cumplida: barra al 100 % y pill «Meta cumplida»', () => {
    mockEstado({
      data: vista({
        requisitos: { horasBecaRequeridas: 20, horasExtensionRequeridas: 40 },
        porTipo: [
          { tipoProyecto: 'ACADEMICO_HORAS_BECA', ...cero, acreditadas: '22.25' },
          { tipoProyecto: 'EXTRACURRICULAR_EXTENSION', ...cero },
          { tipoProyecto: 'ACADEMICO_EXPERIENCIA', ...cero },
        ],
      }),
    });
    render(<MisHorasPage />);

    expect(screen.getByRole('progressbar', { name: 'Progreso de horas beca' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Meta cumplida')).toHaveClass('pill-success');
  });
});

// HU-158 (G02-X01): con la sidebar global abierta, a 768 px el contenido mide
// ~500 px; los KPI deciden sus columnas por ese ancho, no por la ventana.
describe('MisHorasPage — disposición por contenedor', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('la página es un contenedor y los KPI pasan a tres columnas solo desde su propio ancho', () => {
    mockEstado({ data: vista() });
    render(<MisHorasPage />);

    const encabezado = screen.getByRole('heading', { level: 1, name: 'Mis Horas' });
    const pagina = encabezado.closest('[class*="@container/mis-horas"]') as HTMLElement;
    expect(pagina).not.toBeNull();

    const kpis = screen.getByRole('region', { name: 'Resumen de horas' });
    expect(pagina).toContainElement(kpis);
    expect(kpis).toHaveClass('grid', '@2xl/mis-horas:grid-cols-3');
    expect(kpis.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols-/);
  });

  it('el esqueleto de carga usa la misma regla de columnas que los KPI', () => {
    mockEstado({ isLoading: true });
    render(<MisHorasPage />);

    const esqueleto = screen.getByLabelText('Cargando tus horas');
    expect(esqueleto.firstElementChild).toHaveClass('@2xl/mis-horas:grid-cols-3');
    expect(esqueleto.closest('[class*="@container/mis-horas"]')).not.toBeNull();
  });

  it('Tailwind genera las variantes: tres KPI y cabecera de proyecto en fila desde 42rem de su contenedor', async () => {
    const postcss = (await import('postcss')).default;
    const tailwind = (await import('@tailwindcss/postcss')).default;
    const base = join(__dirname, '..');
    const entrada = readFileSync(join(base, 'app/global.css'), 'utf-8');
    const { css } = await postcss([tailwind({ base })]).process(entrada, { from: join(base, 'app/global.css') });

    expect(css).toContain('container-name: mis-horas');
    expect(css).toContain('container-name: proyecto');
    const regla = (selector: string) => css.slice(css.indexOf(selector)).slice(0, 200);
    expect(regla('.\\@2xl\\/mis-horas\\:grid-cols-3')).toMatch(/@container mis-horas \(width >= 42rem\)/);
    expect(regla('.\\@2xl\\/proyecto\\:flex-row')).toMatch(/@container proyecto \(width >= 42rem\)/);
    expect(regla('.\\@2xl\\/proyecto\\:w-80')).toMatch(/@container proyecto \(width >= 42rem\)/);
  }, 60_000);
});

// Mis Horas: encabezado solo con título y subtítulo, y KPI con el icono
// neutro al par de su etiqueta (sin caja de color).
describe('MisHorasPage — iconos y colores neutros', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('el encabezado no lleva icono: solo el título y el subtítulo', () => {
    mockEstado({ data: vista() });
    render(<MisHorasPage />);

    const encabezado = screen.getByRole('heading', { level: 1, name: 'Mis Horas' }).closest('header')!;
    expect(encabezado.querySelector('svg')).toBeNull();
    expect(within(encabezado).getByText('Tus horas registradas, propuestas y acreditadas en todos tus proyectos.')).toBeInTheDocument();
  });

  it('los tres KPI usan la variante en línea: icono negro junto a la etiqueta y sin fondo', () => {
    mockEstado({ data: vista() });
    render(<MisHorasPage />);

    for (const nombre of ['Registradas en proyectos abiertos', 'Propuestas para acreditación', 'Acreditadas']) {
      const grupo = kpi(nombre);
      const icono = grupo.querySelector('svg')!;
      expect(within(grupo).getByText(nombre)).toContainElement(icono as unknown as HTMLElement);
      expect(icono).toHaveClass('text-text-primary');
      expect(grupo.innerHTML, nombre).not.toMatch(/bg-primary/);
    }
  });
});
