import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

// ── HU-154: la tarjeta se adapta a su propio ancho, no al de la ventana ──
// En la columna principal 8/12 del proyecto la tarjeta puede medir ~280px a
// 1440px de ventana; con `sm:flex-row` (por viewport) el nombre del rol y
// «Salir de este rol» se montaban uno sobre otro.
describe('RoleAdminCard — disposición por contenedor', () => {
  afterEach(() => cleanup());

  it('la tarjeta es un contenedor y pone nombre y acciones en fila solo desde su propio ancho', () => {
    renderCard(role({ isMine: true, canLeave: true }));

    const titulo = screen.getByRole('heading', { level: 3, name: 'Frontend' });
    const tarjeta = titulo.closest('[class*="@container/role-card"]') as HTMLElement;
    expect(tarjeta).not.toBeNull();

    const fila = tarjeta.firstElementChild as HTMLElement;
    expect(fila).toContainElement(titulo);
    expect(fila).toContainElement(screen.getByRole('button', { name: /salir de este rol/i }));
    expect(fila).toHaveClass('flex-col', '@md/role-card:flex-row');
    expect(fila.className).not.toMatch(/(^|\s)(sm|md|lg|xl):flex-row/);

    const acciones = screen.getByRole('button', { name: /salir de este rol/i }).parentElement as HTMLElement;
    expect(acciones).toHaveClass('@md/role-card:items-end');
    expect(acciones.className).not.toMatch(/(^|\s)sm:items-end/);
  });

  it('Tailwind genera las variantes: tarjeta en fila desde 28rem y lista de roles a 2 columnas desde 42rem', async () => {
    const postcss = (await import('postcss')).default;
    const tailwind = (await import('@tailwindcss/postcss')).default;
    const base = join(__dirname, '..');
    const entrada = readFileSync(join(base, 'app/global.css'), 'utf-8');
    const { css } = await postcss([tailwind({ base })]).process(entrada, { from: join(base, 'app/global.css') });

    expect(css).toContain('container-name: role-card');
    expect(css).toContain('container-name: roles');
    const fila = css.slice(css.indexOf('.\\@md\\/role-card\\:flex-row'));
    expect(fila.slice(0, 200)).toMatch(/@container role-card \(width >= 28rem\)/);
    const columnas = css.slice(css.indexOf('.\\@2xl\\/roles\\:grid-cols-2'));
    expect(columnas.slice(0, 200)).toMatch(/@container roles \(width >= 42rem\)/);
  }, 60_000);
});
