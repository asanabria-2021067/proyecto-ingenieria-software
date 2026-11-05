import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskCard } from '../components/projects/task-card';
import { TaskChecklist, resumenChecklist } from '../components/projects/task-checklist';
import { TaskEvidence, esEnlaceHttpsValido } from '../components/projects/task-evidence';
import { TaskHistory } from '../components/projects/task-history';
import { parsearChecklist } from '../components/projects/task-templates-dialog';
import {
  candidatosBloqueo,
  extrasIniciales,
  extrasParaCrear,
  extrasParaEditar,
  soloMisTareas,
  valoresDePlantilla,
} from '../lib/tasks/extras';
import { TAREAS_FIXTURE } from '../lib/tasks/task-fixtures';
import type { PlantillaTareaDTO, TareaPublicaDTO } from '../lib/types/tasks';

const servicios = vi.hoisted(() => ({
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  removeChecklistItem: vi.fn(),
  getTaskHistory: vi.fn(),
  getTaskEvidence: vi.fn(),
  addTaskEvidence: vi.fn(),
  removeTaskEvidence: vi.fn(),
  getTaskTemplates: vi.fn(),
  createTaskTemplate: vi.fn(),
  deleteTaskTemplate: vi.fn(),
}));
vi.mock('../lib/services/tasks', () => servicios);

const base = TAREAS_FIXTURE[0];
const tarea = (extra: Partial<TareaPublicaDTO>): TareaPublicaDTO => ({ ...base, ...extra });

function conCliente(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, ui));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('funciones puras de tareas (MEJ-6/47/48/51/52)', () => {
  const t = (idTarea: number, idTareaBloqueante: number | null, asignado?: number) =>
    tarea({
      idTarea,
      tituloTarea: `T${idTarea}`,
      idTareaBloqueante,
      asignacionActiva: asignado
        ? { idAsignacion: 1, idUsuario: asignado, fechaAsignacion: '', usuario: { idUsuario: asignado, nombre: 'A', apellido: 'B', fotoUrl: null } }
        : null,
    });

  it('resumenChecklist calcula hechos, total y porcentaje', () => {
    expect(resumenChecklist([])).toEqual({ hechos: 0, total: 0, porcentaje: 0 });
    const r = resumenChecklist([
      { idItem: 1, texto: 'a', completado: true },
      { idItem: 2, texto: 'b', completado: true },
      { idItem: 3, texto: 'c', completado: false },
    ]);
    expect(r).toEqual({ hechos: 2, total: 3, porcentaje: 67 });
  });

  it('candidatosBloqueo excluye la propia tarea y las que ya dependen de ella (ciclos)', () => {
    // 3 depende de 2, 2 depende de 1: al editar 1 no se ofrecen 2 ni 3.
    const tareas = [t(1, null), t(2, 1), t(3, 2), t(4, null)];
    expect(candidatosBloqueo(tareas, 1).map((x) => x.idTarea)).toEqual([4]);
    expect(candidatosBloqueo(tareas, 4).map((x) => x.idTarea)).toEqual([1, 2, 3]);
    expect(candidatosBloqueo(tareas, null).map((x) => x.idTarea)).toEqual([1, 2, 3, 4]);
  });

  it('candidatosBloqueo no se cuelga con datos cíclicos', () => {
    const tareas = [t(1, 2), t(2, 1), t(3, null)];
    expect(candidatosBloqueo(tareas, 3).map((x) => x.idTarea)).toEqual([1, 2]);
  });

  it('extrasParaCrear solo incluye lo que tiene valor', () => {
    expect(extrasParaCrear({ idTareaBloqueante: null, repeticion: null, checklist: [], idsResponsablesAdicionales: [] })).toEqual({});
    expect(extrasParaCrear({ idTareaBloqueante: 4, repeticion: 'SEMANAL', checklist: ['a'], idsResponsablesAdicionales: [] })).toEqual({
      idTareaBloqueante: 4,
      repeticion: 'SEMANAL',
      checklist: ['a'],
    });
  });

  it('extrasParaEditar envía solo diferencias y null para quitar', () => {
    const original = tarea({ idTareaBloqueante: 4, repeticion: 'DIARIA' });
    expect(extrasParaEditar(original, extrasIniciales(original))).toBeNull();
    expect(extrasParaEditar(original, { ...extrasIniciales(original), idTareaBloqueante: null })).toEqual({ idTareaBloqueante: null });
    expect(extrasParaEditar(original, { ...extrasIniciales(original), repeticion: 'MENSUAL' })).toEqual({ repeticion: 'MENSUAL' });
  });

  it('soloMisTareas filtra por la asignación activa del usuario', () => {
    const tareas = [t(1, null, 7), t(2, null, 8), t(3, null)];
    expect(soloMisTareas(tareas, 7).map((x) => x.idTarea)).toEqual([1]);
    expect(soloMisTareas(tareas, null)).toEqual([]);
  });

  it('valoresDePlantilla rellena el formulario como texto', () => {
    const plantilla: PlantillaTareaDTO = {
      idPlantilla: 1,
      idProyecto: 1,
      nombre: 'Bug',
      tituloTarea: 'Corregir',
      descripcionTarea: null,
      prioridad: 'ALTA',
      tiempoEstimadoHoras: 3,
      checklist: ['a'],
    };
    expect(valoresDePlantilla(plantilla)).toEqual({
      tituloTarea: 'Corregir',
      descripcionTarea: '',
      prioridad: 'ALTA',
      tiempoEstimadoHoras: '3',
    });
    expect(valoresDePlantilla({ ...plantilla, tiempoEstimadoHoras: null }).tiempoEstimadoHoras).toBe('');
  });

  it('parsearChecklist y esEnlaceHttpsValido', () => {
    expect(parsearChecklist(' a \n\n b\n')).toEqual(['a', 'b']);
    expect(esEnlaceHttpsValido('https://example.com/x')).toBe(true);
    expect(esEnlaceHttpsValido('http://example.com')).toBe(false);
    expect(esEnlaceHttpsValido('javascript:alert(1)')).toBe(false);
    expect(esEnlaceHttpsValido('texto')).toBe(false);
  });
});

