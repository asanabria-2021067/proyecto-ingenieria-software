import { describe, expect, it, vi } from 'vitest';
import { EstadoProyecto } from '@prisma/client';
import { ComentariosService } from '../src/comentarios/comentarios.service';

/**
 * Tarea 29: cobertura focalizada de los destinatarios de notificaciones de
 * comentarios de tarea (`createForTask`). Antes de esta tarea, `createForTask`
 * delegaba en `persistAndNotify` → `notifyProjectActiveParticipants`, que
 * notificaba a *todos* los participantes activos del proyecto sin importar
 * asignación, autoría o creador de la tarea. Estas pruebas fijan la regla
 * correcta: el único candidato es el asignado activo (`AsignacionTarea` con
 * `desasignadaEn: null`) o, en su defecto, `tarea.creadaPor`; el autor del
 * comentario siempre se excluye y nunca se consulta a los participantes del
 * proyecto para este propósito.
 */
function makePrisma() {
  const prisma = {
    comentario: { create: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    hito: { findUnique: vi.fn() },
    tarea: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), findMany: vi.fn() },
    asignacionTarea: { findFirst: vi.fn() },
  };
  return prisma as typeof prisma & ConstructorParameters<typeof ComentariosService>[0];
}

function makeNotifications() {
  const notifications = {
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
  };
  return notifications as typeof notifications & ConstructorParameters<typeof ComentariosService>[1];
}

const PROJECT_ID = 5;
const TASK_ID = 42;
const LEADER_ID = 1;
const TASK_CREATOR_ID = 7;
const ASSIGNEE_A = 10;
const ASSIGNEE_B = 20;
const AUTHOR_ID = 2;
const COMMENT_ID = 99;

function tareaFila(overrides: Record<string, unknown> = {}) {
  return { idTarea: TASK_ID, idProyecto: PROJECT_ID, creadaPor: TASK_CREATOR_ID, ...overrides };
}

function setupHappyPath(prisma: ReturnType<typeof makePrisma>) {
  prisma.tarea.findFirst.mockResolvedValue(tareaFila());
  prisma.proyecto.findUnique.mockResolvedValue({
    estadoProyecto: EstadoProyecto.PUBLICADO,
    creadoPor: LEADER_ID,
  });
  prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
  prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
}

