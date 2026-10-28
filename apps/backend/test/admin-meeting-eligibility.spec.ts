import { describe, expect, it } from 'vitest';
import { EstadoProyecto } from '@prisma/client';
import {
  motivoNoElegible,
  sumarMesesCalendario,
  ventanaPoscierre,
} from '../src/events/admin-meeting-eligibility';

/** Instante de Guatemala (UTC-6) escrito como hora local. */
const gt = (local: string) => new Date(`${local}-06:00`);

describe('HU-195 · sumarMesesCalendario (hora de Guatemala)', () => {
  it('suma dos meses calendario conservando la hora local', () => {
    expect(sumarMesesCalendario(gt('2026-10-15T12:00:00'), 2)).toEqual(gt('2026-12-15T12:00:00'));
  });

  it('recorta al último día del mes destino', () => {
    expect(sumarMesesCalendario(gt('2026-10-31T09:30:00'), 1)).toEqual(gt('2026-11-30T09:30:00'));
    expect(sumarMesesCalendario(gt('2026-12-31T23:59:00'), 2)).toEqual(gt('2027-02-28T23:59:00'));
  });

  it('respeta el 29 de febrero en año bisiesto', () => {
    expect(sumarMesesCalendario(gt('2027-12-31T10:00:00'), 2)).toEqual(gt('2028-02-29T10:00:00'));
  });

  it('cruza el cambio de año', () => {
    expect(sumarMesesCalendario(gt('2026-11-20T08:00:00'), 2)).toEqual(gt('2027-01-20T08:00:00'));
  });

  it('cuenta el día local de Guatemala aunque en UTC ya sea el día siguiente', () => {
    // 31-oct 20:00 en Guatemala = 1-nov 02:00 UTC: el mes base es octubre.
    expect(sumarMesesCalendario(gt('2026-10-31T20:00:00'), 1)).toEqual(gt('2026-11-30T20:00:00'));
  });

  it('no son 60 días: de enero a marzo hay 59 días', () => {
    const inicio = gt('2027-01-01T00:00:00');
    const fin = sumarMesesCalendario(inicio, 2);
    expect((fin.getTime() - inicio.getTime()) / 86_400_000).toBe(59);
  });
});

describe('HU-195 · motivoNoElegible', () => {
  const cierre = gt('2026-10-15T12:00:00');
  const cerrado = { estadoProyecto: EstadoProyecto.CERRADO, eliminadoEn: null, cierreOficial: cierre };
  const rango = (inicio: string, fin: string) => ({ fechaInicio: gt(inicio), fechaFin: gt(fin) });

  it('PUBLICADO y EN_PROGRESO son elegibles sin ventana', () => {
    for (const estadoProyecto of [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO]) {
      expect(motivoNoElegible({ estadoProyecto, eliminadoEn: null, cierreOficial: null }, rango('2031-01-01T10:00:00', '2031-01-01T11:00:00'), gt('2031-01-01T00:00:00'))).toBeNull();
    }
  });

  it('CANCELADO, BORRADOR, EN_REVISION, OBSERVADO y EN_SOLICITUD_CIERRE no son elegibles', () => {
    for (const estadoProyecto of ['CANCELADO', 'BORRADOR', 'EN_REVISION', 'OBSERVADO', 'EN_SOLICITUD_CIERRE'] as const) {
      expect(motivoNoElegible({ estadoProyecto, eliminadoEn: null, cierreOficial: null }, rango('2026-11-01T10:00:00', '2026-11-01T11:00:00'))).toBe('ESTADO_NO_ELEGIBLE');
    }
  });

  it('un proyecto eliminado nunca es elegible, aunque esté activo', () => {
    expect(motivoNoElegible({ estadoProyecto: EstadoProyecto.EN_PROGRESO, eliminadoEn: new Date(), cierreOficial: null }, rango('2026-11-01T10:00:00', '2026-11-01T11:00:00'))).toBe('PROYECTO_ELIMINADO');
  });

  it('CERRADO sin cierre oficial verificable no se adivina', () => {
    expect(motivoNoElegible({ ...cerrado, cierreOficial: null }, rango('2026-11-01T10:00:00', '2026-11-01T11:00:00'))).toBe('SIN_FECHA_OFICIAL_CIERRE');
  });

  it('CERRADO hace un mes: elegible si creación, inicio y fin caen en la ventana', () => {
    expect(motivoNoElegible(cerrado, rango('2026-11-20T10:00:00', '2026-11-20T11:00:00'), gt('2026-11-15T08:00:00'))).toBeNull();
  });

  it('el límite final es inclusivo: fin exactamente en cierre + 2 meses', () => {
    expect(ventanaPoscierre(cierre).hasta).toEqual(gt('2026-12-15T12:00:00'));
    expect(motivoNoElegible(cerrado, rango('2026-12-15T11:00:00', '2026-12-15T12:00:00'), gt('2026-12-01T08:00:00'))).toBeNull();
  });

  it('empieza dentro pero termina después del vencimiento: fuera', () => {
    expect(motivoNoElegible(cerrado, rango('2026-12-15T11:30:00', '2026-12-15T12:00:01'), gt('2026-12-01T08:00:00'))).toBe('FUERA_DE_VENTANA_POSCIERRE');
  });

  it('cerrado hace 2 meses y 1 día: la convocatoria nueva ya no es posible', () => {
    expect(motivoNoElegible(cerrado, rango('2026-12-20T10:00:00', '2026-12-20T11:00:00'), gt('2026-12-16T12:00:00'))).toBe('FUERA_DE_VENTANA_POSCIERRE');
  });

  it('una reunión que empieza antes del cierre oficial no es válida para el proyecto cerrado', () => {
    expect(motivoNoElegible(cerrado, rango('2026-10-15T11:00:00', '2026-10-15T13:00:00'))).toBe('FUERA_DE_VENTANA_POSCIERRE');
  });

  it('al reprogramar (sin `ahora`) solo se validan inicio y fin', () => {
    // Creada cuando era válida; la reprogramación se evalúa contra la ventana.
    expect(motivoNoElegible(cerrado, rango('2026-12-10T10:00:00', '2026-12-10T11:00:00'))).toBeNull();
    expect(motivoNoElegible(cerrado, rango('2026-12-16T10:00:00', '2026-12-16T11:00:00'))).toBe('FUERA_DE_VENTANA_POSCIERRE');
  });
});
