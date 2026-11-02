import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/image', () => ({ default: () => null }));

import { StepPropietario } from '../app/dashboard/projects/mine/form/StepPropietario';

const juntas = [{ idAsociacion: 7, nombre: 'AEC', logoUrl: null, cargo: 'PRESIDENTE' as const, nivelPermiso: 'ADMINISTRADOR' as const }];

afterEach(cleanup);

describe('ASO: «¿A nombre de quién?» con asociación', () => {
  it('ofrece «a nombre de la asociación» a quien puede publicar', () => {
    render(<StepPropietario organizaciones={[]} cargando={false} idOrganizacion={null} onChange={vi.fn()} asociaciones={juntas} />);
    expect(screen.getByRole('radio', { name: /A nombre de AEC/ })).toBeInTheDocument();
    expect(screen.getByText(/Tu cargo: Presidente/)).toBeInTheDocument();
  });

  it('sin asociaciones publicables no aparece la opción', () => {
    render(<StepPropietario organizaciones={[]} cargando={false} idOrganizacion={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: /asociación/i })).toBeNull();
  });

  it('elegirla avisa la asociación; volver a Personal limpia la organización', () => {
    const onChange = vi.fn();
    const onChangeAsociacion = vi.fn();
    render(
      <StepPropietario
        organizaciones={[]}
        cargando={false}
        idOrganizacion={null}
        onChange={onChange}
        asociaciones={juntas}
        idAsociacion={null}
        onChangeAsociacion={onChangeAsociacion}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /A nombre de AEC/ }));
    expect(onChangeAsociacion).toHaveBeenCalledWith(7);

    cleanup();
    render(
      <StepPropietario
        organizaciones={[]}
        cargando={false}
        idOrganizacion={null}
        onChange={onChange}
        asociaciones={juntas}
        idAsociacion={7}
        onChangeAsociacion={onChangeAsociacion}
      />,
    );
    expect(screen.getByRole('radio', { name: /A nombre de AEC/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Personal/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
