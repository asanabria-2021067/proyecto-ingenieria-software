import { describe, expect, it } from 'vitest';
import {
  datosDeForm,
  erroresForm,
  etiquetaSemestre,
  filtrosServidor,
  formDesdeRegistro,
  formatearDiaMes,
  formVacio,
  HORAS_FORM_VACIO,
  parseHoras,
  porcentajeAvance,
  textoProyeccion,
  totalesPorAsociacion,
  ultimosSemestres,
} from '../lib/hours/semestre';
import type { AsociacionResumen, TotalesCarrera, TramoProgreso } from '../lib/services/horas-semestre';

const tramo = (p: Partial<TramoProgreso> = {}): TramoProgreso => ({
  meta: 100,
  declaradas: 10,
  acreditadas: 20,
  avance: 30,
  falta: 70,
  fechaProyectada: '2026-11-05',
  enRiesgo: false,
  ...p,
});

const aso = (idAsociacion: number, nombre: string, ids: number[], archivada = false): AsociacionResumen => ({
  idAsociacion,
  nombre,
  archivada,
  carreras: ids.map((idCarrera) => ({ carrera: { idCarrera, nombreCarrera: `C${idCarrera}` } })),
});

const total = (idCarrera: number | null, p: Partial<TotalesCarrera> = {}): TotalesCarrera => ({
  idCarrera,
  carrera: idCarrera ? `C${idCarrera}` : null,
  estudiantes: 2,
  enRiesgo: 1,
  metaBeca: 100,
  becaDeclarada: 10,
  becaAcreditada: 20,
  faltaBeca: 70,
  metaExtension: 40,
  extensionDeclarada: 5,
  extensionAcreditada: 5,
  faltaExtension: 30,
  ...p,
});

describe('textos de semestre', () => {
  it('etiqueta el semestre y formatea dd/mm', () => {
    expect(etiquetaSemestre({ anio: 2026, periodo: 1 })).toBe('1.er semestre 2026');
    expect(etiquetaSemestre({ anio: 2026, periodo: 2 })).toBe('2.º semestre 2026');
    expect(formatearDiaMes('2026-11-05')).toBe('05/11');
  });

  it('proyecta con la fecha del backend', () => {
    expect(textoProyeccion('beca', tramo())).toBe('A este ritmo completas tus horas beca el 05/11');
    expect(textoProyeccion('extension', tramo())).toBe('A este ritmo completas tus horas de extensión el 05/11');
  });

  it('avisa si ya cumplio, si no hay ritmo o si no hay meta', () => {
    expect(textoProyeccion('beca', tramo({ avance: 100, fechaProyectada: '2026-11-01' }))).toMatch(/Ya completaste/);
    expect(textoProyeccion('beca', tramo({ fechaProyectada: null }))).toMatch(/Registra horas/);
    expect(textoProyeccion('beca', tramo({ meta: null }))).toBeNull();
    expect(textoProyeccion('beca', tramo({ meta: 0 }))).toBeNull();
  });

  it('limita el porcentaje a 100 y tolera meta vacia', () => {
    expect(porcentajeAvance(50, 200)).toBe(25);
    expect(porcentajeAvance(300, 200)).toBe(100);
    expect(porcentajeAvance(10, null)).toBe(0);
  });
});

