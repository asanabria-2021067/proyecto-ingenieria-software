import { describe, expect, it } from 'vitest';
import type { EstadoTarea, Prioridad, TareaPublicaDTO } from '../lib/types/tasks';

/**
 * Fija en tiempo de compilación y en runtime la forma real de `TareaPublica`
 * (apps/backend/src/tasks/tasks.service.ts `mapTarea`) para distintos
 * escenarios de negocio. Si el contrato se desvía de estos fixtures,
 * TypeScript falla antes de llegar a los `expect`.
 */
function baseTarea(overrides: Partial<TareaPublicaDTO> = {}): TareaPublicaDTO {
  return {
    idTarea: 1,
    idProyecto: 10,
    idHito: null,
    idRolProyecto: null,
    tituloTarea: 'Implementar login',
    descripcionTarea: null,
    estadoTarea: 'POR_HACER',
    prioridad: 'MEDIA',
    creadaPor: 5,
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

describe('contrato TareaPublicaDTO', () => {
  it('tarea sin rol y sin hito', () => {
    const tarea = baseTarea();
    expect(tarea.idRolProyecto).toBeNull();
    expect(tarea.rolProyecto).toBeNull();
    expect(tarea.idHito).toBeNull();
    expect(tarea.hito).toBeNull();
  });

  it('tarea con rol y con hito', () => {
    const tarea = baseTarea({
      idRolProyecto: 2,
      rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend' },
      idHito: 4,
      hito: { idHito: 4, tituloHito: 'Entrega 1' },
    });
    expect(tarea.rolProyecto).toEqual({ idRolProyecto: 2, nombreRol: 'Backend' });
    expect(tarea.hito).toEqual({ idHito: 4, tituloHito: 'Entrega 1' });
  });

  it('tarea sin asignar', () => {
    const tarea = baseTarea();
    expect(tarea.asignacionActiva).toBeNull();
  });

  it('tarea asignada', () => {
    const tarea = baseTarea({
      asignacionActiva: {
        idAsignacion: 9,
        idUsuario: 3,
        fechaAsignacion: '2026-01-02T00:00:00.000Z',
        usuario: { idUsuario: 3, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null },
      },
    });
    expect(tarea.asignacionActiva?.usuario.idUsuario).toBe(3);
  });

  it('cero etiquetas', () => {
    expect(baseTarea().etiquetas).toEqual([]);
  });

  it('múltiples etiquetas', () => {
    const tarea = baseTarea({
      etiquetas: [
        { idEtiqueta: 1, nombreEtiqueta: 'Urgente', nombreNormalizado: 'urgente', color: '#FF0000' },
        { idEtiqueta: 2, nombreEtiqueta: 'Backend', nombreNormalizado: 'backend', color: '#00FF00' },
      ],
    });
    expect(tarea.etiquetas).toHaveLength(2);
  });

  it('tiempo estimado presente y ausente', () => {
    expect(baseTarea().tiempoEstimadoHoras).toBeNull();
    expect(baseTarea({ tiempoEstimadoHoras: 8 }).tiempoEstimadoHoras).toBe(8);
  });

  it('fechas como string, nunca Date', () => {
    const tarea = baseTarea({ fechaLimite: '2026-12-25', actualizadaEn: '2026-01-05T10:00:00.000Z' });
    expect(typeof tarea.fechaLimite).toBe('string');
    expect(typeof tarea.actualizadaEn).toBe('string');
    expect(typeof tarea.fechaCreacion).toBe('string');
  });

  it('contador de comentarios', () => {
    expect(baseTarea({ cantidadComentarios: 4 }).cantidadComentarios).toBe(4);
  });

  it('acepta los cuatro estados válidos', () => {
    const estados: EstadoTarea[] = ['POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO'];
    for (const estadoTarea of estados) {
      expect(baseTarea({ estadoTarea }).estadoTarea).toBe(estadoTarea);
    }
  });

  it('acepta las tres prioridades válidas', () => {
    const prioridades: Prioridad[] = ['BAJA', 'MEDIA', 'ALTA'];
    for (const prioridad of prioridades) {
      expect(baseTarea({ prioridad }).prioridad).toBe(prioridad);
    }
  });
});
