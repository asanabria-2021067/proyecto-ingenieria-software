import { describe, expect, it } from 'vitest';
import {
  FORMATO_CORREO_INSTITUCIONAL,
  correoInstitucionalEsperado,
  prefijoApellido,
} from '@/lib/validators/correo-institucional';

describe('correo institucional esperado', () => {
  it('arma el correo con las 3 primeras letras del apellido y el carné', () => {
    expect(correoInstitucionalEsperado('Sanabria', '24725')).toBe('san24725@uvg.edu.gt');
    expect(correoInstitucionalEsperado('Sanabria Morales', '24725')).toBe('san24725@uvg.edu.gt');
  });

  it('no coincide cuando cambia el apellido o el carné', () => {
    expect(correoInstitucionalEsperado('Morales', '24725')).not.toBe('san24725@uvg.edu.gt');
    expect(correoInstitucionalEsperado('Sanabria', '24726')).not.toBe('san24725@uvg.edu.gt');
  });

  it('quita la tilde del apellido', () => {
    expect(prefijoApellido('Pérez')).toBe('per');
  });

  it('convierte la ñ en n', () => {
    expect(prefijoApellido('Ñáñez')).toBe('nan');
    expect(prefijoApellido('Muñoz')).toBe('mun');
  });

  it('une las palabras del apellido con partícula antes de tomar las 3 letras', () => {
    expect(correoInstitucionalEsperado('De León', '24011')).toBe('del24011@uvg.edu.gt');
    expect(correoInstitucionalEsperado('Del Valle', '24012')).toBe('del24012@uvg.edu.gt');
  });

  it('usa las letras que tenga un apellido de menos de 3 letras', () => {
    expect(correoInstitucionalEsperado('Li', '24013')).toBe('li24013@uvg.edu.gt');
    expect(FORMATO_CORREO_INSTITUCIONAL.test('li24013@uvg.edu.gt')).toBe(true);
  });
});
