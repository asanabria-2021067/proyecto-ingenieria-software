import { describe, expect, it } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterDto } from '../src/auth/dto/register.dto';

// NL-T2: la contraseña de registro admite de 8 a 72 caracteres. El frontend
// (lib/validators/contrasena.ts) usa los mismos límites y su prueba los
// compara con este DTO.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const base = {
  correo: 'san24725@uvg.edu.gt',
  contrasena: 'Passw0rd!',
  nombre: 'Ana',
  apellido: 'Santos',
  carne: '24725',
  idCarrera: 1,
  semestre: 3,
};

async function mensajes(contrasena: string): Promise<string[] | null> {
  const metadata: ArgumentMetadata = { type: 'body', metatype: RegisterDto };
  return pipe.transform({ ...base, contrasena }, metadata).then(
    () => null,
    (error: BadRequestException) => (error.getResponse() as { message: string[] }).message,
  );
}

describe('RegisterDto: contraseña', () => {
  it.each([8, 72])('acepta %i caracteres', async (largo) => {
    expect(await mensajes('a'.repeat(largo))).toBeNull();
  });

  it('rechaza 7 caracteres', async () => {
    expect(await mensajes('a'.repeat(7))).toEqual([expect.stringMatching(/^contrasena /)]);
  });

  it('rechaza 73 caracteres (bcrypt truncaría en silencio)', async () => {
    expect(await mensajes('a'.repeat(73))).toEqual([expect.stringMatching(/^contrasena /)]);
  });
});
