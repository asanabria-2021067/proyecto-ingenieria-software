import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { ComentariosService } from '../src/comentarios/comentarios.service';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

/**
 * HU-200 (T-379): menciones con @ en los tres canales de comentarios.
 * Cubre la validación (solo líder o participantes ACTIVO del proyecto), la
 * persistencia en `MencionComentario`, la notificación `MENCION_COMENTARIO`
 * (que reemplaza al aviso genérico para el mencionado) y la edición, que solo
 * avisa a quien se agrega.
 */

const PROJECT_ID = 5;
const TASK_ID = 42;
const HITO_ID = 8;
const COMMENT_ID = 99;
const LEADER_ID = 1;
const AUTHOR_ID = 2;
const MEMBER_A = 10;
const MEMBER_B = 20;
const RETIRED_ID = 30;
const OUTSIDER_ID = 77;
const TASK_CREATOR_ID = 7;

/** Participantes ACTIVO del proyecto en estas pruebas. */
const ACTIVOS = [AUTHOR_ID, MEMBER_A, MEMBER_B];

function makePrisma() {
  const prisma = {
    comentario: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
    proyecto: { findUnique: vi.fn() },
    hito: { findUnique: vi.fn() },
    tarea: { findFirst: vi.fn(), findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
    participacionProyecto: { findFirst: vi.fn(), findMany: vi.fn() },
    asignacionTarea: { findFirst: vi.fn() },
    mencionComentario: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };

  prisma.proyecto.findUnique.mockResolvedValue({
    idProyecto: PROJECT_ID,
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    creadoPor: LEADER_ID,
    tituloProyecto: 'Huerto UVG',
  });
  prisma.participacionProyecto.findFirst.mockImplementation(({ where }: { where: { idUsuario: number } }) =>
    Promise.resolve(ACTIVOS.includes(where.idUsuario) ? { idParticipacion: 1 } : null),
  );
  // Elegibilidad: devuelve solo los candidatos con participación ACTIVO.
  prisma.participacionProyecto.findMany.mockImplementation(
    ({ where }: { where: { idUsuario?: { in: number[] } } }) =>
      Promise.resolve(
        (where.idUsuario?.in ?? []).filter((id) => ACTIVOS.includes(id)).map((idUsuario) => ({ idUsuario })),
      ),
  );
  prisma.tarea.findFirst.mockResolvedValue({
    idTarea: TASK_ID,
    idProyecto: PROJECT_ID,
    creadaPor: TASK_CREATOR_ID,
    idSprint: 3,
  });
  prisma.tarea.findUnique.mockResolvedValue({ tituloTarea: 'Diseñar logo' });
  prisma.hito.findUnique.mockResolvedValue({ idProyecto: PROJECT_ID, tituloHito: 'Entrega 1' });
  prisma.usuario.findUnique.mockResolvedValue({ nombre: 'Ana', apellido: 'Pérez' });
  prisma.asignacionTarea.findFirst.mockResolvedValue({ idUsuario: MEMBER_A });
  prisma.comentario.create.mockImplementation(({ data }: { data: { contenido: string } }) =>
    Promise.resolve({ idComentario: COMMENT_ID, ...data }),
  );
  prisma.comentario.update.mockImplementation(({ data }: { data: { contenido?: string } }) =>
    Promise.resolve({ idComentario: COMMENT_ID, ...data }),
  );
  prisma.mencionComentario.findMany.mockResolvedValue([]);
  return prisma as typeof prisma & ConstructorParameters<typeof ComentariosService>[0];
}

function makeNotifications() {
  const notifications = {
    notifyUsers: vi.fn().mockResolvedValue(undefined),
    notifyFromTemplate: vi.fn().mockResolvedValue(undefined),
    notifyProjectActiveParticipants: vi.fn().mockResolvedValue(undefined),
  };
  return notifications as typeof notifications & ConstructorParameters<typeof ComentariosService>[1];
}

function buildService(
  prisma: ReturnType<typeof makePrisma>,
  notifications: ReturnType<typeof makeNotifications>,
  readPolicy = makeProjectReadPolicyDouble(),
) {
  return new ComentariosService(
    prisma,
    notifications,
    makeProjectTransactionDouble({ tx: prisma }),
    makeProjectPolicyDouble(),
    readPolicy,
  );
}

const mencion = (id: number, nombre = `Usuario ${id}`) => `@[${nombre}](${id})`;

describe('HU-200 — menciones en comentarios de tarea (createForTask)', () => {
  it('guarda la mención de un participante activo y le envía MENCION_COMENTARIO con enlace al comentario', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);
    const contenido = `Revisa esto ${mencion(MEMBER_B, 'Luis Gómez')}`;

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `  ${contenido}  `);

    expect(prisma.comentario.create).toHaveBeenCalledWith({
      data: { idAutor: AUTHOR_ID, idTarea: TASK_ID, contenido },
    });
    expect(prisma.mencionComentario.createMany).toHaveBeenCalledWith({
      data: [{ idComentario: COMMENT_ID, idUsuario: MEMBER_B }],
      skipDuplicates: true,
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([MEMBER_B], 'MENCION_COMENTARIO', {
      autorNombre: 'Ana Pérez',
      contexto: 'TAREA',
      tituloContexto: 'Diseñar logo',
      idProyecto: PROJECT_ID,
      idComentario: COMMENT_ID,
      idTarea: TASK_ID,
      idHito: null,
    });
  });

  it('el líder del proyecto es mencionable aunque no tenga participación', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `Aviso ${mencion(LEADER_ID)}`);

    expect(prisma.mencionComentario.createMany).toHaveBeenCalledWith({
      data: [{ idComentario: COMMENT_ID, idUsuario: LEADER_ID }],
      skipDuplicates: true,
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([LEADER_ID], 'MENCION_COMENTARIO', expect.anything());
  });

  it('una mención a alguien fuera del proyecto (o retirado) se guarda como texto y no notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(
      PROJECT_ID,
      TASK_ID,
      AUTHOR_ID,
      `Hola ${mencion(OUTSIDER_ID, 'Externo')} y ${mencion(RETIRED_ID, 'Retirado')}`,
    );

    expect(prisma.comentario.create).toHaveBeenCalledWith({
      data: { idAutor: AUTHOR_ID, idTarea: TASK_ID, contenido: 'Hola @Externo y @Retirado' },
    });
    expect(prisma.mencionComentario.createMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('mezcla válidas e inválidas: solo persiste y notifica las válidas', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `${mencion(MEMBER_B, 'Luis')} ${mencion(OUTSIDER_ID, 'X')}`);

    expect(prisma.comentario.create).toHaveBeenCalledWith({
      data: { idAutor: AUTHOR_ID, idTarea: TASK_ID, contenido: '@[Luis](20) @X' },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([MEMBER_B], 'MENCION_COMENTARIO', expect.anything());
  });

  it('auto-mención: se guarda y resalta, pero el autor no recibe aviso', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `Nota para mí ${mencion(AUTHOR_ID)}`);

    expect(prisma.mencionComentario.createMany).toHaveBeenCalledWith({
      data: [{ idComentario: COMMENT_ID, idUsuario: AUTHOR_ID }],
      skipDuplicates: true,
    });
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('el asignado mencionado recibe solo la mención, no además el «Nuevo comentario»', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `Listo ${mencion(MEMBER_A)}`);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([MEMBER_A], 'MENCION_COMENTARIO', expect.anything());
    expect(notifications.notifyUsers).toHaveBeenCalledWith([], expect.objectContaining({ tipoNotificacion: 'COMENTARIO_TAREA' }));
  });

  it('si el mencionado no es el asignado, el asignado conserva su «Nuevo comentario»', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, `Listo ${mencion(MEMBER_B)}`);

    expect(notifications.notifyUsers).toHaveBeenCalledWith(
      [MEMBER_A],
      expect.objectContaining({ tipoNotificacion: 'COMENTARIO_TAREA' }),
    );
  });

  it('sin menciones no consulta elegibilidad ni toca la tabla de menciones', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, 'Comentario normal @sin token');

    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
    expect(prisma.mencionComentario.createMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('valida la elegibilidad contra el proyecto del comentario, no contra otro', async () => {
    const prisma = makePrisma();
    const service = buildService(prisma, makeNotifications());

    await service.createForTask(PROJECT_ID, TASK_ID, AUTHOR_ID, mencion(MEMBER_B));

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
      where: { idUsuario: { in: [MEMBER_B] }, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: PROJECT_ID } },
      select: { idUsuario: true },
    });
  });

  it('si la escritura falla (sin permiso para comentar), no guarda menciones ni notifica', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await expect(service.createForTask(PROJECT_ID, TASK_ID, OUTSIDER_ID, mencion(MEMBER_B))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.comentario.create).not.toHaveBeenCalled();
    expect(prisma.mencionComentario.createMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});

