import { describe, expect, it } from 'vitest';
import {
  coincideMencionable,
  consultaMencionActiva,
  contenidoAEditable,
  editableAContenido,
  etiquetaMencion,
  mencionesPresentes,
  segmentarComentario,
} from '../lib/mentions/mention-tokens';

/** HU-200 (T-379): parseo y armado del token `@[Etiqueta](id)` en el frontend. */

describe('segmentarComentario', () => {
  it('separa texto y menciones en orden', () => {
    expect(segmentarComentario('Hola @[María López](12), mira esto')).toEqual([
      { tipo: 'texto', texto: 'Hola ' },
      { tipo: 'mencion', idUsuario: 12, etiqueta: 'María López' },
      { tipo: 'texto', texto: ', mira esto' },
    ]);
  });

  it('un texto sin tokens queda como un solo segmento; un @ suelto o un correo no son menciones', () => {
    expect(segmentarComentario('Escribe a ana@uvg.edu.gt o a @Luis')).toEqual([
      { tipo: 'texto', texto: 'Escribe a ana@uvg.edu.gt o a @Luis' },
    ]);
  });

  it('reconoce menciones consecutivas y al inicio/fin', () => {
    expect(segmentarComentario('@[Ana](1)@[Luis](2)')).toEqual([
      { tipo: 'mencion', idUsuario: 1, etiqueta: 'Ana' },
      { tipo: 'mencion', idUsuario: 2, etiqueta: 'Luis' },
    ]);
  });
});

describe('etiquetaMencion', () => {
  it('une nombre y apellido y quita los caracteres que romperían el token', () => {
    expect(etiquetaMencion('Ana [la]', 'Pérez (QA)')).toBe('Ana la Pérez QA');
  });
});

describe('editable ↔ contenido', () => {
  it('contenidoAEditable muestra @Etiqueta y devuelve las menciones del texto', () => {
    expect(contenidoAEditable('Listo @[Ana Pérez](4) y @[Luis](9). Gracias @[Ana Pérez](4)')).toEqual({
      texto: 'Listo @Ana Pérez y @Luis. Gracias @Ana Pérez',
      menciones: [
        { idUsuario: 4, etiqueta: 'Ana Pérez' },
        { idUsuario: 9, etiqueta: 'Luis' },
      ],
    });
  });

  it('editableAContenido convierte cada @Etiqueta elegida en su token', () => {
    const menciones = [{ idUsuario: 4, etiqueta: 'Ana Pérez' }];
    expect(editableAContenido('Hola @Ana Pérez, revisa', menciones)).toBe('Hola @[Ana Pérez](4), revisa');
  });

  it('ida y vuelta conserva el contenido original', () => {
    const original = 'Ok @[Ana Pérez](4), coordina con @[Luis Gómez](9)';
    const { texto, menciones } = contenidoAEditable(original);
    expect(editableAContenido(texto, menciones)).toBe(original);
  });

  it('no captura una etiqueta como prefijo de otra palabra (@Ana no toma @Anabel)', () => {
    const menciones = [{ idUsuario: 1, etiqueta: 'Ana' }];
    expect(editableAContenido('@Anabel y @Ana', menciones)).toBe('@Anabel y @[Ana](1)');
  });

  it('prioriza la etiqueta más larga cuando una es prefijo de otra', () => {
    const menciones = [
      { idUsuario: 1, etiqueta: 'Ana' },
      { idUsuario: 2, etiqueta: 'Ana María' },
    ];
    expect(editableAContenido('@Ana María y @Ana', menciones)).toBe('@[Ana María](2) y @[Ana](1)');
  });

  it('un @Nombre escrito a mano, sin elegirlo en el autocompletado, queda como texto', () => {
    expect(editableAContenido('Hola @Ana Pérez', [])).toBe('Hola @Ana Pérez');
  });

  it('las etiquetas con caracteres especiales de regex se escapan', () => {
    const menciones = [{ idUsuario: 3, etiqueta: 'Jo.se' }];
    expect(editableAContenido('@Joxse y @Jo.se', menciones)).toBe('@Joxse y @[Jo.se](3)');
  });

  it('mencionesPresentes descarta la mención cuyo @Etiqueta se borró del texto', () => {
    const menciones = [
      { idUsuario: 1, etiqueta: 'Ana' },
      { idUsuario: 2, etiqueta: 'Luis' },
    ];
    expect(mencionesPresentes('Hola @Luis', menciones)).toEqual([{ idUsuario: 2, etiqueta: 'Luis' }]);
  });
});

describe('consultaMencionActiva', () => {
  it('detecta la búsqueda entre el @ y el cursor', () => {
    expect(consultaMencionActiva('Hola @mar', 9)).toEqual({ inicio: 5, consulta: 'mar' });
    expect(consultaMencionActiva('@', 1)).toEqual({ inicio: 0, consulta: '' });
  });

  it('admite nombre y apellido separados por un espacio', () => {
    expect(consultaMencionActiva('(@María Ló', 10)).toEqual({ inicio: 1, consulta: 'María Ló' });
  });

  it('ignora un @ dentro de una palabra (correo) o separado por salto de línea', () => {
    expect(consultaMencionActiva('ana@uvg', 7)).toBeNull();
    expect(consultaMencionActiva('@ana\nhola', 9)).toBeNull();
    expect(consultaMencionActiva('sin arroba', 5)).toBeNull();
  });

  it('ignora una búsqueda que empieza con espacio o que ya es demasiado larga', () => {
    expect(consultaMencionActiva('@ ana', 5)).toBeNull();
    expect(consultaMencionActiva(`@${'a'.repeat(41)}`, 42)).toBeNull();
  });
});

describe('coincideMencionable', () => {
  it('compara por prefijos de palabra sin tildes ni mayúsculas', () => {
    expect(coincideMencionable('María López', 'mar')).toBe(true);
    expect(coincideMencionable('María López', 'LOP')).toBe(true);
    expect(coincideMencionable('María López', 'mar lo')).toBe(true);
    expect(coincideMencionable('María López', 'ría')).toBe(false);
    expect(coincideMencionable('María López', 'carlos')).toBe(false);
  });

  it('una consulta vacía coincide con todos', () => {
    expect(coincideMencionable('María López', '')).toBe(true);
  });
});
