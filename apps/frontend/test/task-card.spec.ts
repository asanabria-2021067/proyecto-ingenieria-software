import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskCard, type TaskCardProps } from '../components/projects/task-card';
import type { TareaPublicaDTO } from '../lib/types/tasks';

// Radix DropdownMenu depende de APIs de puntero que jsdom no implementa; se
// poliyfillan localmente (sin tocar vitest.config).
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
    horasReales: null,
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
    puedeEditar: false,
    estadoPending: false,
    onAbrirDetalles: vi.fn(),
    onAbrirComentarios: vi.fn(),
    onSolicitarEliminar: vi.fn(),
    onEditar: vi.fn(),
    ...overrides,
  };
  const utils = render(createElement(TaskCard, props));
  return { ...utils, props };
}

describe('TaskCard (compacta, Secciones 33-46)', () => {
  afterEach(() => cleanup());

  it('muestra el título de la tarea', () => {
    renderCard({ tarea: tarea({ tituloTarea: 'Configurar CI' }) });
    expect(screen.getByText('Configurar CI')).toBeInTheDocument();
  });

  it('nunca muestra la descripción, aunque la tarea la tenga (Sección 34)', () => {
    renderCard({ tarea: tarea({ descripcionTarea: 'Detalle de la tarea' }) });
    expect(screen.queryByText('Detalle de la tarea')).not.toBeInTheDocument();
  });

  it('muestra la prioridad con texto (Alta/Media/Baja)', () => {
    renderCard({ tarea: tarea({ prioridad: 'ALTA' }) });
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('muestra el rol cuando existe', () => {
    renderCard({ tarea: tarea({ rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend' } }) });
    expect(screen.getByText('Backend')).toBeInTheDocument();
  });

  it('no muestra "Sin rol" cuando la tarea no tiene rol (Sección 40)', () => {
    renderCard({ tarea: tarea({ rolProyecto: null }) });
    expect(screen.queryByText('Sin rol')).not.toBeInTheDocument();
  });

  it('muestra hasta dos etiquetas y resume el resto con "+N" (Sección 41)', () => {
    renderCard({
      tarea: tarea({
        etiquetas: [
          { idEtiqueta: 1, nombreEtiqueta: 'Urgente', nombreNormalizado: 'urgente', color: '#f00' },
          { idEtiqueta: 2, nombreEtiqueta: 'Backend', nombreNormalizado: 'backend', color: '#0f0' },
          { idEtiqueta: 3, nombreEtiqueta: 'Docs', nombreNormalizado: 'docs', color: '#00f' },
          { idEtiqueta: 4, nombreEtiqueta: 'QA', nombreNormalizado: 'qa', color: '#0ff' },
        ],
      }),
    });
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.queryByText('Docs')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('no muestra el nombre del hito en la tarjeta; solo un indicador con tooltip accesible (Sección 45)', () => {
    renderCard({ tarea: tarea({ hito: { idHito: 1, tituloHito: 'Entrega 1' } }) });
    expect(screen.queryByText('Hito · Entrega 1')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hito: Entrega 1')).toBeInTheDocument();
  });

  it('no muestra "Sin hito" ni indicador de hito cuando no existe hito (Sección 45)', () => {
    renderCard({ tarea: tarea({ hito: null }) });
    expect(screen.queryByText('Sin hito')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Hito:/)).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Vencida')).toBeInTheDocument();
  });

  it('una tarea HECHO no se marca como vencida aunque su fecha ya pasó', () => {
    renderCard({ tarea: tarea({ fechaLimite: '2020-01-01', estadoTarea: 'HECHO' }) });
    expect(screen.queryByLabelText('Vencida')).not.toBeInTheDocument();
  });

  it('muestra la cantidad de comentarios y abre el detalle en Comentarios (Sección 44)', () => {
    const onAbrirComentarios = vi.fn();
    renderCard({ tarea: tarea({ tituloTarea: 'Mi tarea', cantidadComentarios: 3 }), onAbrirComentarios });
    const boton = screen.getByRole('button', { name: 'Abrir comentarios de "Mi tarea"' });
    expect(boton).toHaveTextContent('3');
    fireEvent.click(boton);
    expect(onAbrirComentarios).toHaveBeenCalledTimes(1);
  });

  it('al pulsar el título abre el detalle (Sección 46)', () => {
    const onAbrirDetalles = vi.fn();
    renderCard({ tarea: tarea({ tituloTarea: 'Revisar PR' }), onAbrirDetalles });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalles de "Revisar PR"' }));
    expect(onAbrirDetalles).toHaveBeenCalledTimes(1);
  });

  it('no muestra ningún selector de estado permanente en la tarjeta (Sección 48)', () => {
    renderCard({ puedeCambiarEstado: true, tarea: tarea({ tituloTarea: 'Revisar PR' }) });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('la tarjeta ya no tiene el menú de tres puntos: sin botón de acciones ni "Editar/Eliminar/Ver detalles"', () => {
    // La edición, la eliminación y el detalle viven ahora en la vista dedicada
    // de la tarea; la tarjeta solo enlaza al detalle (título) y a los comentarios.
    renderCard({ puedeEditar: true, puedeEliminar: true, tarea: tarea({ tituloTarea: 'X' }) });
    expect(screen.queryByRole('button', { name: 'Acciones de "X"' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ver detalles')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar tarea')).not.toBeInTheDocument();
    expect(screen.queryByText('Eliminar tarea')).not.toBeInTheDocument();
    // Conserva el enlace al detalle y a comentarios.
    expect(screen.getByRole('button', { name: 'Abrir detalles de "X"' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir comentarios de "X"' })).toBeInTheDocument();
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

  describe('handle de arrastre (Tarea 39)', () => {
    it('un usuario autorizado (puedeCambiarEstado) ve el handle con aria-label accesible', () => {
      renderCard({ puedeCambiarEstado: true, tarea: tarea({ tituloTarea: 'Diseñar API' }) });
      expect(
        screen.getByRole('button', { name: 'Mover "Diseñar API" entre estados' }),
      ).toBeInTheDocument();
    });

    it('un tercero sin permiso no ve ningún handle de arrastre', () => {
      renderCard({ puedeCambiarEstado: false });
      expect(screen.queryByRole('button', { name: /Mover .* entre estados/ })).not.toBeInTheDocument();
    });

    it('una tarea bloqueada por una mutation pendiente no muestra el handle', () => {
      renderCard({ puedeCambiarEstado: true, estadoPending: true });
      expect(screen.queryByRole('button', { name: /Mover .* entre estados/ })).not.toBeInTheDocument();
    });

    it('el handle no está anidado dentro de otro <button> ni contiene controles interactivos', () => {
      const { container } = renderCard({ puedeCambiarEstado: true });
      const handle = screen.getByRole('button', { name: /Mover .* entre estados/ });
      expect(handle.closest('button')).toBe(handle);
      expect(handle.querySelector('button, a, [role="menuitem"]')).toBeNull();
      expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    });

    it('la tarjeta comunica aria-busy durante una mutation de estado pendiente', () => {
      const { container } = renderCard({ puedeCambiarEstado: true, estadoPending: true });
      expect(container.querySelector('article')).toHaveAttribute('aria-busy', 'true');
    });

    it('resaltada agrega una descripción accesible de notificación', () => {
      const { container } = renderCard({ resaltada: true, tarea: tarea({ idTarea: 5 }) });
      const article = container.querySelector('article')!;
      expect(article).toHaveAttribute('aria-describedby', 'tarea-resaltada-5');
      expect(screen.getByText('Tarea indicada desde una notificación.')).toBeInTheDocument();
    });

    it('sin resaltar no agrega aria-describedby', () => {
      const { container } = renderCard({ resaltada: false });
      expect(container.querySelector('article')).not.toHaveAttribute('aria-describedby');
    });

    it('registra la ref de la tarjeta y del handle mediante los callbacks provistos', () => {
      const onRegistrarCardRef = vi.fn();
      const onRegistrarHandleRef = vi.fn();
      renderCard({
        puedeCambiarEstado: true,
        tarea: tarea({ idTarea: 9 }),
        onRegistrarCardRef,
        onRegistrarHandleRef,
      });
      expect(onRegistrarCardRef).toHaveBeenCalledWith(9, expect.any(HTMLElement));
      expect(onRegistrarHandleRef).toHaveBeenCalledWith(9, expect.any(HTMLElement));
    });
  });
});
