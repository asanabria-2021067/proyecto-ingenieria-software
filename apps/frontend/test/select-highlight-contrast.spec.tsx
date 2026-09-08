import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

/**
 * La opción resaltada de un `Select` se pinta de verde oscuro. Varias listas
 * (nuevo líder, candidato de una apelación, asignación de tarea) no muestran
 * texto suelto sino una ficha: avatar, nombre y una línea de rol/horas, cada
 * una con su propio color. Esos colores ganan por especificidad al
 * `focus:text-on-primary` del item, así que el nombre y el subtítulo se
 * quedaban oscuros sobre verde oscuro — ilegibles justo en la opción que el
 * usuario está apuntando.
 */

beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
});

/** Una opción con la forma real de las listas de personas del proyecto. */
function renderFicha() {
  return render(
    createElement(
      Select,
      { open: true },
      createElement(SelectTrigger, null, createElement(SelectValue, { placeholder: 'Selecciona…' })),
      createElement(
        SelectContent,
        null,
        createElement(
          SelectItem,
          { value: '8' },
          createElement(
            'span',
            { className: 'flex items-center gap-2' },
            createElement('span', { className: 'text-sm font-semibold text-on-surface' }, 'José Ramírez'),
            createElement('span', { className: 'text-[11px] text-tertiary' }, 'Desarrollador Frontend · 2 tareas · 0 h'),
          ),
        ),
      ),
    ),
  );
}

/** ¿Hay alguna regla que recoloree TODOS los descendientes al resaltar? */
function recoloreaDescendientesAlResaltar(clases: string): boolean {
  return /focus:\[&_\*\]:text-[a-z-]+/.test(clases);
}

describe('Contraste de la opción resaltada de un Select', () => {
  it('el item recolorea a sus descendientes mientras está resaltado', () => {
    renderFicha();
    const opcion = screen.getByRole('option', { name: /José Ramírez/ });

    expect(recoloreaDescendientesAlResaltar(opcion.className)).toBe(true);
    // El fondo resaltado y el color heredado siguen siendo el par del tema.
    expect(opcion.className).toContain('focus:bg-primary');
    expect(opcion.className).toContain('focus:text-on-primary');
  });

  it('la regla es necesaria: los hijos traen su propio color, que de otro modo gana', () => {
    renderFicha();
    const opcion = screen.getByRole('option', { name: /José Ramírez/ });

    // Precondición del fallo: nombre y subtítulo llevan color propio.
    expect(within(opcion).getByText('José Ramírez').className).toMatch(/text-on-surface/);
    expect(within(opcion).getByText(/Desarrollador Frontend/).className).toMatch(/text-tertiary/);
  });

  it('fuera del resaltado no se fuerza ningún color: la lista en reposo conserva su jerarquía', () => {
    renderFicha();
    const opcion = screen.getByRole('option', { name: /José Ramírez/ });

    // Todo el recoloreado va detrás de `focus:`; nada lo aplica en reposo.
    const sinFoco = opcion.className
      .split(/\s+/)
      .filter((c) => c.includes('text-on-primary') && !c.startsWith('focus:'));
    expect(sinFoco).toEqual([]);
  });
});
