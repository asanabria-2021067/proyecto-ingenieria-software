import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import {
  AvailableProjectCard,
  AvailableProjectCardSkeleton,
  PROJECT_CARD_GRID,
} from '../components/projects/available-project-card';
import type { MiProyectoListItemDTO } from '../lib/dto/project.dto';

// «Proyectos Disponibles» y «Mis Proyectos» comparten una sola carcasa de
// tarjeta basada en `.card-base` (radio, sombra, borde y relleno del
// sistema de diseño) y una sola grilla. Ninguna vista vuelve a fijar su
// propio radio, sombra o grilla local.

const VISTAS = ['app/dashboard/proyectos/page.tsx', 'app/dashboard/projects/mine/page.tsx'];

const leer = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf-8');

const proyectoMio = {
  idProyecto: 7,
  tituloProyecto: 'Huerto urbano',
  descripcionProyecto: 'Descripción',
  tipoProyecto: 'ACADEMICO_EXPERIENCIA',
  modalidadProyecto: 'PRESENCIAL',
  estadoProyecto: 'PUBLICADO',
  revisiones: [],
} as unknown as MiProyectoListItemDTO;

describe('Carcasa compartida de las tarjetas de proyecto', () => {
  it('la tarjeta parte de card-base, con altura mínima y realce al pasar el cursor', () => {
    render(<AvailableProjectCard context="mine" proyecto={proyectoMio} />);
    const card = screen.getByTestId('project-card-7');
    for (const clase of ['card-base', 'min-h-56', 'hover:shadow-raised']) {
      expect(card).toHaveClass(clase);
    }
    expect(card.className).not.toMatch(/rounded-\[|shadow-\[|p-4\.5/);
  });

  it('el skeleton usa la misma carcasa que la tarjeta', () => {
    const { container } = render(<AvailableProjectCardSkeleton />);
    expect(container.firstElementChild).toHaveClass('card-base', 'min-h-56');
  });

  it('la grilla compartida pasa a dos columnas desde lg con el gap de grilla', () => {
    expect(PROJECT_CARD_GRID.split(' ')).toEqual(['grid', 'grid-cols-1', 'gap-grid', 'lg:grid-cols-2']);
  });

  it.each(VISTAS)('%s usa la grilla compartida y no una local', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).toMatch(/className=\{PROJECT_CARD_GRID\}/);
    expect(fuente).not.toContain('gap-x-4 gap-y-3 md:grid-cols-2');
  });
});

// «Ver proyecto» en Proyectos Disponibles usa el botón oscuro del sistema
// (token `action`, el mismo del botón por defecto), no el verde de marca.
describe('Tarjeta de Proyectos Disponibles — botón «Ver proyecto»', () => {
  it('usa el color de acción oscuro y enlaza al detalle del proyecto', () => {
    const disponible = {
      idProyecto: 39,
      tituloProyecto: 'Gestión de Mentorías',
      descripcionProyecto: 'Descripción',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      modalidadProyecto: 'VIRTUAL',
      estadoProyecto: 'EN_PROGRESO',
      roles: [{ cupos: 2 }],
      creador: { idUsuario: 1, nombre: 'Valeria', apellido: 'Ortiz' },
    } as never;
    render(<AvailableProjectCard proyecto={disponible} />);

    const boton = screen.getByRole('link', { name: 'Ver proyecto' });
    expect(boton).toHaveAttribute('href', '/dashboard/proyectos/39');
    expect(boton).toHaveClass('bg-action', 'text-on-action', 'hover:bg-action/90');
    expect(boton.className).not.toMatch(/(?<![\w-])(bg-primary|text-on-primary)\b/);
  });
});
