import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  Skeleton,
  SkeletonCard,
  SkeletonDetail,
  SkeletonList,
  SkeletonRegion,
  SkeletonTable,
} from '../components/ui/skeleton';

/** HU-204 (T-390): skeleton reutilizable con variantes de lista, tarjeta, tabla y detalle. */

afterEach(cleanup);

describe('Skeleton base', () => {
  it('es decorativo y su pulsación solo corre sin movimiento reducido', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const bloque = container.querySelector('[data-slot="skeleton"]');
    expect(bloque).toHaveAttribute('aria-hidden', 'true');
    expect(bloque).toHaveClass('bg-muted', 'motion-safe:animate-pulse', 'h-4', 'w-20');
    expect(bloque).not.toHaveClass('animate-pulse');
  });
});

describe('SkeletonRegion', () => {
  it('anuncia la carga una sola vez con nombre, texto accesible y aria-busy', () => {
    render(
      <SkeletonRegion label="Cargando tus postulaciones">
        <Skeleton />
        <Skeleton />
      </SkeletonRegion>,
    );
    const region = screen.getByRole('status', { name: 'Cargando tus postulaciones' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveTextContent('Cargando tus postulaciones');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe.each([
  ['SkeletonList', SkeletonList],
  ['SkeletonCard', SkeletonCard],
  ['SkeletonTable', SkeletonTable],
  ['SkeletonDetail', SkeletonDetail],
] as const)('%s', (_nombre, Variante) => {
  it('con label es una región de estado; sin label queda oculto para dentro de otra región', () => {
    const { unmount } = render(<Variante label="Cargando datos" />);
    expect(screen.getByRole('status', { name: 'Cargando datos' })).toHaveAttribute('aria-busy', 'true');
    unmount();

    const { container } = render(<Variante />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('acepta clases propias en la raíz', () => {
    const { container } = render(<Variante className="mt-section" />);
    expect(container.firstElementChild).toHaveClass('mt-section');
  });
});

describe('SkeletonList', () => {
  it('pinta la cantidad de elementos, líneas, avatar y etiquetas pedidas', () => {
    const { container } = render(<SkeletonList count={4} lines={3} avatar="circle" trailing={2} />);
    const items = container.querySelectorAll('[data-slot="skeleton-list-item"]');
    expect(items).toHaveLength(4);
    // avatar + 3 líneas + 2 etiquetas
    expect(items[0].querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
    expect(items[0].querySelector('.rounded-full')).not.toBeNull();
  });

  it('`cards` separa cada elemento en su tarjeta; `rows` los divide dentro de una sola', () => {
    const { container, rerender } = render(<SkeletonList count={2} />);
    expect(container.querySelectorAll('[data-slot="skeleton-list-item"].card-base')).toHaveLength(2);

    rerender(<SkeletonList count={2} layout="rows" />);
    expect(container.firstElementChild).toHaveClass('card-base', 'divide-y');
    expect(container.querySelectorAll('[data-slot="skeleton-list-item"].card-base')).toHaveLength(0);
  });

  it('`plain` deja filas sueltas, sin tarjeta propia ni contenedora', () => {
    const { container } = render(<SkeletonList count={2} layout="plain" />);
    expect(container.firstElementChild).not.toHaveClass('card-base');
    expect(container.querySelectorAll('.card-base')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="skeleton-list-item"]')).toHaveLength(2);
  });
});

describe('SkeletonCard', () => {
  it('pinta las tarjetas con bloque de gráfica y pie cuando se piden', () => {
    const { container } = render(<SkeletonCard count={2} media mediaClassName="h-[340px]" footer />);
    const tarjetas = container.querySelectorAll('[data-slot="skeleton-card"]');
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toHaveClass('card-base');
    expect(tarjetas[0].querySelector('.h-\\[340px\\]')).not.toBeNull();
    expect(tarjetas[0].querySelector('.border-t')).not.toBeNull();
  });

  it('sin líneas ni extras solo deja el título', () => {
    const { container } = render(<SkeletonCard count={1} lines={0} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });
});

describe('SkeletonTable', () => {
  it('pinta encabezado y filas con el número de columnas pedido', () => {
    const { container } = render(<SkeletonTable rows={3} columns={5} />);
    const cabecera = container.querySelector('[data-slot="skeleton-table-head"]');
    expect(cabecera?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
    expect(cabecera).toHaveStyle({ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' });

    const filas = container.querySelectorAll('[data-slot="skeleton-table-row"]');
    expect(filas).toHaveLength(3);
    expect(filas[0].querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
  });
});

describe('SkeletonDetail', () => {
  it('pinta cabecera, secciones y, solo si se pide, la columna lateral', () => {
    const { container, rerender } = render(<SkeletonDetail sections={3} />);
    expect(container.querySelector('[data-slot="skeleton-detail-header"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="skeleton-detail-section"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="skeleton-detail-aside"]')).toHaveLength(0);

    rerender(<SkeletonDetail sections={1} aside={2} />);
    expect(container.querySelectorAll('[data-slot="skeleton-detail-aside"]')).toHaveLength(2);
    expect(container.firstElementChild).toHaveClass('lg:grid-cols-[minmax(0,1fr)_360px]');
  });
});
