import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ChatService } from '../src/chat/chat.service';

// T-237: al finalizar un proyecto (estadoProyecto pasa a CERRADO dentro de
// la transacción de ProjectClosureReviewService.approveClosure — no
// duplicado acá), su chat queda archivado. Como "archivado" se deriva de
// Proyecto.estadoProyecto (ver el comentario en chat.service.ts), estas
// pruebas simulan "después del cierre" con un proyecto ya CERRADO en el
// mock de Prisma, sin tener que ejercitar la transacción de cierre en sí.

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    conversacion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    conversacionParticipante: { update: vi.fn(), findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    mensajeChat: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  };
}

function makeGateway() {
  return { broadcastMessage: vi.fn(), notifyConversationCreated: vi.fn() };
}

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Pérez', fotoUrl: null };

function proyectoRow(estadoProyecto: 'PUBLICADO' | 'EN_PROGRESO' | 'CERRADO', overrides: Partial<{ creadoPor: number }> = {}) {
  return { idProyecto: 10, creadoPor: overrides.creadoPor ?? 1, estadoProyecto };
}

function conversacionRow(
  estadoProyecto: 'PUBLICADO' | 'EN_PROGRESO' | 'CERRADO',
  overrides: Partial<{ idConversacion: number; participantes: { idUsuario: number }[] }> = {},
) {
  return {
    idConversacion: overrides.idConversacion ?? 5,
    idProyecto: 10,
    tipo: 'INDIVIDUAL' as const,
    nombre: null,
    participantes: overrides.participantes ?? [{ idUsuario: 1 }, { idUsuario: 2 }],
    proyecto: { estadoProyecto },
  };
}

