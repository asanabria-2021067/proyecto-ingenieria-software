import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvailableProjectCard, type ProyectoDisponibleResumen } from '@/components/projects/available-project-card';
import { ProjectHeaderCard } from '@/components/projects/detail/project-header-card';

function renderConQuery(ui: ReactNode) {
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

describe('«Cierra pronto» (MEJ-95)', () => {
  afterEach(() => cleanup());

  it('la tarjeta de Explorar lo muestra con un tono existente', () => {
    renderConQuery(<AvailableProjectCard proyecto={{ ...base, cierraPronto: true, fechaLimitePostulacion: '2026-12-10' }} />);
    expect(screen.getByText('Cierra pronto')).toHaveClass('pill', 'pill-amber');
  });

  it('la tarjeta no lo muestra si el API no lo marca', () => {
    renderConQuery(<AvailableProjectCard proyecto={{ ...base, cierraPronto: false }} />);
    expect(screen.queryByText('Cierra pronto')).toBeNull();
  });

  it('el encabezado del detalle también lo muestra', () => {
    render(
      <ProjectHeaderCard
        breadcrumb={{ href: '/dashboard/proyectos', label: 'Proyectos disponibles' }}
        titulo="Brazo robotico"
        descripcion="Descripcion"
        tipoProyecto="ACADEMICO_EXPERIENCIA"
        estadoProyecto="PUBLICADO"
        modalidadProyecto="MIXTA"
        cierraPronto
      />,
    );
    expect(screen.getByText('Cierra pronto')).toBeInTheDocument();
  });
});
