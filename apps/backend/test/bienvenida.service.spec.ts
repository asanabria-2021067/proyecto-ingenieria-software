import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { armarBienvenida, BienvenidaService, MENSAJE_BIENVENIDA_DEFECTO } from '../src/applications/bienvenida.service';

describe('MEJ-102 mensaje de bienvenida', () => {
  it('usa el texto por defecto o el del proyecto y sustituye nombre y proyecto', () => {
    expect(armarBienvenida(null, 'Ana', 'Huerto')).toBe(MENSAJE_BIENVENIDA_DEFECTO.replace('{nombre}', 'Ana').replace('{proyecto}', 'Huerto'));
    expect(armarBienvenida('  ', 'Ana', 'Huerto')).toContain('Ana');
    expect(armarBienvenida('Hola {nombre}, bienvenida a {proyecto}', 'Ana', 'Huerto')).toBe('Hola Ana, bienvenida a Huerto');
  });

  function crear(proyecto: Record<string, unknown> | null = { creadoPor: 1, tituloProyecto: 'Huerto', mensajeBienvenida: null, estadoProyecto: 'EN_PROGRESO' }) {
    const prisma = {
      proyecto: { findFirst: vi.fn().mockResolvedValue(proyecto), update: vi.fn().mockResolvedValue({}) },
      usuario: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana' }) },
      conversacion: { findFirst: vi.fn().mockResolvedValue({ idConversacion: 40 }) },
    };
    const chat = { createMessage: vi.fn().mockResolvedValue({}) };
    return { prisma, chat, servicio: new BienvenidaService(prisma as never, chat as never) };
  }

  it('el lider envia la bienvenida a #general', async () => {
    const { servicio, chat } = crear();
    await servicio.enviarSinFallar(7, 20);
    expect(chat.createMessage).toHaveBeenCalledWith(7, 40, 1, expect.stringContaining('Ana'));
  });

  it('un fallo del chat no rompe la aceptacion', async () => {
    const { servicio, chat } = crear();
    chat.createMessage.mockRejectedValue(new Error('chat caido'));
    await expect(servicio.enviarSinFallar(7, 20)).resolves.toBeUndefined();
  });

  it('solo el lider edita el texto; vacio vuelve al valor por defecto', async () => {
    const { servicio, prisma } = crear();
    await expect(servicio.guardar(7, 2, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    await servicio.guardar(7, 1, '   ');
    expect(prisma.proyecto.update).toHaveBeenCalledWith({ where: { idProyecto: 7 }, data: { mensajeBienvenida: null } });
  });
});
