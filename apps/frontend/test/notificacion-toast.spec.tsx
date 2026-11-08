import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const push = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { dismiss, custom: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { NotificacionToast, categoriaDeAviso, severidadDeAviso, tiempoRelativo } from '../components/notifications/notificacion-toast';

const aviso = (tipoNotificacion: string, extra: Record<string, unknown> = {}) => ({
  tipoNotificacion,
  tituloNotificacion: 'Titulo',
  mensajeNotificacion: 'Mensaje',
  datosJson: extra,
});

const CASOS: Array<[string, string, string]> = [
  ['TAREA_ASIGNADA', 'tarea', 'bg-tag-blue'],
  ['MENCION_COMENTARIO', 'mencion', 'bg-tag-violet'],
  ['COMENTARIO_TAREA', 'mencion', 'bg-tag-violet'],
  ['NUEVA_POSTULACION', 'postulacion', 'bg-tag-turquoise'],
  ['CIERRE_APROBADO', 'cierre', 'bg-tag-closed'],
  ['MENCION_CHAT', 'chat', 'bg-tag-green'],
  ['INVITACION_ORGANIZACION', 'organizacion', 'bg-tag-forest'],
  ['HORAS_VALIDADAS', 'horas', 'bg-tag-amber'],
  ['ALGO_NUEVO', 'sistema', 'bg-tag-slate'],
];

describe('NotificacionToast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each(CASOS)('%s -> categoria %s con acento %s', (tipo, categoria, clase) => {
    expect(categoriaDeAviso(tipo)).toBe(categoria);
    render(<NotificacionToast id="t" aviso={aviso(tipo)} href="/x" />);
    const raiz = document.querySelector('[data-slot="notificacion-toast"]')!;
    expect(raiz).toHaveAttribute('data-categoria', categoria);
    expect(raiz.querySelector('[data-slot="notificacion-toast-icono"]')).toHaveClass(clase);
    expect(raiz.querySelector('svg')).toBeInTheDocument();
  });

  it('botón principal por categoría y override', () => {
    const { rerender } = render(<NotificacionToast id="t" aviso={aviso('MENCION_CHAT')} href="/c" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat' }));
    expect(push).toHaveBeenCalledWith('/c');
    expect(dismiss).toHaveBeenCalledWith('t');
    rerender(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} href="/t" accion="Ver mi tarea" />);
    expect(screen.getByRole('button', { name: 'Ver mi tarea' })).toBeInTheDocument();
  });

  it('sin enlace no hay botón principal', () => {
    render(<NotificacionToast id="t" aviso={aviso('ALGO_NUEVO')} />);
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar como leída' })).toBeNull();
  });

  it('avatar con iniciales de quien lo originó', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA', { assignedBy: 'Luis Gómez' })} />);
    expect(screen.getByText('LG')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="notificacion-toast-avatar"]')).toBeInTheDocument();
  });

  it('sin actor no hay avatar', () => {
    render(<NotificacionToast id="t" aviso={aviso('HORAS_VALIDADAS')} />);
    expect(document.querySelector('[data-slot="notificacion-toast-avatar"]')).toBeNull();
  });

  it('mensaje a 2 líneas máximo', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    expect(screen.getByText('Mensaje')).toHaveClass('line-clamp-2');
  });

  it('tiempo relativo', () => {
    expect(tiempoRelativo(0, 10_000)).toBe('hace un momento');
    expect(tiempoRelativo(0, 5 * 60_000)).toBe('hace 5 min');
    expect(tiempoRelativo(0, 3 * 3_600_000)).toBe('hace 3 h');
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    expect(screen.getByText('hace un momento')).toBeInTheDocument();
  });

  it('botón cerrar con nombre accesible', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(dismiss).toHaveBeenCalledWith('t');
  });

  it('se cierra solo a los 8 s', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    act(() => vi.advanceTimersByTime(7_900));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(dismiss).toHaveBeenCalledWith('t');
  });

  it('el hover pausa el temporizador y la barra, y al salir sigue con lo que quedaba', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    const raiz = document.querySelector('[data-slot="notificacion-toast"]')!;
    const barra = document.querySelector<HTMLElement>('[data-slot="notificacion-toast-progreso"]')!;
    act(() => vi.advanceTimersByTime(4_000));
    fireEvent.mouseEnter(raiz);
    expect(raiz).toHaveAttribute('data-pausado');
    expect(barra.style.transform).toBe('scaleX(0.5)');
    act(() => vi.advanceTimersByTime(60_000));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(raiz);
    act(() => vi.advanceTimersByTime(3_900));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(dismiss).toHaveBeenCalledWith('t');
  });

  it('el foco dentro también pausa', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} href="/t" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Ver tarea' }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('movimiento reducido: sin animación de entrada y barra oculta', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_ASIGNADA')} />);
    expect(document.querySelector('[data-slot="notificacion-toast"]')).toHaveClass('animate-in', 'motion-reduce:animate-none');
    expect(document.querySelector('[data-slot="notificacion-toast-progreso"]')!.parentElement).toHaveClass('motion-reduce:hidden');
  });
});

