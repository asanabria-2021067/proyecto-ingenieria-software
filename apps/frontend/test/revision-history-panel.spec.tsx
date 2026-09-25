import { RevisionHistoryPanel } from '@/components/admin/RevisionHistoryPanel';
import type { RevisionProyectoDTO } from '@/lib/dto/project.dto';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// T-204 (lote 2): RevisionHistoryPanel es puramente presentacional (sin
// hooks ni servicios), así que no necesita mocks — solo variar sus props.

function baseRevision(overrides: Partial<RevisionProyectoDTO> = {}): RevisionProyectoDTO {
  return {
    idRevisionProyecto: 1,
    estadoRevision: 'OBSERVADA',
    comentarioRevision: 'Información general:\nFalta detallar el cronograma.\n\nRoles y habilidades:\nAgrega el nivel mínimo requerido.',
    snapshotProyecto: {
      tituloProyecto: 'App Movil UVG',
      descripcionProyecto: 'Registro de asistencia por QR.',
      objetivosProyecto: 'Reducir el tiempo de registro manual.',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      modalidadProyecto: 'VIRTUAL',
      ubicacionProyecto: null,
      contextoAcademico: 'Curso de ISW',
      urlRecursoExterno: null,
      fechaInicio: '2026-06-01T00:00:00.000Z',
      fechaFinEstimada: '2026-08-01T00:00:00.000Z',
      roles: [
        {
          idRolProyecto: 1,
          nombreRol: 'Desarrollo backend',
          descripcionRolProyecto: null,
          cupos: 2,
          horasSemanalesEstimadas: 10,
          carreraRequerida: null,
          requisitos: [
            {
              idRequisitoHabilidad: 1,
              nivelMinimo: 'INTERMEDIO',
              obligatorio: true,
              habilidad: { idHabilidad: 1, nombreHabilidad: 'Node.js', categoriaHabilidad: 'Backend' },
            },
          ],
        },
      ],
    },
    numeroEnvio: 1,
    enviadaEn: '2026-06-01T00:00:00.000Z',
    revisadaEn: '2026-06-05T00:00:00.000Z',
    revisor: { idUsuario: 9, nombre: 'Coordinadora', apellido: 'Admin' },
    ...overrides,
  };
}

describe('RevisionHistoryPanel (T-204)', () => {
  it('con snapshot completo, muestra información general, roles/habilidades y los comentarios del revisor separados por sección', () => {
    render(<RevisionHistoryPanel revision={baseRevision()} projectTitle="Fallback" onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('App Movil UVG');
    expect(screen.getByText('Registro de asistencia por QR.')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Intermedio')).toBeInTheDocument();
    expect(screen.getByText('Falta detallar el cronograma.')).toBeInTheDocument();
    expect(screen.getByText('Agrega el nivel mínimo requerido.')).toBeInTheDocument();
  });

  it('sin snapshotProyecto (revisión previa al historial), muestra el aviso de datos no disponibles', () => {
    render(
      <RevisionHistoryPanel
        revision={baseRevision({ snapshotProyecto: null })}
        projectTitle="App Movil UVG"
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Los datos del formulario de esta revisión no están disponibles/i),
    ).toBeInTheDocument();
    // Sin snapshot, el título cae al de la prop projectTitle.
    expect(screen.getByText('App Movil UVG')).toBeInTheDocument();
    // Los comentarios del revisor se siguen mostrando aunque no haya snapshot.
    expect(screen.getByText('Falta detallar el cronograma.')).toBeInTheDocument();
  });

  it('sin snapshot ni comentarios del revisor, muestra el mensaje de que la revisión no tiene comentarios', () => {
    render(
      <RevisionHistoryPanel
        revision={baseRevision({ snapshotProyecto: null, comentarioRevision: null })}
        projectTitle="App Movil UVG"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Esta revisión no tiene comentarios del revisor.')).toBeInTheDocument();
  });

  it('un comentario en formato antiguo (sin encabezados de sección) se trata íntegro como comentario general', () => {
    render(
      <RevisionHistoryPanel
        revision={baseRevision({ snapshotProyecto: null, comentarioRevision: 'Revisa el alcance del proyecto.' })}
        projectTitle="App Movil UVG"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Revisa el alcance del proyecto.')).toBeInTheDocument();
    expect(screen.queryByText('Esta revisión no tiene comentarios del revisor.')).not.toBeInTheDocument();
  });

  it('clic en Volver llama a onClose', () => {
    const onClose = vi.fn();
    render(<RevisionHistoryPanel revision={baseRevision()} projectTitle="Fallback" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Volver/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