describe('HU-200 — menciones en comentarios de proyecto e hito (create)', () => {
  it('proyecto: notifica la mención con contexto PROYECTO y excluye al mencionado del aviso genérico', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.create(AUTHOR_ID, { idProyecto: PROJECT_ID, contenido: `Hola ${mencion(MEMBER_B)}` });

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([MEMBER_B], 'MENCION_COMENTARIO', {
      autorNombre: 'Ana Pérez',
      contexto: 'PROYECTO',
      tituloContexto: 'Huerto UVG',
      idProyecto: PROJECT_ID,
      idComentario: COMMENT_ID,
      idTarea: null,
      idHito: null,
    });
    expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalledWith(
      PROJECT_ID,
      AUTHOR_ID,
      expect.objectContaining({ tipoNotificacion: 'COMENTARIO_PROYECTO' }),
      undefined,
      [MEMBER_B],
    );
  });

  it('hito: el contexto es HITO con el título del hito y su id en el enlace', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.create(AUTHOR_ID, { idHito: HITO_ID, contenido: mencion(LEADER_ID) });

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [LEADER_ID],
      'MENCION_COMENTARIO',
      expect.objectContaining({ contexto: 'HITO', tituloContexto: 'Entrega 1', idHito: HITO_ID, idTarea: null }),
    );
  });

  it('sin menciones, el aviso genérico conserva su llamada original', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.create(AUTHOR_ID, { idProyecto: PROJECT_ID, contenido: 'Sin menciones' });

    expect(notifications.notifyProjectActiveParticipants).toHaveBeenCalledWith(
      PROJECT_ID,
      AUTHOR_ID,
      expect.objectContaining({ tipoNotificacion: 'COMENTARIO_PROYECTO' }),
    );
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});

