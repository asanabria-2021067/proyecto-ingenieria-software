import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SprintCloseConfirmModal } from '../components/projects/sprint-close-confirm-modal';

describe('SprintCloseConfirmModal', () => {
  afterEach(cleanup);

  it('muestra el error junto al selector y permite volver a intentar', () => {
    const onConfirm = vi.fn();
    render(
      <SprintCloseConfirmModal
        open
        onOpenChange={vi.fn()}
        tareasPendientes={[{ idTarea: 1, tituloTarea: 'Pendiente' }]}
        isPending={false}
        onConfirm={onConfirm}
      />,
    );

    const confirmar = screen.getByRole('button', { name: 'Elige un destino para continuar' });
    fireEvent.click(confirmar);
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona el destino de las tareas pendientes.');
    expect(confirmar).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Mover al backlog'));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar y mover 1 tarea al backlog/ }));
    expect(onConfirm).toHaveBeenCalledWith('BACKLOG');
  });
});
