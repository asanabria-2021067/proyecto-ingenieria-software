import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    conversacion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversacionParticipante: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    mensajeChat: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    apodoConversacion: { findMany: vi.fn().mockResolvedValue([]) },
    mensajeGuardado: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  };
}

function makeGateway() {
  return { broadcastMessage: vi.fn(), notifyConversationCreated: vi.fn(), notifyMessagesRead: vi.fn() };
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
    service = new ChatService(prisma as any, gateway as any, {} as any);
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

      expect(resultado).toEqual({ ...mensaje, citado: null });
      expect(prisma.mensajeChat.create).toHaveBeenCalled();
      expect(gateway.broadcastMessage).toHaveBeenCalledWith(5, [2], { ...mensaje, citado: null });
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
          apodos: [],
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
          apodos: [],
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
        { idMensaje: 1, idConversacion: 5, contenido: 'primer mensaje', enviadoEn: new Date(), remitente: USUARIO, guardadoPor: [] },
        { idMensaje: 2, idConversacion: 5, contenido: 'segundo mensaje', enviadoEn: new Date(), remitente: USUARIO, guardadoPor: [{ idUsuario: 1 }] },
      ];
      // El service pide orderBy idMensaje desc y hace .reverse(); se devuelve
      // ya en orden desc desde el mock para que el resultado final quede asc.
      prisma.mensajeChat.findMany.mockResolvedValue(historial.map((m) => ({ ...m, reacciones: [] })).reverse());

      const resultado = await service.getMessages(10, 5, 1);

      expect(resultado.map((m) => [m.idMensaje, m.guardado])).toEqual([[1, false], [2, true]]);
      expect(resultado[0]).not.toHaveProperty('guardadoPor');
      expect(resultado[0]).toMatchObject({ citado: null, reacciones: [], apodoRemitente: null });
    });

    it('solo consulta los guardados del usuario autenticado (privacidad)', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
      prisma.mensajeChat.findMany.mockResolvedValue([]);

      await service.getMessages(10, 5, 1);

      expect(prisma.mensajeChat.findMany.mock.calls[0][0].select.guardadoPor.where).toEqual({ idUsuario: 1 });
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

  describe('deleteConversation — dock global de chat', () => {
    it('marca eliminadaEn y notifica al resto de participantes, no a quien elimina', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(
        conversacionRow('EN_PROGRESO', { participantes: [{ idUsuario: 1 }, { idUsuario: 2 }] }),
      );
      prisma.conversacion.update.mockResolvedValue({});

      await service.deleteConversation(10, 5, 1);

      expect(prisma.conversacion.update).toHaveBeenCalledWith({
        where: { idConversacion: 5 },
        data: { eliminadaEn: expect.any(Date) },
      });
      expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(5, [2]);
    });

    it('rechaza si el usuario no participa en la conversación', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(
        conversacionRow('EN_PROGRESO', { participantes: [{ idUsuario: 2 }, { idUsuario: 3 }] }),
      );

      await expect(service.deleteConversation(10, 5, 1)).rejects.toThrow(ForbiddenException);
      expect(prisma.conversacion.update).not.toHaveBeenCalled();
    });
  });

  describe('updateConversation — silenciar y prioridad', () => {
    it('acepta silenciada y esPrioritaria igual que los campos existentes', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
      prisma.conversacion.update.mockResolvedValue({});

      await service.updateConversation(10, 5, 1, { silenciada: true, esPrioritaria: false });

      expect(prisma.conversacion.update).toHaveBeenCalledWith({
        where: { idConversacion: 5 },
        data: { silenciada: true, esPrioritaria: false },
      });
    });
  });

  describe('listAllConversations — dock global de chat', () => {
    function conversacionGlobalRow(
      overrides: Partial<{ idConversacion: number; esFavorita: boolean }> = {},
    ) {
      return {
        idConversacion: overrides.idConversacion ?? 1,
        idProyecto: 10,
        tipo: 'INDIVIDUAL' as const,
        nombre: null,
        nombrePersonalizado: null,
        proyecto: { idProyecto: 10, tituloProyecto: 'Feria de Ciencias UVG 2026' },
        participantes: [
          { idUsuario: 1, ultimaLecturaEn: null, usuario: USUARIO },
          { idUsuario: 2, ultimaLecturaEn: null, usuario: { idUsuario: 2, nombre: 'Rosa', apellido: 'Fuentes', fotoUrl: null } },
        ],
        apodos: [],
        mensajes: [],
        esFavorita: overrides.esFavorita ?? false,
        archivadaEn: null,
        silenciada: false,
        esPrioritaria: true,
      };
    }

    it('excluye proyectos CERRADO y conversaciones eliminadas del where', async () => {
      prisma.conversacion.findMany.mockResolvedValue([]);

      await service.listAllConversations(1);

      const llamada = prisma.conversacion.findMany.mock.calls[0][0];
      expect(llamada.where.eliminadaEn).toBeNull();
      expect(llamada.where.proyecto).toEqual({ estadoProyecto: { not: 'CERRADO' } });
    });

    it('con q, busca por nombre, participante y contenido de mensajes', async () => {
      prisma.conversacion.findMany.mockResolvedValue([]);

      await service.listAllConversations(1, 'rosa');

      const llamada = prisma.conversacion.findMany.mock.calls[0][0];
      expect(llamada.where.OR).toEqual([
        { nombre: { contains: 'rosa', mode: 'insensitive' } },
        { nombrePersonalizado: { contains: 'rosa', mode: 'insensitive' } },
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
        { mensajes: { some: { eliminadoEn: null, contenido: { contains: 'rosa', mode: 'insensitive' } } } },
      ]);
    });

    it('favoritas primero', async () => {
      prisma.conversacion.findMany.mockResolvedValue([
        conversacionGlobalRow({ idConversacion: 1, esFavorita: false }),
        conversacionGlobalRow({ idConversacion: 2, esFavorita: true }),
      ]);
      prisma.mensajeChat.count.mockResolvedValue(0);

      const resultado = await service.listAllConversations(1);

      expect(resultado.map((c) => c.idConversacion)).toEqual([2, 1]);
    });

    it('incluye el proyecto de cada conversación (necesario para el badge del dock)', async () => {
      prisma.conversacion.findMany.mockResolvedValue([conversacionGlobalRow()]);
      prisma.mensajeChat.count.mockResolvedValue(0);

      const resultado = await service.listAllConversations(1);

      expect(resultado[0].proyecto).toEqual({ idProyecto: 10, tituloProyecto: 'Feria de Ciencias UVG 2026' });
    });
  });

  describe('toggleSavedMessage', () => {
    beforeEach(() => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
      prisma.mensajeChat.findFirst.mockResolvedValue({ idMensaje: 7 });
    });

    it('guarda el mensaje cuando no estaba guardado', async () => {
      prisma.mensajeGuardado.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.toggleSavedMessage(10, 5, 7, 1)).resolves.toEqual({ guardado: true });
      expect(prisma.mensajeGuardado.createMany).toHaveBeenCalledWith({
        data: [{ idUsuario: 1, idMensaje: 7 }],
        skipDuplicates: true,
      });
    });

    it('quita el guardado cuando ya estaba guardado', async () => {
      prisma.mensajeGuardado.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.toggleSavedMessage(10, 5, 7, 1)).resolves.toEqual({ guardado: false });
      expect(prisma.mensajeGuardado.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 1, idMensaje: 7 } });
      expect(prisma.mensajeGuardado.createMany).not.toHaveBeenCalled();
    });

    it('mensaje eliminado: 404 y no toca los guardados', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue(null);

      await expect(service.toggleSavedMessage(10, 5, 7, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.mensajeChat.findFirst.mock.calls[0][0].where).toMatchObject({ eliminadoEn: null });
      expect(prisma.mensajeGuardado.deleteMany).not.toHaveBeenCalled();
      expect(prisma.mensajeGuardado.createMany).not.toHaveBeenCalled();
    });

    it('rechaza a quien no participa en la conversacion', async () => {
      await expect(service.toggleSavedMessage(10, 5, 7, 99)).rejects.toThrow(ForbiddenException);
      expect(prisma.mensajeGuardado.deleteMany).not.toHaveBeenCalled();
      expect(prisma.mensajeGuardado.createMany).not.toHaveBeenCalled();
    });

    it('404 si el mensaje no pertenece a esa conversacion', async () => {
      prisma.mensajeChat.findFirst.mockResolvedValue(null);

      await expect(service.toggleSavedMessage(10, 5, 8, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.mensajeChat.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { idMensaje: 8, idConversacion: 5, eliminadoEn: null } }));
    });
  });

  describe('toggleReaction', () => {
    it('mensaje eliminado: 404 y no crea ni borra reacciones', async () => {
      const reaccion = { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), findMany: vi.fn() };
      (prisma as any).reaccionMensajeChat = reaccion;
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
      prisma.mensajeChat.findFirst.mockResolvedValue(null);

      await expect(service.toggleReaction(10, 5, 7, 1, '👍')).rejects.toThrow(NotFoundException);
      expect(prisma.mensajeChat.findFirst.mock.calls[0][0].where).toEqual({ idMensaje: 7, idConversacion: 5, eliminadoEn: null });
      expect(reaccion.create).not.toHaveBeenCalled();
      expect(reaccion.delete).not.toHaveBeenCalled();
    });
  });

  describe('getConversacionOrThrow - conversacion eliminada', () => {
    it('filtra eliminadaEn:null y responde 404 si la conversacion fue eliminada', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);

      await expect(service.getMessages(10, 5, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.conversacion.findFirst.mock.calls[0][0].where).toEqual({ idConversacion: 5, idProyecto: 10, eliminadaEn: null });
      expect(prisma.mensajeChat.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listSavedMessages', () => {
    const guardadoRow = (idMensaje: number) => ({
      guardadoEn: new Date('2026-10-16T10:00:00Z'),
      mensaje: {
        idMensaje,
        contenido: `msg ${idMensaje}`,
        enviadoEn: new Date('2026-10-16T09:00:00Z'),
        remitente: USUARIO,
        conversacion: {
          idConversacion: 5,
          idProyecto: 10,
          tipo: 'INDIVIDUAL',
          nombre: null,
          nombrePersonalizado: null,
          participantes: [{ usuario: USUARIO }],
        },
      },
    });

    it('solo trae guardados propios de conversaciones donde el usuario participa hoy', async () => {
      prisma.mensajeGuardado.findMany.mockResolvedValue([guardadoRow(1)]);

      const r = await service.listSavedMessages(1);

      const args = prisma.mensajeGuardado.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        idUsuario: 1,
        mensaje: { eliminadoEn: null, conversacion: { eliminadaEn: null, participantes: { some: { idUsuario: 1 } } } },
      });
      expect(r.items[0]).toMatchObject({ idMensaje: 1, contenido: 'msg 1', conversacion: { idConversacion: 5, idProyecto: 10 } });
      expect(r.hasMore).toBe(false);
    });

    it('no devuelve guardados de mensajes eliminados (el where los excluye)', async () => {
      prisma.mensajeGuardado.findMany.mockResolvedValue([]);

      const r = await service.listSavedMessages(1);

      expect(prisma.mensajeGuardado.findMany.mock.calls[0][0].where.mensaje).toMatchObject({ eliminadoEn: null });
      expect(r.items).toEqual([]);
    });

    it('pagina de a 20 y marca hasMore con un elemento extra', async () => {
      prisma.mensajeGuardado.findMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => guardadoRow(i + 1)));

      const r = await service.listSavedMessages(1, { page: 3 });

      const args = prisma.mensajeGuardado.findMany.mock.calls[0][0];
      expect(args).toMatchObject({ skip: 40, take: 21 });
      expect(r.items).toHaveLength(20);
      expect(r.hasMore).toBe(true);
    });
  });
});

