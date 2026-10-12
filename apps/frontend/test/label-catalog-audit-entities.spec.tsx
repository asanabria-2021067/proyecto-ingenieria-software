import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import EtiquetasPage from '../app/dashboard/admin/etiquetas/page';
import { ENTIDAD_LABEL } from '../components/projects/bitacora-entity.utils';

/**
 * GPI01-C06 (H-04). En la familia 19 la muestra metía la clave de la
 * enumeración dentro de la etiqueta: «Liderazgo (APELACION_LIDERAZGO)» medía
 * 228 px en una caja de 221 px y se recortaba en ambos temas. La etiqueta
 * muestra ahora solo su rótulo real (el mismo de la bitácora) y la clave va al
 * lado, fuera de la píldora, donde puede partir línea. La geometría real se
 * mide en navegador (ver la auditoría de GPI01); aquí se fija la estructura.
 */

afterEach(cleanup);

/** Elementos `.pill` dentro de las 27 familias (claro + oscuro); el cambio no añade ni quita ninguno. */
const ETIQUETAS_EN_FAMILIAS = 256;

const familia = (numero: number) =>
  screen.getByRole('region', { name: new RegExp(`^${String(numero).padStart(2, '0')} · `) });

describe('GPI01-C06: familia 19 «Entidad en la bitácora»', () => {
  it('cada etiqueta contiene solo su rótulo real, en claro y en oscuro', () => {
    render(<EtiquetasPage />);
    const pills = [...familia(19).querySelectorAll('.pill')];
    const claves = Object.keys(ENTIDAD_LABEL) as Array<keyof typeof ENTIDAD_LABEL>;

    expect(pills).toHaveLength(claves.length * 2);
    expect(pills.map((p) => p.textContent)).toEqual([...claves, ...claves].map((c) => ENTIDAD_LABEL[c]));
    for (const pill of pills) expect(pill.textContent).not.toMatch(/[()_]/);
  });

  it('la clave de la enumeración sigue visible junto a su etiqueta, fuera de ella y con salto de línea permitido', () => {
    render(<EtiquetasPage />);
    for (const clave of Object.keys(ENTIDAD_LABEL)) {
      const codigos = within(familia(19)).getAllByText(clave);
      expect(codigos).toHaveLength(2);
      for (const codigo of codigos) {
        expect(codigo.closest('.pill')).toBeNull();
        expect(codigo).toHaveClass('break-all');
        expect(codigo.parentElement?.querySelector('.pill')).not.toBeNull();
      }
    }
  });

  it('las muestras claro/oscuro se reparten según el ancho de la tarjeta, no el de la ventana', () => {
    render(<EtiquetasPage />);
    for (const region of screen.getAllByRole('region', { name: /^\d{2} · / })) {
      expect(region.className).toContain('@container/familia');
      const rejilla = region.querySelector('.dark')!.parentElement!;
      expect(rejilla).toHaveClass('grid-cols-1', '@xl/familia:grid-cols-2');
      expect(rejilla.className).not.toMatch(/(^|\s)(sm|md|lg):grid-cols/);
    }
  });

  it('el catálogo conserva sus 27 familias y el mismo número de etiquetas', () => {
    render(<EtiquetasPage />);
    expect(screen.getAllByRole('region', { name: /^\d{2} · / })).toHaveLength(27);
    const enFamilias = screen
      .getAllByRole('region', { name: /^\d{2} · / })
      .reduce((total, region) => total + region.querySelectorAll('.pill').length, 0);
    expect(enFamilias).toBe(ETIQUETAS_EN_FAMILIAS);
  });
});
