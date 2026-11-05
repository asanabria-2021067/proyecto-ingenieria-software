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
import { validarRespuestas } from '../lib/forms/postulacion';

const PREGUNTAS = [
  { idPregunta: 11, enunciado: '¿Qué experiencia tienes con React?', tipo: 'LARGA', obligatoria: true },
  { idPregunta: 12, enunciado: '¿Tu usuario de GitHub?', tipo: 'CORTA', obligatoria: false },
];
const PROYECTO = {
  idProyecto: 5,
  tituloProyecto: 'Feria de Ciencias',
  roles: [{ idRolProyecto: 9, nombreRol: 'Desarrollo', descripcionRolProyecto: null, carreraRequerida: null, preguntas: PREGUNTAS }],
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

describe('Postulación con preguntas del rol (MEJ-97)', () => {
  it('muestra las preguntas del rol: texto largo como área y corto como campo', async () => {
    renderPagina();
    const larga = await screen.findByLabelText(/¿Qué experiencia tienes con React\?/);
    expect(larga.tagName).toBe('TEXTAREA');
    const corta = screen.getByLabelText(/¿Tu usuario de GitHub\?/);
    expect(corta.tagName).toBe('INPUT');
    expect(screen.getByText('(opcional)')).toBeInTheDocument();
  });

  it('la vista previa no se abre si falta una obligatoria', async () => {
    renderPagina();
    fireEvent.change(await screen.findByLabelText('Justificación', { exact: false }), { target: { value: TEXTO_VALIDO } });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(await screen.findByText('Esta pregunta es obligatoria.')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Vista previa de tu postulación' })).not.toBeInTheDocument();
  });

  it('la vista previa muestra las respuestas y el envío las manda con su idPregunta', async () => {
    renderPagina();
    fireEvent.change(await screen.findByLabelText('Justificación', { exact: false }), { target: { value: TEXTO_VALIDO } });
    fireEvent.change(screen.getByLabelText(/¿Qué experiencia tienes con React\?/), { target: { value: '  Tres años en proyectos de curso  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));

    const tarjeta = await screen.findByRole('article', { name: 'Vista previa de tu postulación' });
    expect(tarjeta).toHaveTextContent('¿Qué experiencia tienes con React?');
    expect(tarjeta).toHaveTextContent('Tres años en proyectos de curso');
    // La opcional sin responder no aparece.
    expect(tarjeta).not.toHaveTextContent('GitHub');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Postulación' }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/postulaciones',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            idRolProyecto: 9,
            justificacion: TEXTO_VALIDO,
            respuestas: [{ idPregunta: 11, respuesta: 'Tres años en proyectos de curso' }],
          }),
        }),
      ),
    );
  });
});

describe('validarRespuestas', () => {
  const preguntas = [
    { idPregunta: 1, tipo: 'CORTA' as const, obligatoria: true },
    { idPregunta: 2, tipo: 'LARGA' as const, obligatoria: false },
  ];

  it('exige las obligatorias con texto real', () => {
    expect(validarRespuestas(preguntas, { 1: '   ' })).toEqual({ 1: 'Esta pregunta es obligatoria.' });
    expect(validarRespuestas(preguntas, { 1: 'ok' })).toEqual({});
  });

  it('respeta 200 caracteres en corta y 2000 en larga', () => {
    expect(validarRespuestas(preguntas, { 1: 'x'.repeat(200), 2: 'x'.repeat(2000) })).toEqual({});
    expect(validarRespuestas(preguntas, { 1: 'x'.repeat(201), 2: 'x'.repeat(2001) })).toEqual({
      1: 'No puede superar 200 caracteres.',
      2: 'No puede superar 2000 caracteres.',
    });
  });
});
