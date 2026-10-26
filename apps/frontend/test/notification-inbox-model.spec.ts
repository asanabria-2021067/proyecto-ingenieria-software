import { describe, expect, it } from 'vitest';
import { Bell, CalendarClock, ClipboardList, Clock3 } from 'lucide-react';
import {
  INBOX_CATEGORIES,
  accionDeAviso,
  agruparPorDia,
  categoriaDeTipo,
  detallesDeAviso,
  estadoDeReunion,
  etiquetaDeDia,
  etiquetaDeTipo,
  fechaCompacta,
  iconoDeTipo,
  origenDeAviso,
  proyectoDeAviso,
} from '../lib/notifications/inbox-model';
import { NOTIFICATION_TYPE_PRESENTATION } from '../lib/notifications/preference-groups';

/** Sprint 10 — bandeja de notificaciones: modelo puro sobre la taxonomía de preferencias. */

const aviso = (tipoNotificacion: string, datosJson: Record<string, unknown> | null = null) => ({ tipoNotificacion, datosJson });

describe('categorías de la bandeja', () => {
  it('son los grupos de preference-groups.ts, cada uno con sus tipos reales y sin «otras»', () => {
    expect(INBOX_CATEGORIES.map((c) => c.id)).toEqual(['tareas', 'postulaciones', 'proyectos', 'horas', 'recordatorios', 'contactos', 'cuenta']);
    const todos = INBOX_CATEGORIES.flatMap((c) => c.tipos);
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos.sort()).toEqual(Object.keys(NOTIFICATION_TYPE_PRESENTATION).sort());
  });

  it('las reuniones de Administración siguen en Recordatorios y calendario', () => {
    const recordatorios = INBOX_CATEGORIES.find((c) => c.id === 'recordatorios');
    expect(recordatorios?.tipos).toEqual(expect.arrayContaining(['REUNION_PROGRAMADA', 'REUNION_ACTUALIZADA', 'REUNION_CANCELADA']));
    expect(categoriaDeTipo('REUNION_CANCELADA')).toBe('recordatorios');
    expect(categoriaDeTipo('TIPO_NUEVO_DESCONOCIDO')).toBe('otras');
  });

  it('etiqueta e icono por tipo, con respaldo para tipos desconocidos', () => {
    expect(etiquetaDeTipo('HORAS_CONSOLIDADAS')).toBe('Horas consolidadas');
    expect(etiquetaDeTipo('ALGO_NUEVO')).toBe('Algo nuevo');
    expect(iconoDeTipo('MENCION_COMENTARIO')).not.toBe(iconoDeTipo('COMENTARIO_TAREA'));
    expect(iconoDeTipo('TAREA_ASIGNADA')).toBe(ClipboardList);
    expect(iconoDeTipo('HORAS_VALIDADAS')).toBe(Clock3);
    expect(iconoDeTipo('REUNION_PROGRAMADA')).toBe(CalendarClock);
    expect(iconoDeTipo('ZZZ')).toBe(Bell);
  });
});

describe('agrupación por día (HU-198)', () => {
  const ahora = new Date(2026, 9, 25, 15, 0, 0);
  const hoy = new Date(2026, 9, 25, 9, 30).toISOString();
  const ayer = new Date(2026, 9, 24, 23, 59).toISOString();
  const antes = new Date(2026, 9, 1, 8, 0).toISOString();
  const otroAno = new Date(2025, 11, 31, 8, 0).toISOString();

  it('Hoy, Ayer y fecha larga; el año solo cuando no es el actual', () => {
    expect(etiquetaDeDia(new Date(hoy), ahora)).toBe('Hoy');
    expect(etiquetaDeDia(new Date(ayer), ahora)).toBe('Ayer');
    expect(etiquetaDeDia(new Date(antes), ahora)).toMatch(/jueves,? 1 de octubre/);
    expect(etiquetaDeDia(new Date(otroAno), ahora)).toMatch(/2025/);
  });

  it('conserva el orden del servidor y junta solo días consecutivos iguales', () => {
    const grupos = agruparPorDia([{ creadaEn: hoy, id: 1 }, { creadaEn: hoy, id: 2 }, { creadaEn: ayer, id: 3 }, { creadaEn: antes, id: 4 }], ahora);
    expect(grupos.map((g) => [g.etiqueta, g.items.map((i) => i.id)])).toEqual([
      ['Hoy', [1, 2]],
      ['Ayer', [3]],
      [etiquetaDeDia(new Date(antes), ahora), [4]],
    ]);
    // Orden ascendente: los mismos grupos invertidos, sin reordenar nada.
    const asc = agruparPorDia([{ creadaEn: antes, id: 4 }, { creadaEn: hoy, id: 1 }], ahora);
    expect(asc.map((g) => g.etiqueta)).toEqual([etiquetaDeDia(new Date(antes), ahora), 'Hoy']);
  });

  it('fecha compacta: hora si es hoy, día y mes si no; vacío si la fecha es inválida', () => {
    expect(fechaCompacta(hoy, ahora)).toMatch(/09:30/);
    expect(fechaCompacta(antes, ahora)).toMatch(/1 oct/);
    expect(fechaCompacta('no-es-fecha', ahora)).toBe('');
  });
});

