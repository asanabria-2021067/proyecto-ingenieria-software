import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RestriccionesController } from '../src/perfil-portafolio/restricciones.controller';

describe('FIX-25 restricciones: :tipo validado', () => {
  const crear = () => {
    const restricciones = { aplicar: vi.fn().mockResolvedValue({}), quitar: vi.fn().mockResolvedValue({}) };
    return { restricciones, controlador: new RestriccionesController(restricciones as never, {} as never) };
  };

  it('bloqueo y silencio llegan al servicio con su tipo', () => {
    const { controlador, restricciones } = crear();
    controlador.aplicar('bloqueo', 2, { userId: 1 });
    controlador.aplicar('silencio', 3, { userId: 1 });
    controlador.quitar('silencio', 3, { userId: 1 });
    expect(restricciones.aplicar).toHaveBeenNthCalledWith(1, 1, 2, 'BLOQUEO');
    expect(restricciones.aplicar).toHaveBeenNthCalledWith(2, 1, 3, 'SILENCIO');
    expect(restricciones.quitar).toHaveBeenCalledWith(1, 3, 'SILENCIO');
  });

  it.each(['otro', 'BLOQUEO', ''])('un :tipo desconocido (%j) responde 400 y no toca nada', (tipo) => {
    const { controlador, restricciones } = crear();
    expect(() => controlador.aplicar(tipo, 2, { userId: 1 })).toThrow(BadRequestException);
    expect(() => controlador.quitar(tipo, 2, { userId: 1 })).toThrow(BadRequestException);
    expect(restricciones.aplicar).not.toHaveBeenCalled();
    expect(restricciones.quitar).not.toHaveBeenCalled();
  });
});
