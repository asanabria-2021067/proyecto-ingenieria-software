import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  ProjectGeneralInfoSection,
  READONLY_CARD_CLASS,
} from '../components/projects/detail/project-general-info-section';
import { ProjectRolesSkillsSection } from '../components/projects/detail/project-roles-skills-section';

// Solicitud de «Mis Proyectos»: los campos de «Información general» van en la
// misma tarjeta que cada rol de «Roles y habilidades», en lectura y en edición.

const general = {
  tituloProyecto: 'Programa de mentoría STEM',
  descripcionProyecto: 'Acompañamiento a primer ingreso.',
  tipoProyecto: 'ACADEMICO_EXPERIENCIA',
  modalidadProyecto: 'MIXTA',
  objetivosProyecto: 'Reducir la deserción.',
  contextoAcademico: 'Decanatura de Ingeniería',
  ubicacionProyecto: 'Campus Central',
  fechaInicio: '2026-09-14',
  fechaFinEstimada: '2026-12-04',
  urlRecursoExterno: null,
  mostrarComentario: false,
};

const rol = {
  idRolProyecto: 1,
  nombreRol: 'Mentoría',
  cupos: 6,
  descripcionRolProyecto: 'Acompañamiento semanal.',
  carreraRequerida: null,
  horasSemanalesEstimadas: 4,
  requisitos: [],
};

describe('Solicitud — tarjetas de campos de solo lectura', () => {
  afterEach(() => cleanup());

  it('todos los campos de Información general quedan dentro de una sola tarjeta', () => {
    render(<ProjectGeneralInfoSection {...general} />);

    const seccion = screen.getByRole('heading', { name: 'Información general' }).closest('section')!;
    const tarjetas = seccion.querySelectorAll('[data-slot="readonly-card"]');
    expect(tarjetas).toHaveLength(1);
    for (const etiqueta of ['Título del proyecto', 'Descripción', 'Tipo', 'Modalidad', 'Objetivos', 'Contexto académico', 'Ubicación', 'Fecha de inicio', 'Fecha fin estimada', 'URL recurso externo']) {
      expect(within(tarjetas[0] as HTMLElement).getByText(etiqueta)).toBeInTheDocument();
    }
  });

  it('la tarjeta de Información general es idéntica a la de cada rol', () => {
    render(
      <>
        <ProjectGeneralInfoSection {...general} />
        <ProjectRolesSkillsSection roles={[rol, { ...rol, idRolProyecto: 2, nombreRol: 'Documentación' }]} mostrarComentario={false} />
      </>,
    );

    const tarjetas = Array.from(document.querySelectorAll('[data-slot="readonly-card"]'));
    expect(tarjetas).toHaveLength(3);
    for (const tarjeta of tarjetas) expect(tarjeta.className).toBe(READONLY_CARD_CLASS);
    expect(READONLY_CARD_CLASS).toContain('rounded-xl');
    expect(READONLY_CARD_CLASS).toContain('border');
    expect(READONLY_CARD_CLASS).toContain('p-5');
  });

  it('en edición, Información general usa la misma tarjeta base que cada rol', () => {
    const fuente = readFileSync(
      join(__dirname, '..', 'app/dashboard/projects/mine/[id]/my-project-view-client.tsx'),
      'utf-8',
    );
    const clases = [...fuente.matchAll(/data-slot="edit-card" className="([^"]+)"/g)].map((m) => m[1]);
    expect(clases).toHaveLength(2);
    // Mismo contenedor; solo cambia el espaciado vertical interno.
    const base = (c: string) => c.split(' ').filter((x) => !x.startsWith('space-y-')).join(' ');
    expect(base(clases[0])).toBe(base(clases[1]));
    expect(base(clases[0])).toBe('rounded-xl border border-outline-variant bg-surface-container-low p-5');
  });
});