describe('lectura segura del payload', () => {
  it('proyecto: projectId o idProyecto más projectTitle; nada si no hay ninguno', () => {
    expect(proyectoDeAviso(aviso('X', { projectId: 64, projectTitle: 'Tutorías' }))).toEqual({ id: 64, titulo: 'Tutorías' });
    expect(proyectoDeAviso(aviso('X', { idProyecto: '7' }))).toEqual({ id: 7, titulo: null });
    expect(proyectoDeAviso(aviso('X', { projectId: -1 }))).toBeNull();
    expect(proyectoDeAviso(aviso('X', null))).toBeNull();
  });

  it('origen: nombre del payload, Administración para reuniones, plataforma para cuenta; nunca ids', () => {
    expect(origenDeAviso(aviso('SOLICITUD_AMISTAD', { userName: 'Ana', userId: 9 }))).toBe('Ana');
    expect(origenDeAviso(aviso('REUNION_PROGRAMADA', { meetingId: 3 }))).toBe('Administración');
    expect(origenDeAviso(aviso('ALERTA_SEGURIDAD', { ip: '10.0.0.1' }))).toBe('Plataforma UVGenius');
    expect(origenDeAviso(aviso('TAREA_ASIGNADA', { taskId: 1 }))).toBeNull();
  });

  it('detalles: solo la lista cerrada de campos, en orden, y nunca para Cuenta y seguridad', () => {
    expect(detallesDeAviso(aviso('HORAS_CONSOLIDADAS', { numeroSprint: 3, horasReportadas: '5.00', sprintId: 172, projectId: 64 }))).toEqual([
      { etiqueta: 'Sprint', valor: '3' },
      { etiqueta: 'Horas reportadas', valor: '5.00' },
    ]);
    expect(detallesDeAviso(aviso('REUNION_PROGRAMADA', { eventTitle: 'Seguimiento', fechaInicioTexto: 'lunes 3 a las 10:00', eventId: 5 }))).toEqual([
      { etiqueta: 'Evento', valor: 'Seguimiento' },
      { etiqueta: 'Fecha programada', valor: 'lunes 3 a las 10:00' },
    ]);
    expect(detallesDeAviso(aviso('ALERTA_SEGURIDAD', { eventTitle: 'x', token: 'secreto' }))).toEqual([]);
    expect(detallesDeAviso(aviso('X', { eventTitle: '   ' }))).toEqual([]);
  });

  it('estado de reunión solo para los tres tipos de HU-195', () => {
    expect(estadoDeReunion('REUNION_ACTUALIZADA')).toBe('actualizada');
    expect(estadoDeReunion('RECORDATORIO_EVENTO')).toBeNull();
  });
});

describe('acción de navegación', () => {
  it('usa la misma resolución que la campana y etiqueta el destino', () => {
    expect(accionDeAviso(aviso('REUNION_PROGRAMADA', { meetingId: 1 }))).toEqual({ href: '/dashboard/calendario', etiqueta: 'Ver en calendario' });
    expect(accionDeAviso(aviso('TAREA_ASIGNADA', { projectId: 4, taskId: 9 }))).toEqual({ href: '/dashboard/projects/4/kanban/tasks/9', etiqueta: 'Ver tarea' });
    expect(accionDeAviso(aviso('MENCION_COMENTARIO', { idProyecto: 4, idTarea: 9, idComentario: 2 }))?.etiqueta).toBe('Ver comentario');
    expect(accionDeAviso(aviso('POSTULACION_RESUELTA', { applicationId: 1 }))).toEqual({ href: '/dashboard/mis-postulaciones', etiqueta: 'Ver mis postulaciones' });
  });

  it('una reunión cancelada no enlaza a un evento que ya no existe; sin destino, nada', () => {
    expect(accionDeAviso(aviso('REUNION_CANCELADA', { meetingId: 1 }))).toBeNull();
    expect(accionDeAviso(aviso('HORAS_VALIDADAS', { projectId: 4 }))).toBeNull();
  });
});