describe('formulario de horas', () => {
  it('vacio es undefined, entero valido es numero, el resto NaN', () => {
    expect(parseHoras('  ')).toBeUndefined();
    expect(parseHoras('0')).toBe(0);
    expect(parseHoras('150')).toBe(150);
    expect(parseHoras('2001')).toBeNaN();
    expect(parseHoras('-1')).toBeNaN();
    expect(parseHoras('1.5')).toBeNaN();
    expect(parseHoras('abc')).toBeNaN();
  });

  it('parte del registro del semestre y, sin registro, de la meta del perfil', () => {
    expect(formDesdeRegistro({ metaBeca: 120, becaDeclarada: 30, metaExtension: null, extensionDeclarada: 0 })).toEqual({
      metaBeca: '120',
      becaDeclarada: '30',
      metaExtension: '',
      extensionDeclarada: '0',
    });
    expect(formDesdeRegistro(null, { horasBecaRequeridas: 150, horasExtensionRequeridas: null })).toEqual({
      ...HORAS_FORM_VACIO,
      metaBeca: '150',
    });
    expect(formDesdeRegistro(null)).toEqual(HORAS_FORM_VACIO);
  });

  it('arma el cuerpo del PUT: meta vacia = null, declaradas vacias = 0', () => {
    expect(datosDeForm(HORAS_FORM_VACIO)).toEqual({ metaBeca: null, becaDeclarada: 0, metaExtension: null, extensionDeclarada: 0 });
    expect(datosDeForm({ metaBeca: '100', becaDeclarada: '12', metaExtension: '40', extensionDeclarada: '3' })).toEqual({
      metaBeca: 100,
      becaDeclarada: 12,
      metaExtension: 40,
      extensionDeclarada: 3,
    });
  });

  it('senala solo los campos invalidos', () => {
    expect(formVacio(HORAS_FORM_VACIO)).toBe(true);
    expect(Object.keys(erroresForm({ ...HORAS_FORM_VACIO, becaDeclarada: '-3', metaBeca: '10' }))).toEqual(['becaDeclarada']);
  });
});

describe('totales por asociacion', () => {
  it('suma las carreras de cada asociacion activa y agrupa el resto', () => {
    const r = totalesPorAsociacion(
      [total(1), total(2, { estudiantes: 3, enRiesgo: 0 }), total(9)],
      [aso(10, 'Zeta', [1, 2]), aso(11, 'Alfa', [2]), aso(12, 'Archivada', [9], true)],
    );
    expect(r.map((t) => t.nombre)).toEqual(['Alfa', 'Zeta', 'Sin asociación']);
    expect(r.find((t) => t.nombre === 'Zeta')).toMatchObject({ estudiantes: 5, enRiesgo: 1, becaAcreditada: 40 });
    expect(r.find((t) => t.nombre === 'Alfa')).toMatchObject({ estudiantes: 3, enRiesgo: 0 });
    expect(r.find((t) => t.nombre === 'Sin asociación')).toMatchObject({ estudiantes: 2 });
  });
});

describe('filtros', () => {
  const ui = { semestre: 'actual', idCarrera: '', idAsociacion: '', enRiesgo: false };

  it('lista los ultimos semestres cruzando el anio', () => {
    expect(ultimosSemestres({ anio: 2026, periodo: 1 }, 3)).toEqual([
      { anio: 2026, periodo: 1 },
      { anio: 2025, periodo: 2 },
      { anio: 2025, periodo: 1 },
    ]);
  });

  it('semestre actual no manda anio ni periodo', () => {
    expect(filtrosServidor(ui, []).filtros).toEqual({});
    expect(filtrosServidor({ ...ui, semestre: '2025-2', enRiesgo: true }, []).filtros).toEqual({
      anio: 2025,
      periodo: 2,
      enRiesgo: true,
    });
  });

  it('una asociacion de una carrera filtra en el servidor; de varias, en el cliente', () => {
    const asociaciones = [aso(1, 'Una', [5]), aso(2, 'Varias', [5, 6])];
    expect(filtrosServidor({ ...ui, idAsociacion: '1' }, asociaciones)).toEqual({ filtros: { idCarrera: 5 }, carrerasPermitidas: null });
    const varias = filtrosServidor({ ...ui, idAsociacion: '2' }, asociaciones);
    expect(varias.filtros).toEqual({});
    expect([...(varias.carrerasPermitidas ?? [])]).toEqual([5, 6]);
    expect(filtrosServidor({ ...ui, idAsociacion: '2', idCarrera: '6' }, asociaciones)).toEqual({
      filtros: { idCarrera: 6 },
      carrerasPermitidas: null,
    });
  });
});
