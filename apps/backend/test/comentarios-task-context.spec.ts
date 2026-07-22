import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { ComentariosService } from '../src/comentarios/comentarios.service';

/**
 * Tarea 28: cobertura focalizada de los métodos contextualizados de
 * comentarios de tarea (findByTareaEnProyecto/createForTask/updateForTask/
 * removeForTask), incluida la validación estricta de proyecto+tarea que
 * los distingue de las rutas genéricas (ya cubiertas en
 * comentarios.service.spec.ts y comentarios-lectura.service.spec.ts, que
 * no se debilitan aquí).
 */
function makePrisma() {
  return {
    comentario: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    tarea: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    asignacionTarea: { findFirst: vi.fn() },
  } as any;
}

function makeNotifications() {
  return {
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const PROJECT_ID = 5;
const TASK_ID = 42;
const LEADER_ID = 1;
const PARTICIPANT_ID = 2;
const EXTERNO_ID = 99;
const COMMENT_ID = 9;
const COMMENT_AUTHOR_ID = 2;
const TASK_CREATOR_ID = 7;

function tareaFila() {
  return { idTarea: TASK_ID, idProyecto: PROJECT_ID, creadaPor: TASK_CREATOR_ID };
}

describe('ComentariosService — contexto de tarea (Tarea 28)', () => {
  describe('validación contextual proyecto+tarea', () => {
    it('proyecto y tarea válidos: la consulta usa exactamente idTarea+idProyecto+eliminadoEn:null+proyecto.eliminadoEn:null', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const service = new ComentariosService(prisma, makeNotifications());

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'Hola');

      expect(prisma.tarea.findFirst).toHaveBeenCalledWith({
        where: {
          idTarea: TASK_ID,
          idProyecto: PROJECT_ID,
          eliminadoEn: null,
          proyecto: { eliminadoEn: null },
        },
        select: { idTarea: true, idProyecto: true, creadaPor: true },
      });
    });

    it('proyecto inexistente, proyecto eliminado, tarea inexistente, tarea eliminada o tarea de otro proyecto: 404 (la consulta única los hace indistinguibles)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comentario.create).not.toHaveBeenCalled();
    });
  });

  describe('listado (findByTareaEnProyecto)', () => {
    it('consulta únicamente comentarios de la tarea, orden desc, eliminados excluidos', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
      prisma.comentario.findMany.mockResolvedValue([]);
      const service = new ComentariosService(prisma, makeNotifications());

      await service.findByTareaEnProyecto(PROJECT_ID, TASK_ID, LEADER_ID);

      expect(prisma.comentario.findMany).toHaveBeenCalledWith({
        where: { idTarea: TASK_ID, eliminadoEn: null },
        include: { autor: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } },
        orderBy: { creadoEn: 'desc' },
      });
    });

    it('líder autorizado: permitido', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
      prisma.comentario.findMany.mockResolvedValue([{ idComentario: 1 }]);
      const service = new ComentariosService(prisma, makeNotifications());

      const result = await service.findByTareaEnProyecto(PROJECT_ID, TASK_ID, LEADER_ID);
      expect(result).toEqual([{ idComentario: 1 }]);
    });

    it('usuario externo: rechazado (403)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(service.findByTareaEnProyecto(PROJECT_ID, TASK_ID, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('participante activo únicamente de otro proyecto: rechazado (403)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
      // La consulta real filtra por rolProyecto.idProyecto: PROJECT_ID; una
      // participación de otro proyecto nunca la satisface, así que el fake
      // se limita a simular ese resultado (null) sin reinterpretar la regla.
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.findByTareaEnProyecto(PROJECT_ID, TASK_ID, PARTICIPANT_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('creación (createForTask)', () => {
    it('comentario válido: crea con el autor y la tarea correctos, y notifica solo al asignado activo (Tarea 29)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: 3 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      const result = await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, '  Hola equipo  ');

      expect(prisma.comentario.create).toHaveBeenCalledWith({
        data: {
          idAutor: PARTICIPANT_ID,
          idTarea: TASK_ID,
          contenido: 'Hola equipo',
        },
      });
      expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith({
        where: { idTarea: TASK_ID, desasignadaEn: null },
        select: { idUsuario: true },
      });
      expect(result.idComentario).toBe(COMMENT_ID);
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).toHaveBeenCalledWith([3], {
        tipoNotificacion: 'COMENTARIO_TAREA',
        tituloNotificacion: 'Nuevo comentario',
        mensajeNotificacion: 'Se agregó un comentario nuevo en el proyecto.',
        datosJson: {
          idProyecto: PROJECT_ID,
          idComentario: COMMENT_ID,
          idTarea: TASK_ID,
          idHito: null,
        },
      });
    });

    it('sin asignación activa: notifica únicamente a creadaPor, no a los participantes', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        [TASK_CREATOR_ID],
        expect.objectContaining({ tipoNotificacion: 'COMENTARIO_TAREA' }),
      );
    });

    it('asignado activo igual al autor: sin destinatarios, no usa creadaPor como fallback', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: PARTICIPANT_ID });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([], expect.anything());
    });

    it('sin asignación y creadaPor igual al autor: sin destinatarios', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue({ idTarea: TASK_ID, idProyecto: PROJECT_ID, creadaPor: PARTICIPANT_ID });
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([], expect.anything());
    });

    it('no consulta participacionProyecto.findMany para resolver destinatarios de tarea (sin fan-out)', async () => {
      const prisma = makePrisma();
      prisma.participacionProyecto.findMany = vi.fn();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: 3 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'Hola');

      expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
    });

    it('los parámetros de la URL determinan idTarea; no existe un campo del body que pueda sustituirlos', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const service = new ComentariosService(prisma, makeNotifications());

      // createForTask solo acepta `contenido: string` (no un DTO con IDs propios):
      // no hay forma estructural de que un valor adicional altere idTarea/idProyecto.
      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'contenido cualquiera');

      const data = prisma.comentario.create.mock.calls[0][0].data;
      expect(data.idTarea).toBe(TASK_ID);
      expect(data.idProyecto).toBeUndefined();
    });

    it('tarea eliminada o relación cruzada (otro proyecto): 404, no crea el comentario', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'no debería crearse'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comentario.create).not.toHaveBeenCalled();
    });

    it('usuario sin permiso (no participante activo): 403, no crea el comentario', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.createForTask(PROJECT_ID, TASK_ID, EXTERNO_ID, 'no debería crearse'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comentario.create).not.toHaveBeenCalled();
    });
  });

  describe('actualización (updateForTask)', () => {
    function comentarioFila(overrides: Record<string, unknown> = {}) {
      return { idComentario: COMMENT_ID, idAutor: COMMENT_AUTHOR_ID, ...overrides };
    }

    it('comentario de la tarea, autor correcto: actualiza contenido y editadoEn', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(comentarioFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.update.mockResolvedValue({ idComentario: COMMENT_ID, contenido: 'editado' });
      const service = new ComentariosService(prisma, makeNotifications());

      const result = await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, {
        contenido: 'editado',
      } as any);

      expect(prisma.comentario.findFirst).toHaveBeenCalledWith({
        where: { idComentario: COMMENT_ID, idTarea: TASK_ID, eliminadoEn: null },
        select: { idComentario: true, idAutor: true },
      });
      expect(prisma.comentario.update).toHaveBeenCalledWith({
        where: { idComentario: COMMENT_ID },
        data: { contenido: 'editado', editadoEn: expect.any(Date) },
      });
      expect(result.idComentario).toBe(COMMENT_ID);
    });

    it('comentario inexistente: 404', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, 999999, COMMENT_AUTHOR_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('comentario de otra tarea del mismo proyecto: 404 (findFirst filtrado por idTarea no lo encuentra)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(null); // pertenece a otra tarea: el filtro idTarea lo excluye
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('comentario de otro proyecto (tarea no pertenece a projectId): 404 antes de consultar el comentario', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null); // la tarea no pertenece a este proyecto
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comentario.findFirst).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('tarea eliminada: 404, ni siquiera consulta el comentario', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.comentario.findFirst).not.toHaveBeenCalled();
    });

    it('usuario distinto del autor: 403, no llega a comprobar el canal de escritura', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(comentarioFila({ idAutor: COMMENT_AUTHOR_ID }));
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, EXTERNO_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('autor pero proyecto en modo solo lectura: 403 (misma política real de assertChannelAWriteAllowed)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(comentarioFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.CERRADO, creadoPor: LEADER_ID });
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(
        service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, { contenido: 'x' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });
  });

  describe('eliminación (removeForTask)', () => {
    function comentarioFila(overrides: Record<string, unknown> = {}) {
      return { idComentario: COMMENT_ID, idAutor: COMMENT_AUTHOR_ID, ...overrides };
    }

    it('comentario correcto, autor: soft delete (eliminadoEn), nunca borrado físico', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(comentarioFila());
      prisma.proyecto.findUnique.mockResolvedValue({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.update.mockResolvedValue({ idComentario: COMMENT_ID, eliminadoEn: new Date() });
      const service = new ComentariosService(prisma, makeNotifications());

      await service.removeForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID);

      expect(prisma.comentario.update).toHaveBeenCalledWith({
        where: { idComentario: COMMENT_ID },
        data: { eliminadoEn: expect.any(Date) },
      });
      expect((prisma.comentario as any).delete).toBeUndefined();
      expect((prisma.comentario as any).deleteMany).toBeUndefined();
    });

    it('comentario cruzado (otra tarea): 404, no se modifica ningún comentario', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(service.removeForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });

    it('tarea eliminada: 404', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null);
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(service.removeForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.comentario.findFirst).not.toHaveBeenCalled();
    });

    it('usuario sin permiso (no autor): 403', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.comentario.findFirst.mockResolvedValue(comentarioFila({ idAutor: COMMENT_AUTHOR_ID }));
      const service = new ComentariosService(prisma, makeNotifications());

      await expect(service.removeForTask(PROJECT_ID, TASK_ID, COMMENT_ID, EXTERNO_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comentario.update).not.toHaveBeenCalled();
    });
  });

  describe('orden de validación', () => {
    it('updateForTask: proyecto/tarea → comentario pertenece a la tarea → autorización → escritura', async () => {
      const orden: string[] = [];
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockImplementation(async () => {
        orden.push('contexto');
        return tareaFila();
      });
      prisma.comentario.findFirst.mockImplementation(async () => {
        orden.push('comentario_en_tarea');
        return { idComentario: COMMENT_ID, idAutor: COMMENT_AUTHOR_ID };
      });
      prisma.proyecto.findUnique.mockImplementation(async () => {
        orden.push('autorizacion');
        return { estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID };
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.update.mockImplementation(async () => {
        orden.push('escritura');
        return { idComentario: COMMENT_ID };
      });
      const service = new ComentariosService(prisma, makeNotifications());

      await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, COMMENT_AUTHOR_ID, { contenido: 'x' } as any);

      expect(orden).toEqual(['contexto', 'comentario_en_tarea', 'autorizacion', 'escritura']);
    });

    it('createForTask: proyecto/tarea → autorización → creación → destinatarios → notificación (Tarea 29: nunca notifica antes de persistir)', async () => {
      const orden: string[] = [];
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockImplementation(async () => {
        orden.push('contexto');
        return tareaFila();
      });
      prisma.proyecto.findUnique.mockImplementation(async () => {
        orden.push('autorizacion');
        return { estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID };
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockImplementation(async () => {
        orden.push('creacion');
        return { idComentario: COMMENT_ID };
      });
      prisma.asignacionTarea.findFirst.mockImplementation(async () => {
        orden.push('resolucion_destinatarios');
        return null;
      });
      const notifications = makeNotifications();
      notifications.notifyUsers.mockImplementation(async () => {
        orden.push('notificacion');
      });
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, PARTICIPANT_ID, 'x');

      expect(orden).toEqual(['contexto', 'autorizacion', 'creacion', 'resolucion_destinatarios', 'notificacion']);
    });
  });
});
