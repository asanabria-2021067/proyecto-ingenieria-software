import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MyHoursProjectList } from '../components/hours/my-hours-project-list';
import type { MisHorasProyecto, MisHorasTarea } from '../lib/services/users';

// HU-158 (T-232): la lista pinta el desglose del backend tal cual: sin
// reordenar, sin sumar y con el legacy siempre en su propia columna.

function tarea(overrides: Partial<MisHorasTarea> = {}): MisHorasTarea {
  return {
    idTarea: 101,
    tituloTarea: 'Diseñar sesiones',
    estadoTarea: 'HECHO',
    eliminada: false,
    sprint: { idSprint: 11, numero: 2, estado: 'ACTIVO' },
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

const seccion = (nombre: string) => screen.getByRole('region', { name: nombre });
/** Abre el acordeón de un proyecto y devuelve su tabla de tareas. */
function abrir(titulo: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(titulo) }));
  return screen.getByRole('table', { name: `Horas por tarea en ${titulo}` });
}

describe('MyHoursProjectList', () => {
  afterEach(() => cleanup());

  it('respeta el orden recibido y separa abiertos de cerrados', () => {
    render(
      <MyHoursProjectList
        proyectos={[
          proyecto({ idProyecto: 3, tituloProyecto: 'Zoología' }),
          proyecto({ idProyecto: 1, tituloProyecto: 'Astronomía' }),
          proyecto({ idProyecto: 9, tituloProyecto: 'Archivo', abierto: false, estadoProyecto: 'CERRADO', tareas: [] }),
        ]}
      />,
    );

    const abiertos = within(seccion('Proyectos abiertos')).getAllByRole('button').map((b) => b.textContent);
    expect(abiertos[0]).toContain('Zoología');
    expect(abiertos[1]).toContain('Astronomía');
    expect(within(seccion('Proyectos cerrados')).getByRole('heading', { name: 'Archivo' })).toBeInTheDocument();
    expect(within(seccion('Proyectos abiertos')).queryByText('Archivo')).not.toBeInTheDocument();
  });

  it('cada proyecto abierto muestra tipo, estado y sus tres cifras del backend, sin sumar el legacy', () => {
    render(
      <MyHoursProjectList
        proyectos={[
          proyecto({ registradas: '5.50', legacy: '2.00', propuestasPendientes: '4.00', acreditadas: '0.00' }),
        ]}
      />,
    );

    const cabecera = screen.getByRole('button', { name: /Tutorías/ });
    expect(within(cabecera).getByText('Horas Beca')).toHaveClass('pill');
    expect(within(cabecera).getByText('En progreso')).toHaveClass('pill');
    // 5.5 h registradas, NO 7.5 h: el legacy va aparte.
    expect(cabecera).toHaveTextContent('Registradas5.5 h');
    expect(cabecera).toHaveTextContent('Propuestas4 h');
    expect(cabecera).toHaveTextContent('Acreditadas0 h');
    expect(cabecera).not.toHaveTextContent('7.5 h');
  });

  it('el acordeón permite abrir varios proyectos a la vez', () => {
    render(
      <MyHoursProjectList
        proyectos={[proyecto({ idProyecto: 1, tituloProyecto: 'Tutorías' }), proyecto({ idProyecto: 2, tituloProyecto: 'Huerto' })]}
      />,
    );

    abrir('Tutorías');
    abrir('Huerto');

    expect(screen.getByRole('button', { name: /Tutorías/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Huerto/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('participante activo: sus tareas enlazan al detalle de la tarea en el tablero', () => {
    render(<MyHoursProjectList proyectos={[proyecto({ idProyecto: 7, tareas: [tarea({ idTarea: 55 })] })]} />);

    const tabla = abrir('Tutorías');
    expect(within(tabla).getByRole('link', { name: 'Diseñar sesiones' })).toHaveAttribute(
      'href',
      '/dashboard/projects/7/kanban/tasks/55',
    );
    expect(screen.queryByText('Participación finalizada')).not.toBeInTheDocument();
    expect(screen.queryByText('Líder')).not.toBeInTheDocument();
  });

  it('retirado: pill «Participación finalizada» y tareas sin enlace', () => {
    render(<MyHoursProjectList proyectos={[proyecto({ participacionActiva: false })]} />);

    expect(within(screen.getByRole('button', { name: /Tutorías/ })).getByText('Participación finalizada')).toHaveClass(
      'pill',
      'pill-neutral',
    );
    const tabla = abrir('Tutorías');
    expect(within(tabla).getByText('Diseñar sesiones')).toBeInTheDocument();
    expect(within(tabla).queryByRole('link')).not.toBeInTheDocument();
  });

  it('líder sin participación: pill «Líder» y sus tareas sí enlazan', () => {
    render(<MyHoursProjectList proyectos={[proyecto({ esLider: true, participacionActiva: false })]} />);

    const cabecera = screen.getByRole('button', { name: /Tutorías/ });
    expect(within(cabecera).getByText('Líder')).toHaveClass('pill', 'pill-accent');
    expect(within(cabecera).queryByText('Participación finalizada')).not.toBeInTheDocument();
    expect(within(abrir('Tutorías')).getByRole('link', { name: 'Diseñar sesiones' })).toBeInTheDocument();
  });

  it('tarea eliminada: sin enlace, atenuada y con pill «Eliminada»; sus horas siguen visibles', () => {
    render(
      <MyHoursProjectList
        proyectos={[proyecto({ tareas: [tarea({ tituloTarea: 'Borrador', eliminada: true, registradas: '1.00' })] })]}
      />,
    );

    const tabla = abrir('Tutorías');
    const fila = within(tabla).getByText('Borrador').closest('tr')!;
    expect(within(fila).queryByRole('link')).not.toBeInTheDocument();
    expect(within(fila).getByText('Borrador')).toHaveClass('text-text-disabled');
    expect(within(fila).getByText('Eliminada')).toHaveClass('pill', 'pill-neutral');
    expect(within(fila).getByText('1 h')).toBeInTheDocument();
  });

  it('tabla de tareas: Sprint o «Sin sprint», estado con las pills del repo y legacy en su propia columna', () => {
    render(
      <MyHoursProjectList
        proyectos={[
          proyecto({
            tareas: [
              tarea({ idTarea: 1, tituloTarea: 'Agenda', estadoTarea: 'EN_PROGRESO', registradas: '0.00', legacy: '2.00' }),
              tarea({ idTarea: 2, tituloTarea: 'Riego', estadoTarea: 'HECHO', sprint: null, registradas: '1.25' }),
            ],
          }),
        ]}
      />,
    );

    const tabla = abrir('Tutorías');
    expect(within(tabla).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Tarea',
      'Sprint',
      'Estado',
      'Registradas',
      'Legacy',
    ]);
    const [, agenda, riego] = within(tabla).getAllByRole('row');
    expect(within(agenda).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      'Agenda',
      'Sprint 2',
      'En progreso',
      '0 h',
      '2 h',
    ]);
    expect(within(agenda).getByText('En progreso')).toHaveClass('pill', 'pill-warning');
    expect(within(riego).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      'Riego',
      'Sin sprint',
      'Hecho',
      '1.25 h',
      '0 h',
    ]);
    expect(within(riego).getByText('Hecho')).toHaveClass('pill', 'pill-success');
  });

  it('en móvil oculta Sprint, Estado y Legacy de la tabla, que conserva su scroll horizontal', () => {
    render(<MyHoursProjectList proyectos={[proyecto()]} />);

    const tabla = abrir('Tutorías');
    const [tareaTh, sprint, estado, registradas, legacy] = within(tabla).getAllByRole('columnheader');
    for (const oculta of [sprint, estado, legacy]) expect(oculta).toHaveClass('hidden', 'sm:table-cell');
    for (const visible of [tareaTh, registradas]) expect(visible).not.toHaveClass('hidden');
    expect(tabla.parentElement).toHaveClass('overflow-x-auto');
  });

  it('proyecto abierto sin horas: su contenido lo indica en lugar de una tabla vacía', () => {
    render(<MyHoursProjectList proyectos={[proyecto({ registradas: '0.00', tareasDistintas: 0, tareas: [] })]} />);

    fireEvent.click(screen.getByRole('button', { name: /Tutorías/ }));

    expect(screen.getByText('Aún no registras horas en este proyecto.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cerrado: acreditadas, propuestas solo si hay, y enlace «Ver histórico» al proyecto', () => {
    render(
      <MyHoursProjectList
        proyectos={[
          proyecto({ idProyecto: 30, tituloProyecto: 'Archivo', abierto: false, estadoProyecto: 'CERRADO', acreditadas: '6.00', propuestasPendientes: '1.50', tareas: [] }),
          proyecto({ idProyecto: 31, tituloProyecto: 'Radio', abierto: false, estadoProyecto: 'CERRADO', acreditadas: '2.00', propuestasPendientes: '0.00', tareas: [] }),
        ]}
      />,
    );

    const archivo = screen.getByRole('heading', { name: 'Archivo' }).closest('li')!;
    expect(archivo).toHaveTextContent('Acreditadas 6 h');
    expect(archivo).toHaveTextContent('Propuestas 1.5 h');
    expect(within(archivo).getByText('Cerrado')).toHaveClass('pill');
    expect(within(archivo).getByRole('link', { name: 'Ver histórico de Archivo' })).toHaveAttribute('href', '/dashboard/proyectos/30');

    const radio = screen.getByRole('heading', { name: 'Radio' }).closest('li')!;
    expect(radio).toHaveTextContent('Acreditadas 2 h');
    expect(radio).not.toHaveTextContent('Propuestas');
  });

  it('eliminado: se lista con sus acreditadas, marcado como eliminado y sin «Ver histórico»', () => {
    render(
      <MyHoursProjectList
        proyectos={[
          proyecto({ idProyecto: 40, tituloProyecto: 'Borrado', abierto: false, eliminado: true, estadoProyecto: 'EN_PROGRESO', acreditadas: '1.50', tareas: [] }),
        ]}
      />,
    );

    const borrado = screen.getByRole('heading', { name: 'Borrado' }).closest('li')!;
    expect(borrado).toHaveTextContent('Acreditadas 1.5 h');
    expect(within(borrado).getByText('Eliminado')).toHaveClass('pill', 'pill-neutral');
    expect(within(borrado).queryByRole('link')).not.toBeInTheDocument();
  });

  it('solo cerrados: «Proyectos abiertos» muestra un vacío compacto y los cerrados se ven igual', () => {
    render(
      <MyHoursProjectList
        proyectos={[proyecto({ idProyecto: 9, tituloProyecto: 'Archivo', abierto: false, estadoProyecto: 'CERRADO', tareas: [] })]}
      />,
    );

    expect(within(seccion('Proyectos abiertos')).getByText('No tienes proyectos abiertos')).toBeInTheDocument();
    expect(within(seccion('Proyectos abiertos')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(seccion('Proyectos cerrados')).getByRole('heading', { name: 'Archivo' })).toBeInTheDocument();
  });

  it('sin proyectos cerrados no pinta su sección', () => {
    render(<MyHoursProjectList proyectos={[proyecto()]} />);

    expect(screen.queryByRole('region', { name: 'Proyectos cerrados' })).not.toBeInTheDocument();
  });
});