// [tipo, datos, severidad, role (null = el de la región polite de sonner), duración, chip, acento]
const SEVERIDADES: Array<[string, Record<string, unknown>, string, 'alert' | null, string, string | null, string | null]> = [
  ['TAREA_ASIGNADA', { projectId: 1, taskId: 2 }, 'info', null, '8000', null, null],
  ['TU_SEMANA', {}, 'neutral', null, '8000', null, null],
  ['ALGO_NUEVO', {}, 'neutral', null, '8000', null, null],
  ['HORAS_VALIDADAS', {}, 'exito', null, '8000', 'Listo', 'border-l-on-tag-success'],
  ['POSTULACION_RESUELTA', { accepted: true }, 'exito', null, '8000', 'Aceptada', 'border-l-on-tag-success'],
  ['POSTULACION_RESUELTA', { accepted: false }, 'alerta', null, '12000', 'Rechazada', 'border-l-on-tag-amber'],
  ['TAREA_POR_VENCER', { projectId: 1, taskId: 2, horasAntes: 24 }, 'alerta', null, '12000', 'Por vencer', 'border-l-on-tag-amber'],
  ['NUEVO_INICIO_SESION', {}, 'alerta', null, '12000', 'Seguridad', 'border-l-on-tag-amber'],
  ['HORAS_EN_RIESGO', {}, 'alerta', null, '12000', 'En riesgo', 'border-l-on-tag-amber'],
  ['HITO_ATRASADO', { projectId: 1 }, 'urgente', 'alert', 'fija', 'Atrasado', 'border-l-on-tag-red'],
  ['ALERTA_SEGURIDAD', {}, 'urgente', 'alert', 'fija', 'Urgente', 'border-l-on-tag-red'],
];

describe('NotificacionToast - severidad', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each(SEVERIDADES)('%s %j -> %s', (tipo, datos, nivel, rol, duracion, chip, acento) => {
    expect(severidadDeAviso(aviso(tipo, datos)).nivel).toBe(nivel);
    render(<NotificacionToast id="t" aviso={aviso(tipo, datos)} href="/x" />);
    const raiz = document.querySelector('[data-slot="notificacion-toast"]')!;
    if (rol) expect(raiz).toHaveAttribute('role', rol);
    else expect(raiz).not.toHaveAttribute('role');
    expect(raiz).not.toHaveAttribute('aria-live');
    expect(raiz).toHaveAttribute('data-severidad', nivel);
    expect(raiz).toHaveAttribute('data-duracion', duracion);
    const etiqueta = raiz.querySelector('[data-slot="notificacion-toast-severidad"]');
    if (chip) expect(etiqueta).toHaveTextContent(chip);
    else expect(etiqueta).toBeNull();
    if (acento) expect(raiz).toHaveClass(acento);
    expect(screen.queryByRole('button', { name: 'Marcar como leída' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeInTheDocument();
  });

  it('alerta: sigue a los 8 s y se cierra a los 12 s', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_POR_VENCER', { projectId: 1, taskId: 2 })} href="/x" />);
    act(() => vi.advanceTimersByTime(11_900));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(dismiss).toHaveBeenCalledWith('t');
  });

  it('urgente: no se cierra solo y no hay barra de progreso', () => {
    render(<NotificacionToast id="t" aviso={aviso('HITO_ATRASADO', { projectId: 1 })} href="/x" />);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(dismiss).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="notificacion-toast-progreso"]')).toBeNull();
  });

  it('tarea por vencer: botón Ver tarea al detalle', () => {
    render(<NotificacionToast id="t" aviso={aviso('TAREA_POR_VENCER')} href="/dashboard/projects/1/kanban/tasks/2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tarea' }));
    expect(push).toHaveBeenCalledWith('/dashboard/projects/1/kanban/tasks/2');
  });
});
