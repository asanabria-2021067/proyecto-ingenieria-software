import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RoleAdminCard } from '../components/projects/role-admin-card';
import type { ProjectRoleDTO } from '../lib/services/roles';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
});

function role(overrides: Partial<ProjectRoleDTO> = {}): ProjectRoleDTO {
  return {
    idRolProyecto: 100,
    nombreRol: 'Frontend',
    descripcionRolProyecto: null,
    idCarreraRequerida: null,
    carreraRequerida: null,
    cupos: 2,
    horasSemanalesEstimadas: null,
    requisitos: [],
    participantesActivos: 1,
    cuposDisponibles: 1,
    isMine: false,
    canLeave: false,
    ...overrides,
  };
}

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  };
}

function renderCard(r: ProjectRoleDTO, mutations: Record<string, unknown> = {}) {
  const asignarmeRol = mutations.asignarmeRol ?? mutationStub();
  const salirDeRol = mutations.salirDeRol ?? mutationStub();
  render(createElement(RoleAdminCard, { role: r, asignarmeRol, salirDeRol } as any));
  return { asignarmeRol, salirDeRol };
}

describe('RoleAdminCard (Sección 22)', () => {
  afterEach(() => cleanup());

  it('si el líder no participa muestra "Asignarme a este rol" y llama asignarmeRol con el roleId', () => {
    const { asignarmeRol } = renderCard(role({ isMine: false }));

    const boton = screen.getByRole('button', { name: /asignarme a este rol/i });
    fireEvent.click(boton);

    expect((asignarmeRol as any).mutate).toHaveBeenCalledWith({ roleId: 100 });
  });

  it('si el líder participa muestra el badge "Mi rol"', () => {
    renderCard(role({ isMine: true, canLeave: true }));
    expect(screen.getByText('Mi rol')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /asignarme a este rol/i })).not.toBeInTheDocument();
  });

  it('con otro rol activo (canLeave) muestra "Salir de este rol" y al confirmar llama salirDeRol', async () => {
    const { salirDeRol } = renderCard(role({ isMine: true, canLeave: true }));

    fireEvent.click(screen.getByRole('button', { name: /salir de este rol/i }));
    // Confirmación
    fireEvent.click(await screen.findByRole('button', { name: /salir del rol/i }));

    expect((salirDeRol as any).mutate).toHaveBeenCalledWith({ roleId: 100 }, expect.anything());
  });

  it('si es su único rol el botón de salir está deshabilitado con el mensaje del último rol', () => {
    renderCard(role({ isMine: true, canLeave: false }));

    const boton = screen.getByRole('button', { name: /salir de este rol/i });
    expect(boton).toBeDisabled();
    // El mensaje del último rol se expone como aria-label del envoltorio
    // accesible (el tooltip visible solo aparece al enfocar/hover).
    expect(
      screen.getByLabelText('No puedes abandonar tu último rol desde esta opción.'),
    ).toBeInTheDocument();
  });

  it('muestra un mensaje de error de negocio cuando la autoasignación falla (409)', () => {
    const asignarmeRol = mutationStub({
      isError: true,
      error: { statusCode: 409, message: 'Ya existe una participación activa en este rol' },
      variables: { roleId: 100 },
    });
    renderCard(role({ isMine: false }), { asignarmeRol });

    expect(screen.getByRole('alert')).toHaveTextContent(/participación activa/i);
  });
});