describe('TaskCard: checklist, bloqueo y repetición', () => {
  const props = {
    puedeCambiarEstado: false,
    estadoPending: false,
    onAbrirDetalles: vi.fn(),
    onAbrirComentarios: vi.fn(),
  };

  it('muestra 2/3 con porcentaje y la barra de avance', () => {
    const { container } = render(
      createElement(TaskCard, {
        ...props,
        tarea: tarea({
          checklist: [
            { idItem: 1, texto: 'a', completado: true },
            { idItem: 2, texto: 'b', completado: true },
            { idItem: 3, texto: 'c', completado: false },
          ],
        }),
      }),
    );
    expect(screen.getByLabelText('Checklist: 2 de 3 completados')).toHaveTextContent('2/3 · 67%');
    expect(container.querySelector('[data-slot="checklist-avance"] [role="progressbar"]')).toBeInTheDocument();
  });

  it('sin checklist no muestra el bloque de avance', () => {
    const { container } = render(createElement(TaskCard, { ...props, tarea: tarea({ checklist: [] }) }));
    expect(container.querySelector('[data-slot="checklist-avance"]')).toBeNull();
  });

  it('muestra «Bloqueada» (con el nombre para lectores) y la repetición', () => {
    render(
      createElement(TaskCard, {
        ...props,
        tarea: tarea({
          bloqueadaPor: { idTarea: 9, tituloTarea: 'Base', estadoTarea: 'EN_PROGRESO' },
          repeticion: 'SEMANAL',
        }),
      }),
    );
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
    expect(screen.getByText(/por Base/)).toHaveClass('sr-only');
    expect(screen.getByText('Cada semana')).toBeInTheDocument();
  });
});

