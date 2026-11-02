import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { RolOrganizacion, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { ChatService } from '../../src/chat/chat.service';
import { OrganizationChatService } from '../../src/organizations/organization-chat.service';
import type { ChatGateway } from '../../src/chat/chat.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { ChatStoragePort } from '../../src/storage/chat-storage.port';

const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]);

/** MEJ-41/42/43 contra PostgreSQL real: notas de voz, encuestas en vivo y mensajes fijados. */
describeIntegration('CHAT — notas de voz, encuestas y fijados (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let chat: ChatService;
  let orgChat: OrganizationChatService;
  const gateway = {
    notifyConversationCreated: vi.fn(),
    removeFromConversation: vi.fn(),
    broadcastMessage: vi.fn(),
    broadcastMessageChange: vi.fn(),
    broadcastPollUpdated: vi.fn(),
  };
  const storage = { upload: vi.fn(), destroy: vi.fn() };
  const userIds: number[] = [];
  let lider: number;
  let autor: number;
  let otro: number;
  let idProyecto: number;
  let idConversacion: number;
  let idOrganizacion: number;
  let propietario: number;
  let admin: number;
  let editor: number;
  let lectura: number;
  let idConversacionOrg: number;

  const nuevoUsuario = async () => {
    const u = await createIntegrationUser(prisma);
    userIds.push(u.idUsuario);
    return u.idUsuario;
  };
  const texto = (idConv: number, idRemitente: number, contenido: string) =>
    prisma.mensajeChat.create({ data: { idConversacion: idConv, idRemitente, contenido } });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    chat = new ChatService(prismaService, gateway as unknown as ChatGateway, storage as unknown as ChatStoragePort);
    orgChat = new OrganizationChatService(prismaService, gateway as unknown as ChatGateway, chat);

    [lider, autor, otro, propietario, admin, editor, lectura] = [
      await nuevoUsuario(), await nuevoUsuario(), await nuevoUsuario(),
      await nuevoUsuario(), await nuevoUsuario(), await nuevoUsuario(), await nuevoUsuario(),
    ];
    const proyecto = await createIntegrationProject(prisma, lider, { estadoProyecto: 'EN_PROGRESO' });
    idProyecto = proyecto.idProyecto;
    const rol = await createIntegrationProjectRole(prisma, idProyecto, { cupos: 5 });
    await createIntegrationParticipation(prisma, autor, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    await createIntegrationParticipation(prisma, otro, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    const conversacion = await prisma.conversacion.create({
      data: {
        idProyecto,
        tipo: 'GRUPAL',
        nombre: 'Equipo',
        creadaPor: lider,
        participantes: { create: [lider, autor, otro].map((idUsuario) => ({ idUsuario })) },
      },
    });
    idConversacion = conversacion.idConversacion;

    const org = await prisma.organizacion.create({ data: { nombreOrganizacion: `Org chat ${Date.now()}`, creadaPor: propietario } });
    idOrganizacion = org.idOrganizacion;
    await prisma.usuarioOrganizacion.createMany({
      data: [
        { idOrganizacion, idUsuario: propietario, rolOrganizacion: RolOrganizacion.PROPIETARIO },
        { idOrganizacion, idUsuario: admin, rolOrganizacion: RolOrganizacion.ADMINISTRADOR },
        { idOrganizacion, idUsuario: editor, rolOrganizacion: RolOrganizacion.EDITOR },
        { idOrganizacion, idUsuario: lectura, rolOrganizacion: RolOrganizacion.LECTURA },
      ],
    });
    idConversacionOrg = await orgChat.sincronizar(idOrganizacion);
  });

  afterAll(async () => {
    const convs = [idConversacion, idConversacionOrg].filter(Boolean);
    const mensajes = await prisma.mensajeChat.findMany({ where: { idConversacion: { in: convs } }, select: { idMensaje: true } });
    const ids = mensajes.map((m) => m.idMensaje);
    await prisma.votoEncuestaChat.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.encuestaChat.deleteMany({ where: { idMensaje: { in: ids } } });
    await prisma.adjuntoMensajeChat.deleteMany({ where: { idConversacion: { in: convs } } });
    await prisma.mensajeChat.deleteMany({ where: { idConversacion: { in: convs } } });
    await prisma.conversacionParticipante.deleteMany({ where: { idConversacion: { in: convs } } });
    await prisma.conversacion.deleteMany({ where: { idConversacion: { in: convs } } });
    await prisma.usuarioOrganizacion.deleteMany({ where: { idOrganizacion } });
    await prisma.organizacion.deleteMany({ where: { idOrganizacion } });
    const roles = await prisma.rolProyecto.findMany({ where: { idProyecto }, select: { idRolProyecto: true } });
    const participaciones = await prisma.participacionProyecto.findMany({
      where: { idRolProyecto: { in: roles.map((r) => r.idRolProyecto) } },
      select: { idParticipacion: true },
    });
    await cleanupIntegrationFixtures(prisma, {
      participationIds: participaciones.map((p) => p.idParticipacion),
      roleIds: roles.map((r) => r.idRolProyecto),
      projectIds: [idProyecto],
      userIds,
    });
    await prisma.$disconnect();
  });

  // ─── MEJ-41 ──────────────────────────────────────────────────────────────

  it('una nota de voz valida se guarda con su duracion y no aparece en la galeria de archivos', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', { buffer: webm(), mimetype: 'audio/webm;codecs=opus', originalname: 'x' }, undefined, {
      duracionSegundos: 30,
    });
    expect(m.adjunto).toMatchObject({ mime: 'audio/webm', duracionSegundos: 30, nombreOriginal: 'nota-de-voz.webm' });
    const archivos = await chat.getArchivos(idProyecto, idConversacion, autor);
    expect(archivos.items.map((i) => i.idMensaje)).not.toContain(m.idMensaje);
  });

  it('la base rechaza duraciones fuera de 1..120 s aunque se salte el servicio', async () => {
    const m = await texto(idConversacion, autor, 'x');
    await expect(
      prisma.adjuntoMensajeChat.create({
        data: { idMensaje: m.idMensaje, idConversacion, nombreOriginal: 'a.webm', mime: 'audio/webm', tamanoBytes: 10, claveAlmacenamiento: 'k', duracionSegundos: 121 },
      }),
    ).rejects.toThrow();
  });

  it('un archivo que no es audio se rechaza y no se sube', async () => {
    storage.upload.mockClear();
    await expect(
      chat.createMessage(idProyecto, idConversacion, autor, '', { buffer: Buffer.from('MZ\x90\x00'), mimetype: 'audio/webm', originalname: 'a.webm' }, undefined, {
        duracionSegundos: 5,
      }),
    ).rejects.toThrow('Tipo de audio no permitido');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  // ─── MEJ-42 ──────────────────────────────────────────────────────────────

  it('encuesta: voto unico se reemplaza, multiple acumula, y los resultados salen por socket', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Dia?', opciones: ['Lunes', 'Martes', 'Jueves'] },
    });
    const [a, b] = m.encuesta!.opciones;
    await chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [a.idOpcion]);
    const r = await chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [b.idOpcion]);
    expect(r.opciones.map((o) => o.votos.length)).toEqual([0, 1, 0]);
    expect(gateway.broadcastPollUpdated).toHaveBeenLastCalledWith(idConversacion, m.idMensaje, expect.objectContaining({ idEncuesta: r.idEncuesta }));
    await expect(chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [a.idOpcion, b.idOpcion])).rejects.toThrow('un solo voto');

    const retirado = await chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, []);
    expect(retirado.opciones.every((o) => o.votos.length === 0)).toBe(true);

    const multi = await chat.createMessage(idProyecto, idConversacion, lider, '', undefined, undefined, {
      encuesta: { pregunta: '¿Dias?', opciones: ['L', 'M'], multiple: true },
    });
    const ids = multi.encuesta!.opciones.map((o) => o.idOpcion);
    const rm = await chat.votarEncuesta(idProyecto, idConversacion, multi.idMensaje, otro, ids);
    expect(rm.opciones.map((o) => o.votos.length)).toEqual([1, 1]);
  });

  it('encuesta de voto unico: dos votos simultaneos del mismo usuario dejan un solo voto', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Carrera?', opciones: ['A', 'B'] },
    });
    const [a, b] = m.encuesta!.opciones;
    await Promise.all([
      chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [a.idOpcion]),
      chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [b.idOpcion]),
    ]);
    const votos = await prisma.votoEncuestaChat.count({ where: { idUsuario: otro, opcion: { idEncuesta: m.encuesta!.idEncuesta } } });
    expect(votos).toBe(1);
  });

  it('un voto que espera el bloqueo de la encuesta ve el cierre confirmado antes', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Cierre?', opciones: ['A', 'B'] },
    });
    const { idEncuesta, opciones } = m.encuesta!;
    let voto!: Promise<unknown>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "encuesta_chat" WHERE "id_encuesta" = ${idEncuesta} FOR UPDATE`;
      voto = chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [opciones[0].idOpcion]);
      voto.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      await tx.encuestaChat.update({ where: { idEncuesta }, data: { cerradaEn: new Date() } });
    });
    await expect(voto).rejects.toThrow('cerrada');
    expect(await prisma.votoEncuestaChat.count({ where: { idUsuario: otro, opcion: { idEncuesta } } })).toBe(0);
  });

  it('encuesta cerrada (manual o por fecha) no admite votos; solo autor o lider la cierran', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Si?', opciones: ['Si', 'No'] },
    });
    const opcion = m.encuesta!.opciones[0].idOpcion;
    await expect(chat.cerrarEncuesta(idProyecto, idConversacion, m.idMensaje, otro)).rejects.toThrow('Solo quien creó');
    await chat.cerrarEncuesta(idProyecto, idConversacion, m.idMensaje, lider);
    await expect(chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, otro, [opcion])).rejects.toThrow('cerrada');

    const porFecha = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Pronto?', opciones: ['Si', 'No'], cierraEn: new Date(Date.now() + 60_000).toISOString() },
    });
    await prisma.encuestaChat.update({ where: { idMensaje: porFecha.idMensaje }, data: { cierraEn: new Date(Date.now() - 1000) } });
    await expect(
      chat.votarEncuesta(idProyecto, idConversacion, porFecha.idMensaje, otro, [porFecha.encuesta!.opciones[0].idOpcion]),
    ).rejects.toThrow('cerrada');
  });

  it('quien no participa en la conversacion no vota ni ve la encuesta', async () => {
    const ajeno = await nuevoUsuario();
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Privada?', opciones: ['Si', 'No'] },
    });
    await expect(chat.votarEncuesta(idProyecto, idConversacion, m.idMensaje, ajeno, [m.encuesta!.opciones[0].idOpcion])).rejects.toThrow();
  });

  it('el historial incluye las encuestas con sus votos y oculta la de un mensaje eliminado', async () => {
    const m = await chat.createMessage(idProyecto, idConversacion, autor, '', undefined, undefined, {
      encuesta: { pregunta: '¿Borrar?', opciones: ['Si', 'No'] },
    });
    const antes = (await chat.getMessages(idProyecto, idConversacion, otro)).find((x) => x.idMensaje === m.idMensaje);
    expect(antes?.encuesta?.opciones).toHaveLength(2);
    await chat.deleteMessage(idProyecto, idConversacion, m.idMensaje, autor);
    const despues = (await chat.getMessages(idProyecto, idConversacion, otro)).find((x) => x.idMensaje === m.idMensaje);
    expect(despues?.encuesta).toBeNull();
  });

  // ─── MEJ-43 ──────────────────────────────────────────────────────────────

  it('proyecto: lider y autor fijan; otro participante no; maximo 3 incluso en paralelo', async () => {
    const mensajes = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => texto(idConversacion, autor, `fijable ${n}`)));
    await expect(chat.fijarMensaje(idProyecto, idConversacion, mensajes[0].idMensaje, otro, true)).rejects.toThrow('líder del proyecto o el autor');

    const resultados = await Promise.allSettled([
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[0].idMensaje, autor, true),
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[1].idMensaje, lider, true),
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[2].idMensaje, autor, true),
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[3].idMensaje, lider, true),
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[4].idMensaje, autor, true),
      chat.fijarMensaje(idProyecto, idConversacion, mensajes[5].idMensaje, lider, true),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(3);
    expect(await chat.getFijados(idProyecto, idConversacion, otro)).toHaveLength(3);

    const fijado = (await chat.getFijados(idProyecto, idConversacion, otro))[0];
    await chat.fijarMensaje(idProyecto, idConversacion, fijado.idMensaje, lider, false);
    expect(await chat.getFijados(idProyecto, idConversacion, otro)).toHaveLength(2);
    expect(gateway.broadcastMessageChange).toHaveBeenCalledWith('messageUpdated', idConversacion, expect.any(Array), expect.objectContaining({ idMensaje: fijado.idMensaje, fijadoEn: null }));
  });

  it('un mensaje eliminado deja de contar y de aparecer entre los fijados', async () => {
    const fijados = await chat.getFijados(idProyecto, idConversacion, lider);
    const m = fijados[0];
    await prisma.mensajeChat.update({ where: { idMensaje: m.idMensaje }, data: { eliminadoEn: new Date() } });
    expect((await chat.getFijados(idProyecto, idConversacion, lider)).map((x) => x.idMensaje)).not.toContain(m.idMensaje);
    const nuevo = await texto(idConversacion, autor, 'reemplazo');
    await expect(chat.fijarMensaje(idProyecto, idConversacion, nuevo.idMensaje, autor, true)).resolves.toBeDefined();
  });

  it('organizacion: solo Propietario y Administrador fijan; Editor y Lectura leen pero no fijan; maximo 3', async () => {
    const mensajes = await Promise.all([1, 2, 3, 4].map((n) => texto(idConversacionOrg, editor, `org ${n}`)));
    for (const rol of [editor, lectura]) {
      await expect(orgChat.fijar(rol, idOrganizacion, mensajes[0].idMensaje, true)).rejects.toThrow('Solo el propietario y los administradores');
    }
    await orgChat.fijar(propietario, idOrganizacion, mensajes[0].idMensaje, true);
    await orgChat.fijar(admin, idOrganizacion, mensajes[1].idMensaje, true);
    await orgChat.fijar(admin, idOrganizacion, mensajes[2].idMensaje, true);
    await expect(orgChat.fijar(propietario, idOrganizacion, mensajes[3].idMensaje, true)).rejects.toThrow('hasta 3 mensajes');

    expect((await orgChat.fijados(lectura, idOrganizacion)).map((m) => m.idMensaje)).toEqual(mensajes.slice(0, 3).map((m) => m.idMensaje));
    await expect(orgChat.fijar(lectura, idOrganizacion, mensajes[0].idMensaje, false)).rejects.toThrow();
    await orgChat.fijar(propietario, idOrganizacion, mensajes[0].idMensaje, false);
    expect(await orgChat.fijados(editor, idOrganizacion)).toHaveLength(2);
  });

  it('organizacion: un no miembro no fija ni lee, y un mensaje de otra conversacion no se fija', async () => {
    const ajeno = await nuevoUsuario();
    await expect(orgChat.fijar(ajeno, idOrganizacion, 1, true)).rejects.toThrow();
    await expect(orgChat.fijados(ajeno, idOrganizacion)).rejects.toThrow();
    const deProyecto = await texto(idConversacion, autor, 'del proyecto');
    await expect(orgChat.fijar(propietario, idOrganizacion, deProyecto.idMensaje, true)).rejects.toThrow('no encontrado');
  });
});
