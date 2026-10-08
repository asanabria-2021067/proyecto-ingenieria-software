import { describe, expect, it } from 'vitest';
import {
  clasificarSolicitudCierre,
  type RevisionCierreResumen,
} from '../src/project-closure/closure-request-situation';

/** Revisión mínima: el id repite el número para leer los casos de un vistazo. */
function rev(numero: number, estado: string, fechas: Partial<Pick<RevisionCierreResumen, 'enviadaEn' | 'resueltaEn'>> = {}): RevisionCierreResumen {
  return { idRevisionCierre: numero * 10, numeroRevision: numero, estadoRevision: estado, enviadaEn: null, resueltaEn: null, ...fechas };
}

const ENVIO = new Date('2026-10-01T15:00:00.000Z');
const VEREDICTO = new Date('2026-10-03T15:00:00.000Z');

describe('clasificarSolicitudCierre', () => {
  it('A: una primera solicitud ENVIADA está pendiente de evaluación y es resoluble', () => {
    expect(clasificarSolicitudCierre([rev(1, 'ENVIADA', { enviadaEn: ENVIO })])).toEqual({
      situacion: 'PENDIENTE_DE_EVALUACION',
      origen: 'PRIMERA_SOLICITUD',
      revisionId: 10,
      numeroRevision: 1,
      enviadaEn: ENVIO,
      correccionSolicitadaEn: null,
      puedeResolver: true,
    });
  });

  it('B: una ENVIADA tras una CORRECCION_DOCUMENTAL es un reenvío y recuerda cuándo se pidió la corrección', () => {
    const resultado = clasificarSolicitudCierre([
      rev(1, 'CORRECCION_DOCUMENTAL', { enviadaEn: ENVIO, resueltaEn: VEREDICTO }),
      rev(2, 'ENVIADA', { enviadaEn: ENVIO }),
    ]);
    expect(resultado).toMatchObject({
      situacion: 'REENVIADA_PARA_REVISION',
      origen: null,
      revisionId: 20,
      numeroRevision: 2,
      correccionSolicitadaEn: VEREDICTO,
      puedeResolver: true,
    });
  });

  it('C: un BORRADOR vigente tras una corrección espera al responsable y no admite veredicto', () => {
    const resultado = clasificarSolicitudCierre([
      rev(1, 'CORRECCION_DOCUMENTAL', { enviadaEn: ENVIO, resueltaEn: VEREDICTO }),
      rev(2, 'BORRADOR'),
    ]);
    expect(resultado).toEqual({
      situacion: 'EN_ESPERA_DE_CORRECCIONES',
      origen: null,
      revisionId: 20,
      numeroRevision: 2,
      enviadaEn: null,
      correccionSolicitadaEn: VEREDICTO,
      puedeResolver: false,
    });
  });

  it('D: un proyecto sin ninguna revisión es legacy; no se le inventa envío ni fecha', () => {
    expect(clasificarSolicitudCierre([])).toEqual({
      situacion: 'SIN_ENTREGA_FORMAL',
      origen: null,
      revisionId: null,
      numeroRevision: null,
      enviadaEn: null,
      correccionSolicitadaEn: null,
      puedeResolver: false,
    });
  });

  it('E: una solicitud nueva tras DEVUELTA_A_EJECUCION es pendiente, NO reenviada, aunque su número sea mayor que 1', () => {
    const resultado = clasificarSolicitudCierre([
      rev(1, 'DEVUELTA_A_EJECUCION', { enviadaEn: ENVIO, resueltaEn: VEREDICTO }),
      rev(2, 'ENVIADA', { enviadaEn: ENVIO }),
    ]);
    expect(resultado.numeroRevision).toBe(2);
    expect(resultado.situacion).toBe('PENDIENTE_DE_EVALUACION');
    expect(resultado.origen).toBe('NUEVA_SOLICITUD_TRAS_DEVOLUCION');
    expect(resultado.correccionSolicitadaEn).toBeNull();
  });

  it('F: con varias correcciones seguidas manda la última ronda', () => {
    const segunda = new Date('2026-10-05T15:00:00.000Z');
    const historia = [
      rev(1, 'CORRECCION_DOCUMENTAL', { enviadaEn: ENVIO, resueltaEn: VEREDICTO }),
      rev(2, 'CORRECCION_DOCUMENTAL', { enviadaEn: ENVIO, resueltaEn: segunda }),
    ];
    expect(clasificarSolicitudCierre([...historia, rev(3, 'ENVIADA', { enviadaEn: ENVIO })])).toMatchObject({
      situacion: 'REENVIADA_PARA_REVISION',
      numeroRevision: 3,
      correccionSolicitadaEn: segunda,
    });
    expect(clasificarSolicitudCierre([...historia, rev(3, 'BORRADOR')])).toMatchObject({
      situacion: 'EN_ESPERA_DE_CORRECCIONES',
      numeroRevision: 3,
      correccionSolicitadaEn: segunda,
    });
  });

  it('F: una corrección tras una devolución anterior sigue siendo un reenvío', () => {
    const resultado = clasificarSolicitudCierre([
      rev(1, 'DEVUELTA_A_EJECUCION', { resueltaEn: VEREDICTO }),
      rev(2, 'CORRECCION_DOCUMENTAL', { resueltaEn: VEREDICTO }),
      rev(3, 'ENVIADA', { enviadaEn: ENVIO }),
    ]);
    expect(resultado.situacion).toBe('REENVIADA_PARA_REVISION');
  });

  it('G: una revisión APROBADA en un proyecto que sigue en solicitud de cierre no se clasifica', () => {
    const resultado = clasificarSolicitudCierre([
      rev(1, 'APROBADA', { enviadaEn: ENVIO, resueltaEn: VEREDICTO }),
      rev(2, 'ENVIADA', { enviadaEn: ENVIO }),
    ]);
    expect(resultado.situacion).toBe('SIN_CLASIFICACION');
    expect(resultado.puedeResolver).toBe(false);
  });

  it.each([
    ['solo una corrección sin borrador ni reenvío', [rev(1, 'CORRECCION_DOCUMENTAL', { resueltaEn: VEREDICTO })]],
    ['solo una devolución (el proyecto debería estar en ejecución)', [rev(1, 'DEVUELTA_A_EJECUCION', { resueltaEn: VEREDICTO })]],
    ['un borrador que no nace de una corrección', [rev(1, 'BORRADOR')]],
    ['un borrador tras una devolución', [rev(1, 'DEVUELTA_A_EJECUCION', { resueltaEn: VEREDICTO }), rev(2, 'BORRADOR')]],
  ])('I: %s queda SIN_CLASIFICACION, nunca en una etapa normal', (_caso, cadena) => {
    expect(clasificarSolicitudCierre(cadena)).toMatchObject({ situacion: 'SIN_CLASIFICACION', puedeResolver: false, revisionId: null });
  });

  it('J: si conviven ENVIADA y BORRADOR gana la ENVIADA, en cualquier orden de numeración', () => {
    const correccion = rev(1, 'CORRECCION_DOCUMENTAL', { resueltaEn: VEREDICTO });
    const enviadaDespues = clasificarSolicitudCierre([correccion, rev(2, 'BORRADOR'), rev(3, 'ENVIADA', { enviadaEn: ENVIO })]);
    const enviadaAntes = clasificarSolicitudCierre([correccion, rev(2, 'ENVIADA', { enviadaEn: ENVIO }), rev(3, 'BORRADOR')]);

    for (const resultado of [enviadaDespues, enviadaAntes]) {
      expect(resultado.situacion).toBe('REENVIADA_PARA_REVISION');
      expect(resultado.puedeResolver).toBe(true);
    }
    expect(enviadaDespues.revisionId).toBe(30);
    expect(enviadaAntes.revisionId).toBe(20);
  });

  it('K: con numeración no consecutiva se usa la revisión resuelta más cercana por debajo', () => {
    expect(
      clasificarSolicitudCierre([rev(1, 'CORRECCION_DOCUMENTAL', { resueltaEn: VEREDICTO }), rev(4, 'ENVIADA', { enviadaEn: ENVIO })]).situacion,
    ).toBe('REENVIADA_PARA_REVISION');
    expect(
      clasificarSolicitudCierre([rev(2, 'DEVUELTA_A_EJECUCION', { resueltaEn: VEREDICTO }), rev(5, 'ENVIADA', { enviadaEn: ENVIO })]).situacion,
    ).toBe('PENDIENTE_DE_EVALUACION');
  });

  it('no depende del orden de entrada ni modifica la cadena recibida', () => {
    const cadena = [rev(2, 'ENVIADA', { enviadaEn: ENVIO }), rev(1, 'CORRECCION_DOCUMENTAL', { resueltaEn: VEREDICTO })];
    const copia = structuredClone(cadena);

    expect(clasificarSolicitudCierre(cadena).situacion).toBe('REENVIADA_PARA_REVISION');
    expect(cadena).toEqual(copia);
  });
});
