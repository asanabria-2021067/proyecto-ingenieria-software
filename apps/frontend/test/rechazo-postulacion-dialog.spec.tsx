import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RechazoPostulacionDialog } from '@/components/projects/rechazo-postulacion-dialog';

function abrir() {
  const onConfirmar = vi.fn();
  const onCerrar = vi.fn();
  render(<RechazoPostulacionDialog nombrePostulante="Maria Lopez" onConfirmar={onConfirmar} onCerrar={onCerrar} />);
  return { onConfirmar, onCerrar };
}

describe('Diálogo de rechazo con motivo (MEJ-99)', () => {
  afterEach(() => cleanup());

  it('ofrece los cuatro motivos y no deja rechazar sin elegir uno', () => {
    const { onConfirmar } = abrir();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Otro motivo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elige un motivo.');
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('con un motivo de la lista envía motivo y comentario opcional', () => {
    const { onConfirmar } = abrir();
    fireEvent.click(screen.getByRole('radio', { name: 'El horario no es compatible' }));
    fireEvent.change(screen.getByLabelText(/Comentario/), { target: { value: '  Choca con sus clases  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(onConfirmar).toHaveBeenCalledWith({ motivoRechazo: 'HORARIO', comentarioResolucion: 'Choca con sus clases' });
  });

  it('sin comentario no lo envía', () => {
    const { onConfirmar } = abrir();
    fireEvent.click(screen.getByRole('radio', { name: 'El cupo del rol ya está lleno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(onConfirmar).toHaveBeenCalledWith({ motivoRechazo: 'CUPO_LLENO', comentarioResolucion: undefined });
  });

  it('«Otro motivo» exige comentario', () => {
    const { onConfirmar } = abrir();
    fireEvent.click(screen.getByRole('radio', { name: 'Otro motivo' }));
    fireEvent.change(screen.getByLabelText(/Comentario/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('el comentario es obligatorio');
    expect(onConfirmar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Comentario/), { target: { value: 'Ya cubrimos el rol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));
    expect(onConfirmar).toHaveBeenCalledWith({ motivoRechazo: 'OTRO', comentarioResolucion: 'Ya cubrimos el rol' });
  });
});
