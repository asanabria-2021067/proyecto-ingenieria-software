import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComentariosService } from '../src/comentarios/comentarios.service';
import { EMOJIS_REACCION, ToggleReactionDto } from '../src/chat/dto/toggle-reaction.dto';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

const PROJECT_ID = 5;
const TASK_ID = 42;
const AUTOR = 2;
const PADRE_AUTOR = 3;
const ASIGNADO = 4;
const PADRE_ID = 9;

function crear(opts: { padre?: object | null; participa?: boolean; filasReaccion?: { emoji: string; idUsuario: number }[]; existente?: boolean } = {}) {
  const { participa = true, existente = false } = opts;
  const padre = opts.padre === undefined ? { idComentario: PADRE_ID, idAutor: PADRE_AUTOR, idComentarioPadre: null } : opts.padre;
  const prisma = {
    comentario: { create: vi.fn().mockResolvedValue({ idComentario: 50 }), findFirst: vi.fn().mockResolvedValue(padre), findMany: vi.fn() },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ estadoProyecto: EstadoProyecto.EN_PROGRESO, creadoPor: 1 }) },
    tarea: { findFirst: vi.fn().mockResolvedValue({ idTarea: TASK_ID, idProyecto: PROJECT_ID, creadaPor: 7, idSprint: 3 }) },
    participacionProyecto: { findFirst: vi.fn().mockResolvedValue(participa ? { idParticipacion: 1 } : null) },
    asignacionTarea: { findFirst: vi.fn().mockResolvedValue({ idUsuario: ASIGNADO }) },
    mencionComentario: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
    reaccionComentario: {
      deleteMany: vi.fn().mockResolvedValue({ count: existente ? 1 : 0 }),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(opts.filasReaccion ?? []),
    },
  };
  const notifications = { notifyUsers: vi.fn().mockResolvedValue(undefined), notifyProjectActiveParticipants: vi.fn() };
  const service = new ComentariosService(
    prisma as never,
    notifications as never,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
  return { service, prisma, notifications };
}

describe('MEJ-110: respuestas en hilo (un solo nivel)', () => {
  it('responde a un comentario de la tarea, lo enlaza al padre y avisa al autor del comentario respondido y al asignado', async () => {
    const { service, prisma, notifications } = crear();
    await service.createForTask(PROJECT_ID, TASK_ID, AUTOR, 'De acuerdo', PADRE_ID);
    expect(prisma.comentario.findFirst).toHaveBeenCalledWith({
      where: { idComentario: PADRE_ID, idTarea: TASK_ID, eliminadoEn: null },
      select: { idComentario: true, idAutor: true, idComentarioPadre: true },
    });
    expect(prisma.comentario.create).toHaveBeenCalledWith({
      data: { idAutor: AUTOR, idTarea: TASK_ID, idComentarioPadre: PADRE_ID, contenido: 'De acuerdo' },
    });
    expect(notifications.notifyUsers).toHaveBeenCalledWith([ASIGNADO, PADRE_AUTOR], expect.objectContaining({ tipoNotificacion: 'COMENTARIO_TAREA' }));
  });

  it('no avisa a quien se responde a si mismo', async () => {
    const { service, notifications } = crear({ padre: { idComentario: PADRE_ID, idAutor: AUTOR, idComentarioPadre: null } });
    await service.createForTask(PROJECT_ID, TASK_ID, AUTOR, 'Aclaro', PADRE_ID);
    expect(notifications.notifyUsers).toHaveBeenCalledWith([ASIGNADO], expect.anything());
  });

  it('rechaza responder a una respuesta (sin nietas) y no crea nada', async () => {
    const { service, prisma } = crear({ padre: { idComentario: PADRE_ID, idAutor: PADRE_AUTOR, idComentarioPadre: 1 } });
    await expect(service.createForTask(PROJECT_ID, TASK_ID, AUTOR, 'x', PADRE_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.comentario.create).not.toHaveBeenCalled();
  });

  it('rechaza (404) un padre que es de otra tarea, esta eliminado o no existe', async () => {
    const { service, prisma } = crear({ padre: null });
    await expect(service.createForTask(PROJECT_ID, TASK_ID, AUTOR, 'x', PADRE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comentario.create).not.toHaveBeenCalled();
  });

  it('quien no es miembro del proyecto no puede responder (403)', async () => {
    const { service, prisma } = crear({ participa: false });
    await expect(service.createForTask(PROJECT_ID, TASK_ID, 99, 'x', PADRE_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.comentario.create).not.toHaveBeenCalled();
  });

  it('un comentario sin padre se crea como hasta ahora (sin idComentarioPadre)', async () => {
    const { service, prisma } = crear();
    await service.createForTask(PROJECT_ID, TASK_ID, AUTOR, 'Nuevo');
    expect(prisma.comentario.create).toHaveBeenCalledWith({ data: { idAutor: AUTOR, idTarea: TASK_ID, contenido: 'Nuevo' } });
  });
});

describe('MEJ-110: reacciones a comentarios de tarea', () => {
  const pulgar = EMOJIS_REACCION[0];

  it('reacciona: crea la fila y devuelve las reacciones agrupadas', async () => {
    const { service, prisma } = crear({ filasReaccion: [{ emoji: pulgar, idUsuario: AUTOR }, { emoji: pulgar, idUsuario: 8 }] });
    const grupos = await service.toggleReaccionForTask(PROJECT_ID, TASK_ID, PADRE_ID, AUTOR, pulgar);
    expect(prisma.reaccionComentario.deleteMany).toHaveBeenCalledWith({ where: { idComentario: PADRE_ID, idUsuario: AUTOR, emoji: pulgar } });
    expect(prisma.reaccionComentario.create).toHaveBeenCalledWith({ data: { idComentario: PADRE_ID, idUsuario: AUTOR, emoji: pulgar } });
    expect(grupos).toEqual([{ emoji: pulgar, count: 2, idsUsuarios: [AUTOR, 8] }]);
  });

  it('reaccionar de nuevo con el mismo emoji la quita (una por usuario+emoji, no se duplica)', async () => {
    const { service, prisma } = crear({ existente: true, filasReaccion: [] });
    const grupos = await service.toggleReaccionForTask(PROJECT_ID, TASK_ID, PADRE_ID, AUTOR, pulgar);
    expect(prisma.reaccionComentario.create).not.toHaveBeenCalled();
    expect(grupos).toEqual([]);
  });

  it('un no miembro recibe 403 y no se escribe', async () => {
    const { service, prisma } = crear({ participa: false });
    await expect(service.toggleReaccionForTask(PROJECT_ID, TASK_ID, PADRE_ID, 99, pulgar)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reaccionComentario.deleteMany).not.toHaveBeenCalled();
    expect(prisma.reaccionComentario.create).not.toHaveBeenCalled();
  });

  it('el comentario debe ser de esta tarea (404 si es de otra o esta eliminado)', async () => {
    const { service, prisma } = crear({ padre: null });
    await expect(service.toggleReaccionForTask(PROJECT_ID, TASK_ID, PADRE_ID, AUTOR, pulgar)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.reaccionComentario.create).not.toHaveBeenCalled();
  });

  it('usa el mismo catalogo de emojis del chat: acepta los permitidos y rechaza el resto', async () => {
    for (const emoji of EMOJIS_REACCION) {
      expect(await validate(plainToInstance(ToggleReactionDto, { emoji }))).toHaveLength(0);
    }
    for (const emoji of ['\u{1F4A9}', 'x', '', '<script>']) {
      expect((await validate(plainToInstance(ToggleReactionDto, { emoji }))).length).toBeGreaterThan(0);
    }
  });
});
