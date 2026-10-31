import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_CONTRASENA, MIN_CONTRASENA, REQUISITOS_CONTRASENA } from '../lib/validators/contrasena';
import { erroresDeRegistro } from '../lib/validators/registro-errores';

/**
 * NL-T2: el frontend y el backend deben exigir la misma contraseña, o el
 * formulario aceptará algo que el servidor rechaza. Se lee el DTO del backend
 * (apps/backend/src/auth/dto/register.dto.ts) y se comparan los límites.
 */
describe('NL-T2: reglas de contraseña del registro', () => {
  const dto = readFileSync(resolve(process.cwd(), '../backend/src/auth/dto/register.dto.ts'), 'utf-8');
  const limite = (decorador: string) => Number(new RegExp(`@${decorador}\\((\\d+)\\)\\s*(?://[^\\n]*\\s*)*(?:@\\w+\\([^)]*\\)\\s*)*contrasena`).exec(dto)?.[1]);

  it('el mínimo y el máximo del frontend son los del DTO del backend', () => {
    expect(limite('MinLength')).toBe(MIN_CONTRASENA);
    expect(limite('MaxLength')).toBe(MAX_CONTRASENA);
  });

  it('la lista de requisitos marca exactamente los límites', () => {
    const [min, max] = REQUISITOS_CONTRASENA;
    expect(min.cumple('a'.repeat(MIN_CONTRASENA - 1))).toBe(false);
    expect(min.cumple('a'.repeat(MIN_CONTRASENA))).toBe(true);
    expect(max.cumple('')).toBe(false);
    expect(max.cumple('a'.repeat(MAX_CONTRASENA))).toBe(true);
    expect(max.cumple('a'.repeat(MAX_CONTRASENA + 1))).toBe(false);
  });
});

describe('NL-T2: 400 de validación del backend a un campo', () => {
  it('asigna cada mensaje de class-validator a su campo, con texto en español', () => {
    const error = {
      statusCode: 400,
      details: ['contrasena must be longer than or equal to 8 characters', 'semestre must not be greater than 12'],
    };
    expect(erroresDeRegistro(error)).toEqual({
      contrasena: 'La contraseña debe tener entre 8 y 72 caracteres',
      semestre: 'El semestre es inválido',
    });
  });

  it('el correo que no coincide con apellido y carné conserva el mensaje del backend', () => {
    const mensaje = 'El correo no coincide con tu apellido y carné. Tu correo debería ser san24725@uvg.edu.gt';
    expect(erroresDeRegistro({ statusCode: 400, details: mensaje })).toEqual({ correo: mensaje });
  });

  it('sin campo reconocible, o con otro status, no mapea nada (se usa el mensaje genérico)', () => {
    expect(erroresDeRegistro({ statusCode: 400, details: 'Solicitud inválida' })).toEqual({});
    expect(erroresDeRegistro({ statusCode: 409, details: ['correo must be an email'] })).toEqual({});
    expect(erroresDeRegistro(null)).toEqual({});
  });
});