describe('TaskChecklist (MEJ-6)', () => {
  const items = [
    { idItem: 1, texto: 'Diseñar', completado: false },
    { idItem: 2, texto: 'Probar', completado: true },
  ];

  it('quien puede editar marca, agrega y quita elementos', async () => {
    servicios.updateChecklistItem.mockResolvedValue(items);
    servicios.addChecklistItem.mockResolvedValue(items);
    servicios.removeChecklistItem.mockResolvedValue(items);
    conCliente(createElement(TaskChecklist, { idProyecto: 1, idTarea: 5, items, puedeEditar: true, tituloTarea: 'T' }));

    expect(screen.getByLabelText('1 de 2 completados')).toHaveTextContent('1/2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Diseñar' }));
    await waitFor(() => expect(servicios.updateChecklistItem).toHaveBeenCalledWith(1, 5, 1, { completado: true }));

    fireEvent.change(screen.getByLabelText('Nuevo paso del checklist de T'), { target: { value: '  Desplegar ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(servicios.addChecklistItem).toHaveBeenCalledWith(1, 5, 'Desplegar'));

    fireEvent.click(screen.getByRole('button', { name: 'Quitar «Probar» del checklist' }));
    await waitFor(() => expect(servicios.removeChecklistItem).toHaveBeenCalledWith(1, 5, 2));
  });

  it('quien no edita ve la lista sin casillas habilitadas ni formulario', () => {
    conCliente(createElement(TaskChecklist, { idProyecto: 1, idTarea: 5, items, puedeEditar: false, tituloTarea: 'T' }));
    expect(screen.getByRole('checkbox', { name: 'Diseñar' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Agregar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull();
  });

  it('estado vacío con acción para quien edita y mensaje simple para quien no', () => {
    const { unmount } = conCliente(createElement(TaskChecklist, { idProyecto: 1, idTarea: 5, items: [], puedeEditar: true, tituloTarea: 'T' }));
    expect(screen.getByText(/Agrega el primero/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
    unmount();
    conCliente(createElement(TaskChecklist, { idProyecto: 1, idTarea: 5, items: [], puedeEditar: false, tituloTarea: 'T' }));
    expect(screen.getByText('Esta tarea no tiene pasos en su checklist.')).toBeInTheDocument();
  });
});

describe('TaskHistory (MEJ-10)', () => {
  it('lista quién hizo qué', async () => {
    servicios.getTaskHistory.mockResolvedValue([
      {
        idAuditoria: 1,
        tipo: 'TASK_STATUS_CHANGED',
        descripcion: 'movió la tarea de Por hacer a En progreso',
        fecha: '2026-11-10T16:00:00.000Z',
        actor: { idUsuario: 1, nombre: 'Ana', apellido: 'Paz' },
      },
    ]);
    conCliente(createElement(TaskHistory, { idProyecto: 1, idTarea: 5 }));
    expect(await screen.findByText(/movió la tarea de Por hacer a En progreso/)).toBeInTheDocument();
    expect(screen.getByText('Ana Paz')).toBeInTheDocument();
  });

  it('estado vacío y error con reintento', async () => {
    servicios.getTaskHistory.mockResolvedValueOnce([]);
    const { unmount } = conCliente(createElement(TaskHistory, { idProyecto: 1, idTarea: 5 }));
    expect(await screen.findByText(/Todavía no hay movimientos/)).toBeInTheDocument();
    unmount();

    servicios.getTaskHistory.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    conCliente(createElement(TaskHistory, { idProyecto: 1, idTarea: 6 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Todavía no hay movimientos/)).toBeInTheDocument();
  });
});

describe('TaskEvidence (MEJ-49)', () => {
  const evidencia = {
    idEvidencia: 3,
    idTarea: 5,
    idUsuarioCargador: 7,
    tipoEvidencia: 'ENLACE' as const,
    urlRecurso: 'https://example.com/pr',
    descripcion: 'Pull request',
    tamanoBytes: null,
    fechaEnvio: '2026-11-10T16:00:00.000Z',
    cargador: { idUsuario: 7, nombre: 'Luis', apellido: 'Gil' },
  };

  it('muestra el enlace en otra pestaña y solo ofrece quitar al autor o al líder', async () => {
    servicios.getTaskEvidence.mockResolvedValue([evidencia]);
    const { unmount } = conCliente(
      createElement(TaskEvidence, { idProyecto: 1, idTarea: 5, idUsuarioActual: 7, esLider: false, puedeSubir: true }),
    );
    const link = await screen.findByRole('link', { name: /Pull request/ });
    expect(link).toHaveAttribute('href', 'https://example.com/pr');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Quitar evidencia' })).toBeInTheDocument();
    unmount();

    conCliente(createElement(TaskEvidence, { idProyecto: 1, idTarea: 5, idUsuarioActual: 8, esLider: false, puedeSubir: false }));
    await screen.findByRole('link', { name: /Pull request/ });
    expect(screen.queryByRole('button', { name: 'Quitar evidencia' })).toBeNull();
    expect(screen.queryByLabelText('Enlace de la evidencia')).toBeNull();
  });

  it('valida el enlace antes de enviar y sube uno válido', async () => {
    servicios.getTaskEvidence.mockResolvedValue([]);
    servicios.addTaskEvidence.mockResolvedValue(evidencia);
    conCliente(createElement(TaskEvidence, { idProyecto: 1, idTarea: 5, idUsuarioActual: 7, esLider: true, puedeSubir: true }));
    expect(await screen.findByText(/Aún no hay evidencias/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Enlace de la evidencia'), { target: { value: 'http://inseguro.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('https://');
    expect(servicios.addTaskEvidence).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Enlace de la evidencia'), { target: { value: 'https://example.com/pr' } });
    fireEvent.change(screen.getByLabelText('Descripción de la evidencia'), { target: { value: 'PR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));
    await waitFor(() =>
      expect(servicios.addTaskEvidence).toHaveBeenCalledWith(1, 5, {
        tipoEvidencia: 'ENLACE',
        urlRecurso: 'https://example.com/pr',
        descripcion: 'PR',
      }),
    );
  });
});
