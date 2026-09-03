import type { EstadoTarea, Prioridad, TareaPublicaDTO } from '@/lib/types/tasks';

// Fixtures de T-183: para desarrollar y testear sin depender del backend.
// Cubren los 4 estados, las 3 prioridades y casos sin fecha/asignación/etiquetas.

const asignado = (idUsuario: number, nombre: string, apellido: string): TareaPublicaDTO['asignacionActiva'] => ({
  idAsignacion: idUsuario * 10,
  idUsuario,
  fechaAsignacion: '2026-08-20T09:00:00.000Z',
  usuario: { idUsuario, nombre, apellido, fotoUrl: null },
});

const etiqueta = (idEtiqueta: number, nombre: string, color: string): TareaPublicaDTO['etiquetas'][number] => ({
  idEtiqueta,
  nombreEtiqueta: nombre,
  nombreNormalizado: nombre.toLowerCase(),
  color,
});

function tarea(overrides: Partial<TareaPublicaDTO> & { idTarea: number; tituloTarea: string }): TareaPublicaDTO {
  return {
    idProyecto: 1,
    idHito: null,
    idRolProyecto: null,
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 1,
    fechaCreacion: '2026-08-01T12:00:00.000Z',
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

export const TAREAS_FIXTURE: TareaPublicaDTO[] = [
  tarea({
    idTarea: 101,
    tituloTarea: 'Diseñar esquema de base de datos',
    descripcionTarea: 'Modelar tablas de usuarios, proyectos y tareas',
    estadoTarea: 'HECHO',
    prioridad: 'ALTA',
    fechaLimite: '2026-08-10',
    asignacionActiva: asignado(1, 'Ángel', 'Sanabria'),
    hito: { idHito: 1, tituloHito: 'Fundación del backend' },
    etiquetas: [etiqueta(1, 'Backend', '#2563eb')],
  }),
  tarea({
    idTarea: 102,
    tituloTarea: 'Implementar HorasModule',
    descripcionTarea: 'Service, controller y DTO con validación decimal',
    estadoTarea: 'HECHO',
    prioridad: 'ALTA',
    fechaLimite: '2026-08-15',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
    etiquetas: [etiqueta(1, 'Backend', '#2563eb')],
  }),
  tarea({
    idTarea: 103,
    tituloTarea: 'Construir CerrarParticipacionDialog',
    estadoTarea: 'HECHO',
    prioridad: 'MEDIA',
    fechaLimite: '2026-08-14',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
    etiquetas: [etiqueta(2, 'Frontend', '#16a34a')],
  }),
  tarea({
    idTarea: 104,
    tituloTarea: 'Configurar umbral de cobertura en Vitest',
    estadoTarea: 'EN_REVISION',
    prioridad: 'BAJA',
    fechaLimite: '2026-09-05',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
    etiquetas: [etiqueta(3, 'CI/CD', '#9333ea')],
  }),
  tarea({
    idTarea: 105,
    tituloTarea: 'Contenedor PostgreSQL efímero en CI',
    descripcionTarea: 'Fix de race condition en tests de integración',
    estadoTarea: 'EN_REVISION',
    prioridad: 'ALTA',
    fechaLimite: '2026-09-05',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
    etiquetas: [etiqueta(3, 'CI/CD', '#9333ea')],
  }),
  tarea({
    idTarea: 106,
    tituloTarea: 'Smoke tests E2E con Playwright',
    estadoTarea: 'EN_PROGRESO',
    prioridad: 'MEDIA',
    fechaLimite: '2026-09-08',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
  }),
  tarea({
    idTarea: 107,
    tituloTarea: 'Funciones puras de filtrado y transformación',
    descripcionTarea: 'filterTasksByStatus, searchTasks, sortTasks, paginateTasks',
    estadoTarea: 'EN_PROGRESO',
    prioridad: 'MEDIA',
    fechaLimite: null,
    asignacionActiva: asignado(3, 'Saúl', 'Castillo'),
    etiquetas: [etiqueta(2, 'Frontend', '#16a34a')],
  }),
  tarea({
    idTarea: 108,
    tituloTarea: 'Página nueva con tabla y toolbar',
    descripcionTarea: 'Vista de exploración de tareas en modo lectura',
    estadoTarea: 'EN_PROGRESO',
    prioridad: 'MEDIA',
    fechaLimite: '2026-09-04',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
    etiquetas: [etiqueta(2, 'Frontend', '#16a34a')],
  }),
  tarea({
    idTarea: 109,
    tituloTarea: 'Integración de tabla con Kanban',
    estadoTarea: 'POR_HACER',
    prioridad: 'BAJA',
    fechaLimite: '2026-09-12',
  }),
  tarea({
    idTarea: 110,
    tituloTarea: 'Reporte de gestión de tiempo Sprint 7',
    estadoTarea: 'POR_HACER',
    prioridad: 'BAJA',
    fechaLimite: '2026-09-17',
    asignacionActiva: asignado(2, 'Samuel', 'Robledo'),
  }),
  tarea({
    idTarea: 111,
    tituloTarea: 'Revisar comentarios de PR #205',
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    fechaLimite: null,
    asignacionActiva: asignado(1, 'Ángel', 'Sanabria'),
  }),
  tarea({
    idTarea: 112,
    tituloTarea: 'Preparar UAT con Product Owner',
    estadoTarea: 'POR_HACER',
    prioridad: 'ALTA',
    fechaLimite: '2026-09-16',
    asignacionActiva: asignado(4, 'Derek', 'Coronado'),
  }),
];

export function crearTareaFixture(overrides: Partial<TareaPublicaDTO> & { idTarea: number; tituloTarea: string }) {
  return tarea(overrides);
}

export function generarTareasFixture(cantidad: number): TareaPublicaDTO[] {
  const estados: EstadoTarea[] = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'];
  const prioridades: Prioridad[] = ['ALTA', 'MEDIA', 'BAJA'];
  return Array.from({ length: cantidad }, (_, i) =>
    tarea({
      idTarea: 1000 + i,
      tituloTarea: `Tarea generada #${i + 1}`,
      estadoTarea: estados[i % estados.length],
      prioridad: prioridades[i % prioridades.length],
      fechaLimite: i % 4 === 0 ? null : `2026-09-${String((i % 27) + 1).padStart(2, '0')}`,
    }),
  );
}
