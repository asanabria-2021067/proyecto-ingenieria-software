import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskCard, type TaskCardProps } from '../components/projects/task-card';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// Radix Select/DropdownMenu dependen de APIs de puntero que jsdom no
// implementa; se poliyfillan localmente (sin tocar vitest.config) siguiendo
// el mismo patrón ya usado para Radix Tabs en la Tarea 36.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
});

function tarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Implementar login',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaLimite: null,
    actualizadaEn: null,
    tiempoEstimadoHoras: null,
    asignacionActiva: null,
    rolProyecto: null,
    hito: null,
    etiquetas: [],
    cantidadComentarios: 0,
    ...overrides,
  };
}

function renderCard(overrides: Partial<TaskCardProps> = {}) {
  const props: TaskCardProps = {
    tarea: tarea(),
    puedeCambiarEstado: false,
    puedeEliminar: false,
    estadoPending: false,
    estadoError: null,
    onCambiarEstado: vi.fn(),
    onAbrirComentarios: vi.fn(),
    onSolicitarEliminar: vi.fn(),
    ...overrides,
  };
  const utils = render(createElement(TaskCard, props));
  return { ...utils, props };
}

describe('TaskCard', () => {
  afterEach(() => cleanup());

  it('muestra el título de la tarea', () => {
    renderCard({ tarea: tarea({ tituloTarea: 'Configurar CI' }) });
    expect(screen.getByText('Configurar CI')).toBeInTheDocument();
  });

  it('muestra la descripción cuando está presente', () => {
    renderCard({ tarea: tarea({ descripcionTarea: 'Detalle de la tarea' }) });
    expect(screen.getByText('Detalle de la tarea')).toBeInTheDocument();
  });

  it('no muestra bloque de descripción cuando está ausente', () => {
    const { container } = renderCard({ tarea: tarea({ descripcionTarea: null }) });
    expect(container.querySelector('p.line-clamp-2')).not.toBeInTheDocument();
  });

  it('muestra la prioridad con texto (Alta/Media/Baja)', () => {
    renderCard({ tarea: tarea({ prioridad: 'ALTA' }) });
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('muestra el rol cuando existe', () => {
    renderCard({ tarea: tarea({ rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' } }) });
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('muestra múltiples etiquetas', () => {
    renderCard({
      tarea: tarea({
        etiquetas: [
          { idEtiqueta: 1, nombreEtiqueta: 'Urgente', nombreNormalizado: 'urgente', color: '#f00' },
          { idEtiqueta: 2, nombreEtiqueta: 'Backend', nombreNormalizado: 'backend', color: '#0f0' },
        ],
      }),
    });
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('muestra el hito con texto real', () => {
    renderCard({ tarea: tarea({ hito: { idHito: 1, tituloHito: 'Entrega 1' } }) });
    expect(screen.getByText('Hito · Entrega 1')).toBeInTheDocument();
  });

  it('muestra "Sin hito" cuando no existe hito', () => {
    renderCard({ tarea: tarea({ hito: null }) });
    expect(screen.getByText('Sin hito')).toBeInTheDocument();
  });

  it('muestra el nombre del asignado activo', () => {
    renderCard({
      tarea: tarea({
        asignacionActiva: {
          idAsignacion: 1,
          idUsuario: 5,
          fechaAsignacion: '2026-01-01T00:00:00.000Z',
          usuario: { idUsuario: 5, nombre: 'Ana', apellido: 'Lopez', fotoUrl: null },
        },
      }),
    });
    expect(screen.getByText('Ana Lopez')).toBeInTheDocument();
  });

  it('muestra "Sin asignar" cuando no hay asignación activa', () => {
    renderCard({ tarea: tarea({ asignacionActiva: null }) });
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
  });

  it('muestra la fecha límite formateada', () => {
    renderCard({ tarea: tarea({ fechaLimite: '2026-12-25', estadoTarea: 'POR_HACER' }) });
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it('muestra "Sin fecha" cuando no hay fecha límite', () => {
    renderCard({ tarea: tarea({ fechaLimite: null }) });
    expect(screen.getByText('Sin fecha')).toBeInTheDocument();
  });

  it('identifica una tarea vencida de forma accesible', () => {
    renderCard({ tarea: tarea({ fechaLimite: '2020-01-01', estadoTarea: 'EN_PROGRESO' }) });
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });

  it('una tarea HECHO no se marca como vencida aunque su fecha ya pasó', () => {
    renderCard({ tarea: tarea({ fechaLimite: '2020-01-01', estadoTarea: 'HECHO' }) });
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument();
  });

  it('muestra la cantidad de comentarios con nombre accesible', () => {
    renderCard({ tarea: tarea({ tituloTarea: 'Mi tarea', cantidadComentarios: 3 }) });
    expect(screen.getByRole('button', { name: 'Abrir 3 comentarios de "Mi tarea"' })).toBeInTheDocument();
  });

  it('abre el diálogo de comentarios al activar el control de comentarios', () => {
    const onAbrirComentarios = vi.fn();
    renderCard({ tarea: tarea({ cantidadComentarios: 2 }), onAbrirComentarios });
    fireEvent.click(screen.getByRole('button', { name: /abrir 2 comentarios/i }));
    expect(onAbrirComentarios).toHaveBeenCalledTimes(1);
  });

  it('muestra el selector de estado cuando el actor tiene permiso (líder o asignado)', () => {
    renderCard({ puedeCambiarEstado: true, tarea: tarea({ tituloTarea: 'Revisar PR' }) });
    expect(screen.getByRole('combobox', { name: 'Cambiar estado de "Revisar PR"' })).toBeInTheDocument();
  });

  it('no muestra el selector de estado para un tercero sin permiso', () => {
    renderCard({ puedeCambiarEstado: false });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('el menú de eliminar solo aparece cuando puedeEliminar es true', async () => {
    renderCard({ puedeEliminar: true, tarea: tarea({ tituloTarea: 'X' }) });
    const trigger = screen.getByRole('button', { name: 'Acciones de "X"' });
    trigger.focus();
    // Radix DropdownMenu abre en `onPointerDown`; jsdom no dispara pointer
    // events reales con fireEvent.click, así que se activa por teclado
    // (Enter), que es además la vía de acceso por teclado que exige la
    // Tarea 37.
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(await screen.findByText('Eliminar tarea')).toBeInTheDocument();
  });

  it('el menú no ofrece eliminar cuando puedeEliminar es false', async () => {
    renderCard({ puedeEliminar: false, tarea: tarea({ tituloTarea: 'X' }) });
    const trigger = screen.getByRole('button', { name: 'Acciones de "X"' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(await screen.findByText('Ver comentarios')).toBeInTheDocument();
    expect(screen.queryByText('Eliminar tarea')).not.toBeInTheDocument();
  });

  it('muestra un error accesible (role="alert") cuando falla el cambio de estado', () => {
    renderCard({ puedeCambiarEstado: true, estadoError: 'No se pudo cambiar el estado.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cambiar el estado.');
  });

  it('deshabilita el selector durante el estado pending', () => {
    renderCard({ puedeCambiarEstado: true, estadoPending: true });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('ningún <button> contiene otro <button> (estructura no anidada)', () => {
    const { container } = renderCard({
      puedeCambiarEstado: true,
      puedeEliminar: true,
      tarea: tarea({ cantidadComentarios: 1 }),
    });
    const botones = Array.from(container.querySelectorAll('button'));
    for (const boton of botones) {
      expect(boton.querySelector('button')).toBeNull();
    }
  });

  it('la tarjeta raíz es un <article>, no un <button>', () => {
    const { container } = renderCard();
    const article = container.querySelector('article');
    expect(article).toBeInTheDocument();
    expect(article?.tagName).toBe('ARTICLE');
  });
});