describe('ChatService — T-234/T-237: archivado derivado de Proyecto.estadoProyecto', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: ReturnType<typeof makeGateway>;
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = makeGateway();
    service = new ChatService(prisma as any, gateway as any);
  });

  describe('createMessage', () => {
    it('caso 1: rechaza un mensaje nuevo en un chat de un proyecto CERRADO (API) y nunca llega a persistir ni a retransmitir por socket', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));

      await expect(service.createMessage(10, 5, 1, 'hola')).rejects.toThrow(ForbiddenException);

      // Nunca se crea el mensaje...
      expect(prisma.mensajeChat.create).not.toHaveBeenCalled();
      // ...y como broadcastMessage SOLO se llama después de crear el mensaje
      // (ver chat.service.ts), que nunca se invoque prueba que tampoco sale
      // ningún evento de socket para un mensaje que nunca existió — es la
      // única superficie de "socket" real que tiene el envío de mensajes en
      // este backend (el gateway no tiene un handler propio de envío).
      expect(gateway.broadcastMessage).not.toHaveBeenCalled();
    });

    it('caso 2: un proyecto activo (no CERRADO) sí permite enviar mensajes normalmente', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
      const mensaje = { idMensaje: 99, idConversacion: 5, contenido: 'hola', enviadoEn: new Date(), remitente: USUARIO };
      prisma.mensajeChat.create.mockResolvedValue(mensaje);
      prisma.conversacionParticipante.update.mockResolvedValue({});

      const resultado = await service.createMessage(10, 5, 1, 'hola');

      expect(resultado).toEqual(mensaje);
      expect(prisma.mensajeChat.create).toHaveBeenCalled();
      expect(gateway.broadcastMessage).toHaveBeenCalledWith(5, [2], mensaje);
    });
  });

  describe('createConversation', () => {
    it('caso 1 (cierra el hueco): rechaza crear una conversación nueva en un proyecto CERRADO', async () => {
      prisma.proyecto.findFirst.mockResolvedValue(proyectoRow('CERRADO'));

      await expect(
        service.createConversation(10, 1, { tipo: 'INDIVIDUAL', idsParticipantes: [2] }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.conversacion.create).not.toHaveBeenCalled();
    });
  });

  describe('listConversations', () => {
    it('marca archivada: true en cada conversación cuando el proyecto está CERRADO', async () => {
      prisma.proyecto.findFirst.mockResolvedValue(proyectoRow('CERRADO'));
      prisma.conversacion.findMany.mockResolvedValue([
        {
          idConversacion: 5,
          tipo: 'INDIVIDUAL',
          nombre: null,
          participantes: [{ idUsuario: 1, ultimaLecturaEn: null, usuario: USUARIO }],
          mensajes: [],
        },
      ]);
      prisma.mensajeChat.count.mockResolvedValue(0);

      const resultado = await service.listConversations(10, 1);

      expect(resultado).toHaveLength(1);
      expect(resultado[0].archivada).toBe(true);
    });

    it('marca archivada: false cuando el proyecto sigue activo', async () => {
      prisma.proyecto.findFirst.mockResolvedValue(proyectoRow('PUBLICADO'));
      prisma.conversacion.findMany.mockResolvedValue([
        {
          idConversacion: 5,
          tipo: 'INDIVIDUAL',
          nombre: null,
          participantes: [{ idUsuario: 1, ultimaLecturaEn: null, usuario: USUARIO }],
          mensajes: [],
        },
      ]);
      prisma.mensajeChat.count.mockResolvedValue(0);

      const resultado = await service.listConversations(10, 1);

      expect(resultado[0].archivada).toBe(false);
    });
  });

  describe('getMessages — el historial sigue completo y legible tras archivar', () => {
    it('devuelve el historial normalmente aunque el proyecto esté CERRADO (solo lectura, no oculta nada)', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));
      const historial = [
        { idMensaje: 1, idConversacion: 5, contenido: 'primer mensaje', enviadoEn: new Date(), remitente: USUARIO },
        { idMensaje: 2, idConversacion: 5, contenido: 'segundo mensaje', enviadoEn: new Date(), remitente: USUARIO },
      ];
      // El service pide orderBy idMensaje desc y hace .reverse(); se devuelve
      // ya en orden desc desde el mock para que el resultado final quede asc.
      prisma.mensajeChat.findMany.mockResolvedValue([...historial].reverse());

      const resultado = await service.getMessages(10, 5, 1);

      expect(resultado).toEqual(historial);
    });
  });

  describe('listArchivedConversations — T-236', () => {
    function conversacionArchivadaRow(overrides: Partial<{ idConversacion: number; nombre: string | null }> = {}) {
      return {
        idConversacion: overrides.idConversacion ?? 1,
        tipo: 'INDIVIDUAL' as const,
        nombre: overrides.nombre ?? null,
        proyecto: { idProyecto: 17, tituloProyecto: 'Feria de Ciencias UVG 2026' },
        participantes: [
          { idUsuario: 1, usuario: USUARIO },
          { idUsuario: 2, usuario: { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null } },
        ],
        mensajes: [],
      };
    }

    it('solo trae conversaciones de proyectos CERRADO, nunca de proyectos activos', async () => {
      prisma.conversacion.findMany.mockResolvedValue([conversacionArchivadaRow()]);

      await service.listArchivedConversations(1, {});

      expect(prisma.conversacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            proyecto: { estadoProyecto: 'CERRADO' },
          }),
        }),
      );
    });

    it('cada item viene marcado archivada: true', async () => {
      prisma.conversacion.findMany.mockResolvedValue([conversacionArchivadaRow()]);

      const resultado = await service.listArchivedConversations(1, {});

      expect(resultado.items).toHaveLength(1);
      expect(resultado.items[0].archivada).toBe(true);
      expect(resultado.items[0].proyecto).toEqual({ idProyecto: 17, tituloProyecto: 'Feria de Ciencias UVG 2026' });
    });

    it('con q, busca por nombre de chat O por participante (excluyendo al propio usuario)', async () => {
      prisma.conversacion.findMany.mockResolvedValue([]);

      await service.listArchivedConversations(1, { q: 'rosa' });

      const llamada = prisma.conversacion.findMany.mock.calls[0][0];
      expect(llamada.where.OR).toEqual([
        { nombre: { contains: 'rosa', mode: 'insensitive' } },
        {
          participantes: {
            some: {
              idUsuario: { not: 1 },
              usuario: {
                OR: [
                  { nombre: { contains: 'rosa', mode: 'insensitive' } },
                  { apellido: { contains: 'rosa', mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ]);
    });

    it('sin q, no agrega ninguna condición OR de búsqueda', async () => {
      prisma.conversacion.findMany.mockResolvedValue([]);

      await service.listArchivedConversations(1, {});

      const llamada = prisma.conversacion.findMany.mock.calls[0][0];
      expect(llamada.where.OR).toBeUndefined();
    });
  });
});
