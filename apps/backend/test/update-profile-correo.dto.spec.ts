import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateProfileDto } from '../src/users/dto/update-profile.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validar = (body: unknown) => pipe.transform(body, { type: 'body', metatype: UpdateProfileDto });

describe('PATCH /usuarios/me/perfil no cambia el correo de login', () => {
  it('rechaza correoInstitucional con 400: el correo identifica carné y apellido y solo lo fija el registro', async () => {
    await expect(validar({ nombre: 'Ana', correoInstitucional: 'xyz21001@uvg.edu.gt' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sigue aceptando los campos de perfil normales', async () => {
    await expect(validar({ nombre: 'Ana', apellido: 'Pérez' })).resolves.toBeInstanceOf(UpdateProfileDto);
  });
});
