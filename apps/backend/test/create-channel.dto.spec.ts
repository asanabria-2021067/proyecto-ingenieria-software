import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateChannelDto } from '../src/chat/dto/create-channel.dto';

const validar = (plain: object) => {
  const dto = plainToInstance(CreateChannelDto, plain);
  return { dto, errores: validateSync(dto) };
};

describe('CreateChannelDto', () => {
  it('normaliza: sin # inicial, sin espacios y en minúsculas', () => {
    const { dto, errores } = validar({ nombre: '  #Backend-Dev ' });
    expect(errores).toHaveLength(0);
    expect(dto.nombre).toBe('backend-dev');
  });

  it('acepta letras con tilde, números, guion y guion bajo', () => {
    expect(validar({ nombre: 'diseño_2-ñ' }).errores).toHaveLength(0);
  });

  it.each(['a', 'a'.repeat(41), 'con espacio', 'x<script>', 'a/b', '#', ''])('rechaza %j', (nombre) => {
    expect(validar({ nombre }).errores.length).toBeGreaterThan(0);
  });

  it('acepta el límite de 2 y 40 caracteres', () => {
    expect(validar({ nombre: 'ab' }).errores).toHaveLength(0);
    expect(validar({ nombre: 'a'.repeat(40) }).errores).toHaveLength(0);
  });

  it('rechaza nombre ausente o no string', () => {
    expect(validar({}).errores.length).toBeGreaterThan(0);
    expect(validar({ nombre: 5 }).errores.length).toBeGreaterThan(0);
  });

  it('idsMiembros es opcional pero debe ser lista de enteros únicos', () => {
    expect(validar({ nombre: 'dev', idsMiembros: [1, 2] }).errores).toHaveLength(0);
    expect(validar({ nombre: 'dev', idsMiembros: [1, 1] }).errores.length).toBeGreaterThan(0);
    expect(validar({ nombre: 'dev', idsMiembros: ['a'] }).errores.length).toBeGreaterThan(0);
  });
});
