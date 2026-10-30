import { describe, expect, it, vi } from 'vitest';
import { puedeEntrarAConversacion } from '../src/chat/chat-acceso';
import type { PrismaService } from '../src/prisma/prisma.service';

const LIDER = 1;
const canal = (overrides: Record<string, unknown> = {}) => ({
  esCanal: true,
  idProyecto: 10,
  proyecto: { creadoPor: LIDER, eliminadoEn: null },
  ...overrides,
});
const directa = { esCanal: false, idProyecto: null, proyecto: null };

function setup(conversacion: unknown, participacion: unknown = null) {
  const convFindFirst = vi.fn().mockResolvedValue(conversacion);
  const partFindFirst = vi.fn().mockResolvedValue(participacion);
  const prisma = {
    conversacion: { findFirst: convFindFirst },
    participacionProyecto: { findFirst: partFindFirst },
  } as unknown as PrismaService;
  return { prisma, convFindFirst, partFindFirst };
}

describe('puedeEntrarAConversacion', () => {
  it('consulta solo conversaciones no eliminadas donde el usuario es participante', async () => {
    const { prisma, convFindFirst } = setup(directa);

    await puedeEntrarAConversacion(prisma, 3, 5);

    expect(convFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idConversacion: 3, eliminadaEn: null, participantes: { some: { idUsuario: 5 } } },
      }),
    );
  });

  it('conversacion inexistente, eliminada o sin fila de participante (la consulta no la devuelve): false', async () => {
    const { prisma, partFindFirst } = setup(null);

    await expect(puedeEntrarAConversacion(prisma, 3, 5)).resolves.toBe(false);
    expect(partFindFirst).not.toHaveBeenCalled();
  });

  it('conversacion que no es canal: true sin mirar la membresia del proyecto', async () => {
    const { prisma, partFindFirst } = setup(directa);

    await expect(puedeEntrarAConversacion(prisma, 3, 5)).resolves.toBe(true);
    expect(partFindFirst).not.toHaveBeenCalled();
  });

  it('canal: el lider vigente entra sin necesitar participacion', async () => {
    const { prisma, partFindFirst } = setup(canal());

    await expect(puedeEntrarAConversacion(prisma, 3, LIDER)).resolves.toBe(true);
    expect(partFindFirst).not.toHaveBeenCalled();
  });

  it('canal: participante con participacion ACTIVO entra', async () => {
    const { prisma, partFindFirst } = setup(canal(), { idParticipacion: 8 });

    await expect(puedeEntrarAConversacion(prisma, 3, 5)).resolves.toBe(true);
    expect(partFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idUsuario: 5, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: 10 } },
      }),
    );
  });

  it('canal: ex miembro (o ex lider) sin participacion activa no entra', async () => {
    const { prisma } = setup(canal(), null);

    await expect(puedeEntrarAConversacion(prisma, 3, 5)).resolves.toBe(false);
  });

  it('canal de un proyecto eliminado: nadie entra, ni siquiera el lider', async () => {
    const { prisma } = setup(canal({ proyecto: { creadoPor: LIDER, eliminadoEn: new Date() } }), { idParticipacion: 8 });

    await expect(puedeEntrarAConversacion(prisma, 3, LIDER)).resolves.toBe(false);
    await expect(puedeEntrarAConversacion(prisma, 3, 5)).resolves.toBe(false);
  });
});
