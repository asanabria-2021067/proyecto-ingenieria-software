import { describe, expect, it } from 'vitest';
import {
  FORMATO_CORREO_INSTITUCIONAL,
  correoCoincideConIdentidad,
  correoInstitucionalEsperado,
  prefijoApellido,
} from '../src/auth/correo-institucional.util';

describe('correo institucional esperado', () => {
  it('arma el correo con las 3 primeras letras del apellido y el carné', () => {
    expect(correoInstitucionalEsperado('Sanabria', '24725')).toBe('san24725@uvg.edu.gt');
    expect(correoCoincideConIdentidad('san24725@uvg.edu.gt', 'Sanabria', '24725')).toBe(true);
  });

  it('acepta el correo escrito con mayúsculas o espacios alrededor', () => {
    expect(correoCoincideConIdentidad('  SAN24725@UVG.EDU.GT ', 'Sanabria', '24725')).toBe(true);
  });

  it('rechaza un correo cuyo apellido no coincide', () => {
    expect(correoCoincideConIdentidad('mor24725@uvg.edu.gt', 'Sanabria', '24725')).toBe(false);
  });

  it('rechaza un correo cuyo carné no coincide', () => {
    expect(correoCoincideConIdentidad('san24726@uvg.edu.gt', 'Sanabria', '24725')).toBe(false);
  });

  it('quita la tilde del apellido', () => {
    expect(prefijoApellido('Pérez')).toBe('per');
    expect(correoInstitucionalEsperado('Pérez', '21003')).toBe('per21003@uvg.edu.gt');
  });

  it('quita la diéresis del apellido', () => {
    expect(prefijoApellido('Güemes')).toBe('gue');
  });

  it('convierte la ñ en n', () => {
    expect(prefijoApellido('Ñáñez')).toBe('nan');
    expect(correoInstitucionalEsperado('Muñoz', '24010')).toBe('mun24010@uvg.edu.gt');
  });

  it('une las palabras del apellido con partícula antes de tomar las 3 letras', () => {
    expect(prefijoApellido('De León')).toBe('del');
    expect(prefijoApellido('Del Valle')).toBe('del');
    expect(correoInstitucionalEsperado('De León', '24011')).toBe('del24011@uvg.edu.gt');
    expect(correoInstitucionalEsperado('Del Valle', '24012')).toBe('del24012@uvg.edu.gt');
    expect(correoInstitucionalEsperado('Sanabria Morales', '24725')).toBe('san24725@uvg.edu.gt');
  });

  it('usa las letras que tenga un apellido de menos de 3 letras', () => {
    expect(prefijoApellido('Li')).toBe('li');
    expect(correoInstitucionalEsperado('Li', '24013')).toBe('li24013@uvg.edu.gt');
    expect(correoCoincideConIdentidad('li24013@uvg.edu.gt', 'Li', '24013')).toBe(true);
  });

  it('el formato exige 2 o 3 letras minúsculas, dígitos y el dominio institucional', () => {
    expect(FORMATO_CORREO_INSTITUCIONAL.test('san24725@uvg.edu.gt')).toBe(true);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('SAN24725@uvg.edu.gt')).toBe(false);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('li24013@uvg.edu.gt')).toBe(true);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('s24725@uvg.edu.gt')).toBe(false);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('sana24725@uvg.edu.gt')).toBe(false);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('san@uvg.edu.gt')).toBe(false);
    expect(FORMATO_CORREO_INSTITUCIONAL.test('san24725@gmail.com')).toBe(false);
  });
});
