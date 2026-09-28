import { ForbiddenException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatGateway } from '../../src/chat/chat.gateway';
import { ChatService } from '../../src/chat/chat.service';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationProject, createIntegrationUser } from './setup/fixtures';


describeIntegration('ChatService — chats archivados sobre PostgreSQL real (T-237)', () => {
  let prisma: PrismaClient;
  let gateway: { broadcastMessage: ReturnType<typeof vi.fn>; notifyConversationCreated: ReturnType<typeof vi.fn> };
  let service: ChatService;
  let scope: IntegrationCleanupScope;
  let conversacionIds: number[];

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    gateway = { broadcastMessage: vi.fn(), notifyConversationCreated: vi.fn() };
    const db = prisma as unknown as PrismaService;
    service = new ChatService(db, gateway as unknown as ChatGateway, new UserNameSearchService(db));
    scope = {};
    conversacionIds = [];
  });

  afterEach(async () => {
    if (conversacionIds.length > 0) {
      await prisma.$transaction([
        prisma.mensajeChat.deleteMany({ where: { idConversacion: { in: conversacionIds } } }),
        prisma.conversacionParticipante.deleteMany({ where: { idConversacion: { in: conversacionIds } } }),
        prisma.conversacion.deleteMany({ where: { idConversacion: { in: conversacionIds } } }),
      ]);
    }
    await cleanupIntegrationFixtures(prisma, scope);
  });

  async function crearConversacion(
    idProyecto: number,
    creadaPor: number,
    idsParticipantes: number[],
    nombre: string | null,
  ) {
    const conversacion = await prisma.conversacion.create({
      data: {
        idProyecto,
        tipo: nombre ? 'GRUPAL' : 'INDIVIDUAL',
        nombre,
        creadaPor,
        participantes: { create: idsParticipantes.map((idUsuario) => ({ idUsuario })) },
      },
    });
    conversacionIds.push(conversacion.idConversacion);
    return conversacion;
  }

  /**
   * Usuario "yo" con dos chats en un proyecto CERRADO (uno grupal con nombre
   * acentuado y uno individual con Saúl), más dos chats que nunca deben
   * aparecer en sus archivados: uno con el mismo nombre en un proyecto
   * activo y otro en el proyecto cerrado del que "yo" no participa.
   */
  async function escenario() {
    const yo = await createIntegrationUser(prisma, { nombre: 'Marta', apellido: 'Lemus' });
    const saul = await createIntegrationUser(prisma, { nombre: 'Saúl', apellido: 'Castillo' });
    const rosa = await createIntegrationUser(prisma, { nombre: 'Rosa', apellido: 'Fuentes' });
    scope.userIds = [yo.idUsuario, saul.idUsuario, rosa.idUsuario];

    const cerrado = await createIntegrationProject(prisma, yo.idUsuario, { estadoProyecto: 'CERRADO' });
    const activo = await createIntegrationProject(prisma, yo.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    scope.projectIds = [cerrado.idProyecto, activo.idProyecto];

    const grupal = await crearConversacion(
      cerrado.idProyecto,
      yo.idUsuario,
      [yo.idUsuario, rosa.idUsuario],
      'Comité de Logística',
    );
    const individual = await crearConversacion(cerrado.idProyecto, yo.idUsuario, [yo.idUsuario, saul.idUsuario], null);
    const activa = await crearConversacion(
      activo.idProyecto,
      yo.idUsuario,
      [yo.idUsuario, rosa.idUsuario],
      'Logística general',
    );
    const ajena = await crearConversacion(
      cerrado.idProyecto,
      rosa.idUsuario,
      [rosa.idUsuario, saul.idUsuario],
      'Logística externa',
    );

    return { yo, saul, rosa, cerrado, activo, grupal, individual, activa, ajena };
  }

  describe('rechazo de mensajes en un chat archivado', () => {
    it('createMessage lanza Forbidden, no guarda el mensaje y no retransmite nada por socket', async () => {
      const e = await escenario();

      await expect(
        service.createMessage(e.cerrado.idProyecto, e.grupal.idConversacion, e.yo.idUsuario, 'mensaje tardío'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const guardados = await prisma.mensajeChat.count({ where: { idConversacion: e.grupal.idConversacion } });
      expect(guardados).toBe(0);
      expect(gateway.broadcastMessage).not.toHaveBeenCalled();
    });

    it('en el chat de un proyecto activo el mismo envío sí se guarda y se retransmite', async () => {
      const e = await escenario();

      const mensaje = await service.createMessage(
        e.activo.idProyecto,
        e.activa.idConversacion,
        e.yo.idUsuario,
        'mensaje normal',
      );

      expect(mensaje.contenido).toBe('mensaje normal');
      expect(gateway.broadcastMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('historial después de archivar', () => {
    it('getMessages devuelve todos los mensajes previos al cierre, en orden y con su remitente', async () => {
      const e = await escenario();
      const base = new Date('2026-09-01T10:00:00Z');
      for (const [indice, contenido] of ['primero', 'segundo', 'tercero'].entries()) {
        await prisma.mensajeChat.create({
          data: {
            idConversacion: e.grupal.idConversacion,
            idRemitente: indice % 2 === 0 ? e.yo.idUsuario : e.rosa.idUsuario,
            contenido,
            enviadoEn: new Date(base.getTime() + indice * 60_000),
          },
        });
      }

      const historial = await service.getMessages(e.cerrado.idProyecto, e.grupal.idConversacion, e.yo.idUsuario);

      expect(historial.map((m) => m.contenido)).toEqual(['primero', 'segundo', 'tercero']);
      expect(historial[1].remitente.nombre).toBe('Rosa');
    });
  });

  describe('lista principal y lista de archivados', () => {
    it('en la lista del proyecto cerrado cada conversación viene marcada como archivada', async () => {
      const e = await escenario();

      const lista = await service.listConversations(e.cerrado.idProyecto, e.yo.idUsuario);

      expect(lista.map((c) => c.idConversacion).sort()).toEqual(
        [e.grupal.idConversacion, e.individual.idConversacion].sort(),
      );
      expect(lista.every((c) => c.archivada)).toBe(true);
    });

    it('en la lista del proyecto activo ninguna conversación viene archivada', async () => {
      const e = await escenario();

      const lista = await service.listConversations(e.activo.idProyecto, e.yo.idUsuario);

      expect(lista.map((c) => c.idConversacion)).toEqual([e.activa.idConversacion]);
      expect(lista[0].archivada).toBe(false);
    });

    it('archivados trae solo los chats del proyecto cerrado en los que participa el usuario', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, {});

      expect(items.map((c) => c.idConversacion).sort()).toEqual(
        [e.grupal.idConversacion, e.individual.idConversacion].sort(),
      );
      expect(items.every((c) => c.archivada)).toBe(true);
    });
  });

  describe('búsqueda en archivados', () => {
    it('"logistica" (sin tilde) encuentra "Comité de Logística" y no trae el chat activo ni el ajeno', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'logistica' });

      expect(items.map((c) => c.idConversacion)).toEqual([e.grupal.idConversacion]);
    });

    it('"COMITÉ" (mayúsculas y tilde) encuentra el mismo chat', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'COMITÉ' });

      expect(items.map((c) => c.idConversacion)).toEqual([e.grupal.idConversacion]);
    });

    it('"saul" (sin tilde) encuentra el chat individual con Saúl por su nombre', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'saul' });

      expect(items.map((c) => c.idConversacion)).toEqual([e.individual.idConversacion]);
    });

    it('"castillo" encuentra el mismo chat por el apellido de la persona', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'castillo' });

      expect(items.map((c) => c.idConversacion)).toEqual([e.individual.idConversacion]);
    });

    it('buscar el nombre propio del usuario no devuelve todos sus chats', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'marta' });

      expect(items).toEqual([]);
    });

    it('un texto que no aparece en ningún nombre no devuelve resultados', async () => {
      const e = await escenario();

      const { items } = await service.listArchivedConversations(e.yo.idUsuario, { q: 'zzz-no-existe-zzz' });

      expect(items).toEqual([]);
    });
  });
});