// Tarjeta del rol con la identidad visual de UVGenius: una sola columna con
// aire entre bloques, título a dos líneas como máximo, estado en su propia
// fila, «Editar rol» discreto, descripción acotada y métricas separadas.
describe('RoleAdminCard — diseño de la tarjeta', () => {
  afterEach(() => cleanup());

  function renderCompleta(overrides: Partial<ProjectRoleDTO> = {}) {
    const r = role({
      nombreRol: 'Desarrollador Frontend de la plataforma de tutorías',
      descripcionRolProyecto: 'Construye las vistas del portal y coordina con backend. '.repeat(6),
      carreraRequerida: { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencias de la Computación' } as any,
      horasSemanalesEstimadas: 6,
      requisitos: [
        { idHabilidad: 1, nombreHabilidad: 'React', nivelMinimo: 'BASICO' },
        { idHabilidad: 2, nombreHabilidad: 'NestJS', nivelMinimo: 'INTERMEDIO' },
      ] as any,
      ...overrides,
    });
    render(
      createElement(RoleAdminCard, {
        role: r,
        asignarmeRol: mutationStub(),
        salirDeRol: mutationStub(),
        onEditar: () => {},
      } as any),
    );
    const titulo = screen.getByRole('heading', { level: 3 });
    return { tarjeta: titulo.closest('[data-slot="role-card"]') as HTMLElement, titulo };
  }

  it('usa la tarjeta del sistema con aire entre bloques y ocupa el alto de su celda', () => {
    const { tarjeta } = renderCompleta();

    expect(tarjeta).toHaveClass('card-base', 'flex', 'flex-col', 'gap-stack', 'h-full');
  });

  it('ordena el contenido: título, estado, carrera, acciones, descripción, métricas y habilidades', () => {
    const { tarjeta, titulo } = renderCompleta();

    const orden = [
      titulo,
      within(tarjeta).getByText('Disponible'),
      within(tarjeta).getByText('Ingeniería en Ciencias de la Computación'),
      within(tarjeta).getByRole('button', { name: /asignarme a este rol/i }),
      within(tarjeta).getByRole('button', { name: /editar rol/i }),
      within(tarjeta).getByText(/Construye las vistas del portal/),
      within(tarjeta).getByText('1/2 ocupados'),
      within(tarjeta).getByRole('list', { name: 'Habilidades requeridas' }),
    ];
    for (let k = 1; k < orden.length; k += 1) {
      expect(orden[k - 1].compareDocumentPosition(orden[k]) & Node.DOCUMENT_POSITION_FOLLOWING, `bloque ${k}`).toBeTruthy();
    }
  });

  it('el título admite dos líneas y las insignias van en su propia fila, sin comprimirlo', () => {
    const { tarjeta, titulo } = renderCompleta({ isMine: true, canLeave: true });

    expect(titulo).toHaveClass('line-clamp-2', 'leading-snug');
    const insignias = within(tarjeta).getByText('Mi rol').parentElement!;
    expect(insignias).not.toContainElement(titulo);
    expect(insignias).toHaveClass('flex-wrap');
    expect(within(insignias).getByText('Disponible')).toBeInTheDocument();
  });

  it('la descripción se limita a tres líneas', () => {
    const { tarjeta } = renderCompleta();

    expect(within(tarjeta).getByText(/Construye las vistas del portal/)).toHaveClass('line-clamp-3');
  });

  it('«Asignarme a este rol» es la acción principal y «Editar rol» una acción discreta a su lado', () => {
    const { tarjeta } = renderCompleta();

    const principal = within(tarjeta).getByRole('button', { name: /asignarme a este rol/i });
    const editar = within(tarjeta).getByRole('button', { name: /editar rol/i });
    expect(principal).toHaveClass('bg-primary', 'text-on-primary');
    expect(editar).toHaveClass('text-text-secondary');
    expect(editar.className).not.toMatch(/(?<![\w-])bg-primary\b/);
    expect(principal.parentElement).toBe(editar.parentElement);
    expect(principal.parentElement).toHaveClass('flex', 'flex-wrap');
  });

  it('las métricas van en un bloque separado, sin iconos y abajo de la tarjeta', () => {
    const { tarjeta } = renderCompleta();

    const metricas = tarjeta.querySelector('[data-slot="role-card-metricas"]') as HTMLElement;
    expect(metricas).toHaveClass('type-meta', 'border-t', 'pt-stack', 'mt-auto', 'gap-x-card');
    expect(metricas.querySelector('svg')).toBeNull();
    expect(Array.from(metricas.children).map((c) => c.textContent)).toEqual(['1/2 ocupados', '1 cupo disponible', '6 h/sem']);
  });

  it('las habilidades son etiquetas pequeñas y neutras', () => {
    const { tarjeta } = renderCompleta();

    const etiquetas = within(within(tarjeta).getByRole('list', { name: 'Habilidades requeridas' })).getAllByRole('listitem');
    expect(etiquetas.map((e) => e.textContent)).toEqual(['React · Básico', 'NestJS · Intermedio']);
    for (const e of etiquetas) {
      expect(e).toHaveClass('bg-surface-container-high', 'text-text-secondary', 'text-meta');
      expect(e.className).not.toMatch(/pill-(accent|success|warning|error)/);
    }
  });

  it('Tailwind genera la rejilla de dos columnas desde 42rem de la lista', async () => {
    const postcss = (await import('postcss')).default;
    const tailwind = (await import('@tailwindcss/postcss')).default;
    const base = join(__dirname, '..');
    const entrada = readFileSync(join(base, 'app/global.css'), 'utf-8');
    const { css } = await postcss([tailwind({ base })]).process(entrada, { from: join(base, 'app/global.css') });

    expect(css).toContain('container-name: roles');
    const columnas = css.slice(css.indexOf('.\\@2xl\\/roles\\:grid-cols-2'));
    expect(columnas.slice(0, 200)).toMatch(/@container roles \(width >= 42rem\)/);
  }, 60_000);
});

// Las acciones usan la escala secundaria (13 px), por debajo del título.
describe('RoleAdminCard — tamaño de las acciones', () => {
  afterEach(() => cleanup());

  it.each([
    ['Asignarme a este rol', role({ isMine: false })],
    ['Salir de este rol', role({ isMine: true, canLeave: true })],
    ['Salir de este rol', role({ isMine: true, canLeave: false })],
  ])('«%s» y «Editar rol» usan type-meta y conservan su color', (nombre, r) => {
    render(createElement(RoleAdminCard, { role: r, asignarmeRol: mutationStub(), salirDeRol: mutationStub(), onEditar: () => {} } as any));

    const principal = screen.getByRole('button', { name: new RegExp(nombre, 'i') });
    const editar = screen.getByRole('button', { name: /editar rol/i });
    for (const boton of [principal, editar]) {
      expect(boton).toHaveClass('type-meta');
      // tailwind-merge no debe haber descartado el color propio del botón.
      expect(boton.className).toMatch(/(?<![\w-])text-(on-primary|on-error|text-disabled|text-secondary)\b/);
    }
  });
});