describe('ChatService - visto por', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: ReturnType<typeof makeGateway>;
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = makeGateway();
    service = new ChatService(prisma as any, gateway as any);
  });

  it('markRead: guarda ultimaLecturaEn y avisa por socket con la misma fecha', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
    prisma.conversacionParticipante.update.mockResolvedValue({});

    await service.markRead(10, 5, 2);

    const { data } = prisma.conversacionParticipante.update.mock.calls[0][0];
    expect(data.ultimaLecturaEn).toBeInstanceOf(Date);
    expect(gateway.notifyMessagesRead).toHaveBeenCalledWith(5, 2, data.ultimaLecturaEn);
  });

  it('markRead: un no participante recibe 403 y no se avisa a nadie', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));

    await expect(service.markRead(10, 5, 99)).rejects.toThrow(ForbiddenException);
    expect(prisma.conversacionParticipante.update).not.toHaveBeenCalled();
    expect(gateway.notifyMessagesRead).not.toHaveBeenCalled();
  });

  it('getReadReceipts: devuelve la lectura de los demas participantes, sin la propia', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));
    const lecturas = [{ idUsuario: 2, ultimaLecturaEn: new Date() }];
    prisma.conversacionParticipante.findMany.mockResolvedValue(lecturas);

    await expect(service.getReadReceipts(10, 5, 1)).resolves.toBe(lecturas);
    expect(prisma.conversacionParticipante.findMany).toHaveBeenCalledWith({
      where: { idConversacion: 5, idUsuario: { not: 1 } },
      select: { idUsuario: true, ultimaLecturaEn: true },
    });
  });

  it('getReadReceipts: un no participante recibe 403', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('EN_PROGRESO'));

    await expect(service.getReadReceipts(10, 5, 99)).rejects.toThrow(ForbiddenException);
    expect(prisma.conversacionParticipante.findMany).not.toHaveBeenCalled();
  });
});