import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { AdminAttentionQueue } from '../components/admin/dashboard/attention-queue';

/**
 * GPI01-C07 (H-05). A 768 px con la barra lateral abierta la tarjeta mide unos
 * 450 px; las columnas fijas de Estado y Total dejaban «Tipo» en ~70 px y la
 * descripción partía una palabra por línea. El diseño depende ahora del ancho
 * de la tarjeta (container query), no del de la ventana. jsdom no evalúa
 * container queries: aquí se fija la estructura y la geometría se mide en
 * navegador (ver la auditoría de GPI01).
 */

afterEach(cleanup);

const filas = () => screen.getAllByRole('listitem');

describe('GPI01-C07: cola «Requieren atención» adaptable al ancho de la tarjeta', () => {
  it('la tarjeta es el contenedor de la consulta y nada depende ya del ancho de la ventana', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    const tarjeta = screen.getByRole('region', { name: 'Requieren atención' });

    expect(tarjeta.className).toContain('@container/atencion');
    for (const nodo of [tarjeta, ...tarjeta.querySelectorAll('*')]) {
      expect(nodo.getAttribute('class') ?? '', 'sin variantes sm:/md:/lg: de ventana').not.toMatch(
        /(^|\s)(sm|md|lg|xl):/,
      );
    }
  });

  it('en estrecho el estado baja bajo la descripción; en ancho vuelve a su columna', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    for (const fila of filas()) {
      expect(fila.className).toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
      expect(fila.className).toContain('@xl/atencion:grid-cols-[auto_minmax(0,1fr)_11rem_7rem]');
      const estado = fila.querySelector('.pill')!.parentElement!;
      expect(estado).toHaveClass('col-start-2', 'row-start-2', '@xl/atencion:col-start-3', '@xl/atencion:row-start-1');
      // La columna de texto puede encoger sin desbordar la fila.
      expect(within(fila).getByRole('link').parentElement).toHaveClass('min-w-0');
    }
  });

  it('una sola etiqueta de estado por fila: no hay copia para móvil', () => {
    render(<AdminAttentionQueue enRevision={7} cierrePendiente={8} usuariosBloqueados={3} />);
    for (const fila of filas()) expect(fila.querySelectorAll('.pill')).toHaveLength(1);
  });

  it('una fila sin pendientes no reserva la segunda línea en estrecho', () => {
    render(<AdminAttentionQueue enRevision={0} cierrePendiente={0} usuariosBloqueados={0} />);
    for (const fila of filas()) {
      expect(fila.querySelector('.pill')).toBeNull();
      expect(fila.querySelector('.row-start-2')).toHaveClass('empty:hidden');
    }
  });

  it('el encabezado «Estado» solo se muestra cuando existe la columna', () => {
    render(<AdminAttentionQueue enRevision={1} cierrePendiente={1} usuariosBloqueados={1} />);
    const encabezado = screen.getByText('Estado');
    expect(encabezado).toHaveClass('hidden', '@xl/atencion:block');
  });
});
