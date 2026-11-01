import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvailableProjectCard, type ProyectoDisponibleResumen } from '@/components/projects/available-project-card';

function renderCard(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

const base: ProyectoDisponibleResumen = {
  idProyecto: 3,
  tituloProyecto: 'Brazo robotico',
  descripcionProyecto: 'Descripcion',
  tipoProyecto: 'ACADEMICO_EXPERIENCIA',
  modalidadProyecto: 'MIXTA',
  estadoProyecto: 'PUBLICADO',
  organizaciones: [],
  intereses: [],
  roles: [{ cupos: 2 }],
};

describe('«Publicado por» en la tarjeta', () => {
  afterEach(() => cleanup());

  it('un proyecto de organizacion muestra su nombre', () => {
    renderCard(
      <AvailableProjectCard proyecto={{ ...base, organizaciones: [{ organizacion: { nombreOrganizacion: 'Grupo Robotica' } }] }} />,
    );
    expect(screen.getByText(/Publicado por/)).toHaveTextContent('Publicado por Grupo Robotica');
  });

  it('un proyecto personal no lo muestra', () => {
    renderCard(<AvailableProjectCard proyecto={base} />);
    expect(screen.queryByText(/Publicado por/)).toBeNull();
  });

  it('tambien aparece en Mis proyectos cuando el proyecto es de una organizacion', () => {
    renderCard(
      <AvailableProjectCard
        context="mine"
        proyecto={
          {
            ...base,
            revisiones: [],
            organizaciones: [{ organizacion: { nombreOrganizacion: 'Grupo Robotica' } }],
          } as never
        }
      />,
    );
    expect(screen.getByText(/Publicado por/)).toHaveTextContent('Grupo Robotica');
  });
});

describe('roles disponibles en la tarjeta', () => {
  afterEach(() => cleanup());

  it('cuenta los cupos libres que manda el backend, no los totales', () => {
    // 1 rol con 4 cupos totales y los 4 ocupados por miembros de la organizacion: ya no hay vacantes.
    renderCard(<AvailableProjectCard proyecto={{ ...base, roles: [{ cupos: 4, cuposDisponibles: 0 }] }} />);
    expect(screen.getByText('Sin roles disponibles')).toBeInTheDocument();
  });

  it('un rol con cupos libres cuenta como disponible', () => {
    renderCard(<AvailableProjectCard proyecto={{ ...base, roles: [{ cupos: 6, cuposDisponibles: 2 }] }} />);
    expect(screen.queryByText('Sin roles disponibles')).toBeNull();
  });

  it('sin cuposDisponibles (respuesta antigua) usa los cupos totales', () => {
    renderCard(<AvailableProjectCard proyecto={{ ...base, roles: [{ cupos: 1 }] }} />);
    expect(screen.queryByText('Sin roles disponibles')).toBeNull();
  });
});
