import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SprintCloseConfirmModal } from '../components/projects/sprint-close-confirm-modal';

describe('SprintCloseConfirmModal', () => {
  afterEach(cleanup);

  const renderModal = (onConfirm = vi.fn()) => {
    render(
      <SprintCloseConfirmModal
        open
        onOpenChange={vi.fn()}
        tareasPendientes={[
          { idTarea: 1, tituloTarea: 'Pendiente' },
          { idTarea: 2, tituloTarea: 'Otra' },
        ]}
        isPending={false}
        onConfirm={onConfirm}
      />,
    );
    return onConfirm;
  };

  it('pasa todas las tareas al siguiente Sprint con un solo clic', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Pasar las 2 tareas al siguiente Sprint' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('SIGUIENTE_SPRINT');
  });

  it('deja las tareas en el backlog con un solo clic', () => {
    const onConfirm = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Dejar en el backlog' }));
    expect(onConfirm).toHaveBeenCalledWith('BACKLOG');
  });
});

describe('SprintCloseConfirmModal (doble clic)', () => {
  afterEach(cleanup);

  it('dos clics seguidos envían el cierre una sola vez', () => {
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
    const boton = screen.getByRole('button', { name: 'Pasar la tarea al siguiente Sprint' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole('button', { name: 'Dejar en el backlog' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('mientras el cierre está pendiente ningún botón envía', () => {
    const onConfirm = vi.fn();
    render(
      <SprintCloseConfirmModal
        open
        onOpenChange={vi.fn()}
        tareasPendientes={[{ idTarea: 1, tituloTarea: 'Pendiente' }]}
        isPending
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: 'Dejar en el backlog' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pasar la tarea al siguiente Sprint' })).toBeDisabled();
  });
});
