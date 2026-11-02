import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/api/client', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '5', rolId: '9' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt' } }),
}));

import PostularPage from '../app/dashboard/proyectos/[id]/postular/[rolId]/page';

const PROYECTO = {
  idProyecto: 5,
  tituloProyecto: 'Feria de Ciencias',
  roles: [{ idRolProyecto: 9, nombreRol: 'Desarrollo', descripcionRolProyecto: null, carreraRequerida: null }],
};

const TEXTO_VALIDO = 'Tengo experiencia en proyectos similares y mucha motivacion.';

function renderPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(PostularPage)));
}

beforeEach(() => {
  localStorage.clear();
  apiFetchMock.mockImplementation(async (url: string) => {
    if (url === '/proyectos/5') return PROYECTO;
    if (url === '/postulaciones/mis-postulaciones') return [];
    return {};
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function escribir(texto: string) {
  const area = await screen.findByLabelText('Justificación', { exact: false });
  fireEvent.change(area, { target: { value: texto } });
  return area;
}

describe('Postulación: contador, vista previa y borrador (MEJ-4 y MEJ-5)', () => {
  it('el contador dice cuántos caracteres faltan para el mínimo de 40', async () => {
    renderPagina();
    await escribir('x'.repeat(15));
    expect(screen.getByText('Mínimo 40 caracteres: te faltan 25.')).toBeInTheDocument();
    expect(screen.getByText('15 / 1000')).toBeInTheDocument();

    await escribir('x'.repeat(39));
    expect(screen.getByText('Mínimo 40 caracteres: te falta 1.')).toBeInTheDocument();

    await escribir('x'.repeat(40));
    expect(screen.getByText('Cumples el mínimo de caracteres.')).toBeInTheDocument();
  });

  it('con menos de 40 caracteres la vista previa no se abre y muestra el error', async () => {
    renderPagina();
    await escribir('corto');
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(await screen.findByText('La justificación debe tener al menos 40 caracteres.')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Vista previa de tu postulación' })).not.toBeInTheDocument();
  });

  it('la vista previa muestra la postulación como la ve el líder y solo ahí se envía', async () => {
    renderPagina();
    await escribir(TEXTO_VALIDO);
    expect(screen.queryByRole('button', { name: 'Enviar Postulación' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    const tarjeta = await screen.findByRole('article', { name: 'Vista previa de tu postulación' });
    expect(tarjeta).toHaveTextContent('Ana Lopez');
    expect(tarjeta).toHaveTextContent('Desarrollo');
    expect(tarjeta).toHaveTextContent(TEXTO_VALIDO);
    expect(tarjeta).toHaveTextContent('Pendiente');
    expect(apiFetchMock).not.toHaveBeenCalledWith('/postulaciones', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Postulación' }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/postulaciones',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ idRolProyecto: 9, justificacion: TEXTO_VALIDO }) }),
      ),
    );
    expect(await screen.findByText('¡Postulación enviada!')).toBeInTheDocument();
    expect(localStorage.getItem('uvg-borrador:postulacion-5-9')).toBeNull();
  });

  it('«Seguir editando» vuelve al texto sin perderlo', async () => {
    renderPagina();
    await escribir(TEXTO_VALIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    await screen.findByRole('article', { name: 'Vista previa de tu postulación' });

    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('article', { name: 'Vista previa de tu postulación' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Justificación', { exact: false })).toHaveValue(TEXTO_VALIDO);
  });

  it('el texto sobrevive a una recarga y se puede descartar', async () => {
    const primera = renderPagina();
    await escribir(TEXTO_VALIDO);
    await waitFor(() => expect(localStorage.getItem('uvg-borrador:postulacion-5-9')).toContain('experiencia'));
    primera.unmount();

    renderPagina();
    expect(await screen.findByText('Recuperamos un borrador que no habías enviado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Justificación', { exact: false })).toHaveValue(TEXTO_VALIDO));

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(screen.getByLabelText('Justificación', { exact: false })).toHaveValue('');
    expect(localStorage.getItem('uvg-borrador:postulacion-5-9')).toBeNull();
  });
});