describe('HU-200 — edición: sincroniza menciones y avisa solo a las nuevas', () => {
  it('updateForTask agrega la nueva mención, quita la eliminada y notifica solo a la agregada', async () => {
    const prisma = makePrisma();
    prisma.comentario.findFirst.mockResolvedValue({ idComentario: COMMENT_ID, idAutor: AUTHOR_ID });
    prisma.mencionComentario.findMany.mockResolvedValue([{ idUsuario: MEMBER_A }, { idUsuario: LEADER_ID }]);
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, {
      contenido: `${mencion(MEMBER_A)} y ahora ${mencion(MEMBER_B)}`,
    });

    expect(prisma.mencionComentario.deleteMany).toHaveBeenCalledWith({
      where: { idComentario: COMMENT_ID, idUsuario: { in: [LEADER_ID] } },
    });
    expect(prisma.mencionComentario.createMany).toHaveBeenCalledWith({
      data: [{ idComentario: COMMENT_ID, idUsuario: MEMBER_B }],
      skipDuplicates: true,
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [MEMBER_B],
      'MENCION_COMENTARIO',
      expect.objectContaining({ contexto: 'TAREA', idComentario: COMMENT_ID, idTarea: TASK_ID }),
    );
  });

  it('editar sin cambiar las menciones no vuelve a notificar a nadie', async () => {
    const prisma = makePrisma();
    prisma.comentario.findFirst.mockResolvedValue({ idComentario: COMMENT_ID, idAutor: AUTHOR_ID });
    prisma.mencionComentario.findMany.mockResolvedValue([{ idUsuario: MEMBER_B }]);
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, {
      contenido: `Texto corregido ${mencion(MEMBER_B)}`,
    });

    expect(prisma.mencionComentario.createMany).not.toHaveBeenCalled();
    expect(prisma.mencionComentario.deleteMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('quitar todas las menciones borra sus filas', async () => {
    const prisma = makePrisma();
    prisma.comentario.findFirst.mockResolvedValue({ idComentario: COMMENT_ID, idAutor: AUTHOR_ID });
    prisma.mencionComentario.findMany.mockResolvedValue([{ idUsuario: MEMBER_B }]);
    const service = buildService(prisma, makeNotifications());

    await service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, { contenido: 'Ya sin mención' });

    expect(prisma.mencionComentario.deleteMany).toHaveBeenCalledWith({
      where: { idComentario: COMMENT_ID, idUsuario: { in: [MEMBER_B] } },
    });
  });

  it('update genérico (hito) notifica la mención agregada con contexto HITO', async () => {
    const prisma = makePrisma();
    prisma.comentario.findUnique.mockResolvedValue({
      idComentario: COMMENT_ID,
      idAutor: AUTHOR_ID,
      eliminadoEn: null,
      idProyecto: null,
      idTarea: null,
      idHito: HITO_ID,
      hito: { idProyecto: PROJECT_ID },
    });
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await service.update(COMMENT_ID, AUTHOR_ID, { contenido: `Ojo ${mencion(MEMBER_B)}` });

    expect(prisma.comentario.update).toHaveBeenCalledWith({
      where: { idComentario: COMMENT_ID },
      data: { contenido: 'Ojo @[Usuario 20](20)', editadoEn: expect.any(Date) },
    });
    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith(
      [MEMBER_B],
      'MENCION_COMENTARIO',
      expect.objectContaining({ contexto: 'HITO', idHito: HITO_ID, tituloContexto: 'Entrega 1' }),
    );
  });

  it('solo el autor puede editar: otro integrante no altera las menciones', async () => {
    const prisma = makePrisma();
    prisma.comentario.findFirst.mockResolvedValue({ idComentario: COMMENT_ID, idAutor: MEMBER_A });
    const notifications = makeNotifications();
    const service = buildService(prisma, notifications);

    await expect(
      service.updateForTask(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, { contenido: mencion(MEMBER_B) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mencionComentario.createMany).not.toHaveBeenCalled();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});

describe('HU-200 — integrantes mencionables (findMencionables)', () => {
  const usuario = (idUsuario: number, nombre: string, apellido: string) => ({
    idUsuario,
    nombre,
    apellido,
    fotoUrl: null,
  });

  it('devuelve al líder y a los participantes ACTIVO, sin duplicados y ordenados por nombre', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({
      creadoPor: LEADER_ID,
      creador: usuario(LEADER_ID, 'Carlos', 'Mendoza'),
    });
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { usuario: usuario(MEMBER_B, 'Zoe', 'Ruiz') },
      { usuario: usuario(MEMBER_A, 'Ana', 'López') },
      { usuario: usuario(MEMBER_A, 'Ana', 'López') },
      { usuario: usuario(LEADER_ID, 'Carlos', 'Mendoza') },
    ]);
    const readPolicy = makeProjectReadPolicyDouble();
    const service = buildService(prisma, makeNotifications(), readPolicy);

    const result = await service.findMencionables(PROJECT_ID, LEADER_ID);

    expect(result).toEqual([
      { ...usuario(MEMBER_A, 'Ana', 'López'), esLider: false },
      { ...usuario(LEADER_ID, 'Carlos', 'Mendoza'), esLider: true },
      { ...usuario(MEMBER_B, 'Zoe', 'Ruiz'), esLider: false },
    ]);
    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
      where: { estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: PROJECT_ID } },
      select: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } },
    });
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, {
      projectId: PROJECT_ID,
      actorId: LEADER_ID,
      scope: 'resumen',
    });
  });

  it('un usuario ajeno al proyecto recibe 403 y no obtiene la lista', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
    const service = buildService(prisma, makeNotifications());

    await expect(service.findMencionables(PROJECT_ID, OUTSIDER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.participacionProyecto.findMany).not.toHaveBeenCalled();
  });

  it('un participante RETIRADO tampoco puede consultar la lista', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findUnique.mockResolvedValue({ creadoPor: LEADER_ID });
    const service = buildService(prisma, makeNotifications());

    await expect(service.findMencionables(PROJECT_ID, RETIRED_ID)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('HU-200 — contador de comentarios por hito', () => {
  it('agrupa los comentarios vivos de los hitos del proyecto', async () => {
    const prisma = makePrisma();
    prisma.comentario.groupBy.mockResolvedValue([
      { idHito: HITO_ID, _count: { _all: 3 } },
      { idHito: 9, _count: { _all: 1 } },
    ]);
    const service = buildService(prisma, makeNotifications());

    const result = await service.countByHitosDelProyecto(PROJECT_ID, MEMBER_A);

    expect(result).toEqual([
      { idHito: HITO_ID, cantidad: 3 },
      { idHito: 9, cantidad: 1 },
    ]);
    expect(prisma.comentario.groupBy).toHaveBeenCalledWith({
      by: ['idHito'],
      where: { eliminadoEn: null, hito: { idProyecto: PROJECT_ID } },
      _count: { _all: true },
    });
  });

  it('un usuario ajeno al proyecto recibe 403', async () => {
    const prisma = makePrisma();
    const service = buildService(prisma, makeNotifications());

    await expect(service.countByHitosDelProyecto(PROJECT_ID, OUTSIDER_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.comentario.groupBy).not.toHaveBeenCalled();
  });
});