describe('ComentariosService — destinatarios de notificaciones de comentarios de tarea (Tarea 29)', () => {
  describe('asignado activo', () => {
    it('consulta la asignación activa con idTarea y desasignadaEn: null, y notifica solo al asignado', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: ASSIGNEE_A });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledWith({
        where: { idTarea: TASK_ID, desasignadaEn: null },
        select: { idUsuario: true },
      });
      expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).toHaveBeenCalledWith([ASSIGNEE_A], expect.anything());
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
    });

    it('el creador de la tarea no recibe notificación cuando hay asignado activo distinto', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: ASSIGNEE_A });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      const recipients = notifications.notifyUsers.mock.calls[0][0];
      expect(recipients).not.toContain(TASK_CREATOR_ID);
    });
  });

  describe('sin asignado', () => {
    it('la consulta de asignación devuelve null: creadaPor recibe la notificación', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([TASK_CREATOR_ID], expect.anything());
    });

    it('participantes activos no reciben la notificación (sin fallback masivo)', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });
  });

  describe('asignado igual al autor', () => {
    it('cero destinatarios, cero llamadas de notificación efectivas, sin fallback a creadaPor', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: AUTHOR_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([], expect.anything());
    });
  });

  describe('creador igual al autor (sin asignado)', () => {
    it('cero notificaciones', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila({ creadaPor: AUTHOR_ID }));
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([], expect.anything());
    });
  });

  describe('deduplicación', () => {
    it('asignado y creador con el mismo id: una única notificación (no dos)', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila({ creadaPor: ASSIGNEE_A }));
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: ASSIGNEE_A });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).toHaveBeenCalledWith([ASSIGNEE_A], expect.anything());
    });
  });

  describe('asignaciones históricas', () => {
    it('una asignación cerrada no es candidata: se usa creadaPor', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      // findFirst con desasignadaEn: null simulado como null: el mock representa
      // que la única fila existente está cerrada y por lo tanto no la satisface.
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([TASK_CREATOR_ID], expect.anything());
    });

    it('con asignaciones cerradas y una activa: solo el activo es candidato, ningún histórico recibe notificación', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      // El mock de findFirst ya representa el filtro desasignadaEn: null aplicado
      // por Prisma: solo la fila activa (B) puede ser el resultado, nunca un
      // histórico, sin importar cuántas filas cerradas existan.
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: ASSIGNEE_B });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([ASSIGNEE_B], expect.anything());
    });
  });

  describe('reasignación y desasignación en vivo (consulta en cada llamada, sin caché)', () => {
    it('comentario 1 notifica a A, tras reasignar a B el comentario 2 notifica solo a B, y tras desasignar el comentario 3 notifica a creadaPor', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      // Comentario 1: A está asignado activamente.
      prisma.asignacionTarea.findFirst.mockResolvedValueOnce({ idUsuario: ASSIGNEE_A });
      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'primero');
      expect(notifications.notifyUsers).toHaveBeenNthCalledWith(1, [ASSIGNEE_A], expect.anything());

      // Reasignación (fuera de este servicio): se cierra A, se activa B.
      // Comentario 2: la consulta en vivo debe reflejar el nuevo estado.
      prisma.asignacionTarea.findFirst.mockResolvedValueOnce({ idUsuario: ASSIGNEE_B });
      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'segundo');
      expect(notifications.notifyUsers).toHaveBeenNthCalledWith(2, [ASSIGNEE_B], expect.anything());

      const segundosDestinatarios = notifications.notifyUsers.mock.calls[1][0];
      expect(segundosDestinatarios).not.toContain(ASSIGNEE_A);

      // Desasignación de B (fuera de este servicio): sin asignación activa.
      // Comentario 3: cae a creadaPor.
      prisma.asignacionTarea.findFirst.mockResolvedValueOnce(null);
      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'tercero');
      expect(notifications.notifyUsers).toHaveBeenNthCalledWith(3, [TASK_CREATOR_ID], expect.anything());

      expect(prisma.asignacionTarea.findFirst).toHaveBeenCalledTimes(3);
    });
  });

  describe('múltiples participantes: ningún adicional recibe notificación', () => {
    it('con asignado activo, destinatarios = [asignadoActivo]; sin asignado, destinatarios = [creadaPor]; nunca se amplía a participantes', async () => {
      const prisma = makePrisma();
      setupHappyPath(prisma);
      prisma.participacionProyecto.findMany.mockResolvedValue([
        { idUsuario: LEADER_ID },
        { idUsuario: TASK_CREATOR_ID },
        { idUsuario: ASSIGNEE_A },
        { idUsuario: AUTHOR_ID },
        { idUsuario: 101 },
        { idUsuario: 102 },
        { idUsuario: 103 },
        { idUsuario: 104 },
        { idUsuario: 105 },
      ]);
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      prisma.asignacionTarea.findFirst.mockResolvedValueOnce({ idUsuario: ASSIGNEE_A });
      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'x');
      expect(notifications.notifyUsers).toHaveBeenNthCalledWith(1, [ASSIGNEE_A], expect.anything());

      prisma.asignacionTarea.findFirst.mockResolvedValueOnce(null);
      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'y');
      expect(notifications.notifyUsers).toHaveBeenNthCalledWith(2, [TASK_CREATOR_ID], expect.anything());

      expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
    });
  });

  describe('persistencia fallida', () => {
    it('si comentario.create falla, no se consulta la asignación ni se notifica', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(tareaFila());
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockRejectedValue(new Error('fallo de escritura'));
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await expect(service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola')).rejects.toThrow(
        'fallo de escritura',
      );

      expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
    });
  });

  describe('canales no tarea: comentarios de proyecto e hito conservan su comportamiento previo', () => {
    it('create() con idProyecto sigue usando notifyProjectActiveParticipants, no la nueva regla de tarea', async () => {
      const prisma = makePrisma();
      prisma.proyecto.findUnique
        .mockResolvedValueOnce({ idProyecto: PROJECT_ID })
        .mockResolvedValueOnce({ estadoProyecto: EstadoProyecto.PUBLICADO, creadoPor: LEADER_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.create(AUTHOR_ID, { idProyecto: PROJECT_ID, contenido: 'Hola' });

      expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
      expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    });

    it('create() con idHito sigue usando notifyProjectActiveParticipants, no la nueva regla de tarea', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue(null);
      prisma.proyecto.findUnique.mockResolvedValueOnce({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.hito.findUnique.mockResolvedValue({ idProyecto: PROJECT_ID });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      const notifications = makeNotifications();
      const service = new ComentariosService(prisma, notifications);

      await service.create(AUTHOR_ID, { idHito: 3, contenido: 'Hola' });

      expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalledTimes(1);
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
      expect(prisma.asignacionTarea.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('regresión Tarea 34: la regla de comentarios es independiente del rol de la tarea', () => {
    it('una tarea con idRolProyecto y asignado activo sigue notificando solo al asignado, nunca a los miembros del rol', async () => {
      const prisma = makePrisma();
      // La tarea SÍ tiene rol (a diferencia de tareaFila(), que no lo
      // incluye); ComentariosService no selecciona ni consulta
      // idRolProyecto en ningún punto de createForTask/getTareaEnProyectoOrThrow.
      prisma.tarea.findFirst.mockResolvedValue({
        idTarea: TASK_ID,
        idProyecto: PROJECT_ID,
        creadaPor: TASK_CREATOR_ID,
      });
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: ASSIGNEE_A });
      const notifications = {
        ...makeNotifications(),
        notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof makeNotifications>;
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([ASSIGNEE_A], expect.anything());
      expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
      expect(notifications.notifyProjectActiveParticipants).not.toHaveBeenCalled();
      // El `select` de getTareaEnProyectoOrThrow no cambia: nunca se pide
      // idRolProyecto para resolver destinatarios de comentarios.
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

    it('una tarea con rol pero sin asignación activa sigue usando creadaPor como fallback, nunca los miembros del rol', async () => {
      const prisma = makePrisma();
      prisma.tarea.findFirst.mockResolvedValue({
        idTarea: TASK_ID,
        idProyecto: PROJECT_ID,
        creadaPor: TASK_CREATOR_ID,
      });
      prisma.proyecto.findUnique.mockResolvedValue({
        estadoProyecto: EstadoProyecto.PUBLICADO,
        creadoPor: LEADER_ID,
      });
      prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
      prisma.comentario.create.mockResolvedValue({ idComentario: COMMENT_ID });
      prisma.asignacionTarea.findFirst.mockResolvedValue(null);
      const notifications = {
        ...makeNotifications(),
        notifyRoleMembers: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof makeNotifications>;
      const service = new ComentariosService(prisma, notifications);

      await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Hola');

      expect(notifications.notifyUsers).toHaveBeenCalledWith([TASK_CREATOR_ID], expect.anything());
      expect(notifications.notifyRoleMembers).not.toHaveBeenCalled();
    });
  });
});
