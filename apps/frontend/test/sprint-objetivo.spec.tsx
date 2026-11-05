import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/services/sprints', () => ({ updateSprintObjetivo: vi.fn() }));

import { updateSprintObjetivo } from '../lib/services/sprints';
import { SprintObjetivo } from '../components/projects/sprint-objetivo';

const actualizar = vi.mocked(updateSprintObjetivo);

function montar(props: { objetivo?: string | null; puedeEditar: boolean }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SprintObjetivo idProyecto={7} idSprint={3} {...props} />
    </QueryClientProvider>,
  );
}

describe('SprintObjetivo', () => {
  afterEach(() => {
    cleanup();
    actualizar.mockReset();
  });

  it('con objetivo lo muestra arriba del tablero', () => {
    montar({ objetivo: 'Cerrar el módulo de pagos', puedeEditar: false });
    expect(screen.getByText('Cerrar el módulo de pagos')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sin objetivo y sin permiso no aparece nada', () => {
    const { container } = montar({ objetivo: null, puedeEditar: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('sin objetivo el líder solo ve el botón, sin texto', () => {
    montar({ objetivo: null, puedeEditar: true });
    expect(screen.getByRole('button', { name: 'Agregar objetivo' })).toBeInTheDocument();
    expect(screen.queryByText('Objetivo del Sprint')).toBeNull();
  });

  it('el líder guarda un objetivo nuevo', async () => {
    actualizar.mockResolvedValue({ idSprint: 3, objetivo: 'Meta' });
    montar({ objetivo: null, puedeEditar: true });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar objetivo' }));
    fireEvent.change(await screen.findByLabelText('Objetivo'), { target: { value: '  Meta  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actualizar).toHaveBeenCalledWith(7, 3, 'Meta'));
  });

  it('vaciar el campo borra el objetivo', async () => {
    actualizar.mockResolvedValue({ idSprint: 3, objetivo: null });
    montar({ objetivo: 'Meta', puedeEditar: true });
    fireEvent.click(screen.getByRole('button', { name: 'Editar objetivo' }));
    fireEvent.change(await screen.findByLabelText('Objetivo'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actualizar).toHaveBeenCalledWith(7, 3, null));
  });
});
