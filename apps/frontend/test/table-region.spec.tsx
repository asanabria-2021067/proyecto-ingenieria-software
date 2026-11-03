import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from '@/components/ui/table';

describe('Table: contenedor con scroll enfocable (A11Y-1/A11Y-3)', () => {
  it('es una región enfocable con nombre por defecto', () => {
    render(<Table />);
    const region = screen.getByRole('region', { name: 'Tabla con desplazamiento horizontal' });
    expect(region.tabIndex).toBe(0);
    expect(region.getAttribute('data-slot')).toBe('table-container');
  });

  it('acepta un nombre propio', () => {
    render(<Table containerLabel="Horas por semestre" />);
    expect(screen.getByRole('region', { name: 'Horas por semestre' })).toBeTruthy();
  });
});
