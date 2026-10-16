import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatCanalesService } from '../src/chat/chat-canales.service';
import { ChatService } from '../src/chat/chat.service';

const LIDER = 1;
const MIEMBRO = 2;
const AJENO = 99;

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn(), findMany: vi.fn() },
    participacionProyecto: { findMany: vi.fn(), findFirst: vi.fn() },
    conversacion: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversacionParticipante: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeGateway() {
  return {
    broadcastMessage: vi.fn(),
    notifyConversationCreated: vi.fn(),
    removeFromConversation: vi.fn(),
  };
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });

describe('ChatCanalesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: ReturnType<typeof makeGateway>;
  let service: ChatCanalesService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = makeGateway();
    service = new ChatCanalesService(prisma as any, gateway as any);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 10, creadoPor: LIDER, estadoProyecto: 'EN_PROGRESO' });
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: MIEMBRO }]);
  });

  describe('crearCanal', () => {
    it('solo el líder puede crear canales', async () => {
      await expect(service.crearCanal(10, MIEMBRO, { nombre: 'dev' })).rejects.toThrow(ForbiddenException);
      expect(prisma.conversacion.create).not.toHaveBeenCalled();
    });

    it('rechaza crear en un proyecto cerrado', async () => {
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 10, creadoPor: LIDER, estadoProyecto: 'CERRADO' });
      await expect(service.crearCanal(10, LIDER, { nombre: 'dev' })).rejects.toThrow(ForbiddenException);
    });

    it('rechaza miembros iniciales fuera de la membresía del proyecto', async () => {
      await expect(service.crearCanal(10, LIDER, { nombre: 'dev', idsMiembros: [MIEMBRO, AJENO] })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.conversacion.create).not.toHaveBeenCalled();
    });

    it('crea el canal con el líder y los miembros iniciales y avisa a los demás', async () => {
      prisma.conversacion.create.mockResolvedValue({ idConversacion: 7, nombreCanal: 'dev' });

      const res = await service.crearCanal(10, LIDER, { nombre: 'dev', idsMiembros: [MIEMBRO] });

      expect(res).toEqual({ idConversacion: 7, idProyecto: 10, nombre: 'dev', esGeneral: false });
      const data = prisma.conversacion.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ esCanal: true, nombreCanal: 'dev', tipo: 'GRUPAL', creadaPor: LIDER });
      expect(data.participantes.create).toEqual([{ idUsuario: MIEMBRO }, { idUsuario: LIDER }]);
      expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(7, [MIEMBRO]);
    });

    it('sin miembros iniciales crea el canal solo con el líder', async () => {
      prisma.conversacion.create.mockResolvedValue({ idConversacion: 7, nombreCanal: 'dev' });
      await service.crearCanal(10, LIDER, { nombre: 'dev' });
      expect(prisma.conversacion.create.mock.calls[0][0].data.participantes.create).toEqual([{ idUsuario: LIDER }]);
    });

    it('nombre duplicado en el proyecto devuelve 409', async () => {
      prisma.conversacion.create.mockRejectedValue(p2002());
      await expect(service.crearCanal(10, LIDER, { nombre: 'dev' })).rejects.toThrow(ConflictException);
    });

    it('propaga errores que no son de duplicado', async () => {
      prisma.conversacion.create.mockRejectedValue(new Error('boom'));
      await expect(service.crearCanal(10, LIDER, { nombre: 'dev' })).rejects.toThrow('boom');
    });

    it('proyecto inexistente devuelve 404', async () => {
      prisma.proyecto.findFirst.mockResolvedValue(null);
      await expect(service.crearCanal(10, LIDER, { nombre: 'dev' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('agregarMiembros', () => {
    beforeEach(() => {
      prisma.conversacion.findFirst.mockResolvedValue({
        idConversacion: 7,
        nombreCanal: 'dev',
        participantes: [{ idUsuario: LIDER }],
      });
    });

    it('solo el líder agrega miembros', async () => {
      await expect(service.agregarMiembros(10, 7, MIEMBRO, [MIEMBRO])).rejects.toThrow(ForbiddenException);
    });

    it('rechaza usuarios fuera de la membresía', async () => {
      await expect(service.agregarMiembros(10, 7, LIDER, [AJENO])).rejects.toThrow(BadRequestException);
      expect(prisma.conversacionParticipante.createMany).not.toHaveBeenCalled();
    });

    it('agrega solo a quienes aún no están y los notifica', async () => {
      await service.agregarMiembros(10, 7, LIDER, [LIDER, MIEMBRO]);
      expect(prisma.conversacionParticipante.createMany).toHaveBeenCalledWith({
        data: [{ idConversacion: 7, idUsuario: MIEMBRO }],
        skipDuplicates: true,
      });
      expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(7, [MIEMBRO]);
    });

    it('no hace nada si todos ya son miembros', async () => {
      await service.agregarMiembros(10, 7, LIDER, [LIDER]);
      expect(prisma.conversacionParticipante.createMany).not.toHaveBeenCalled();
    });

    it('canal inexistente o de otro proyecto devuelve 404', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      await expect(service.agregarMiembros(10, 7, LIDER, [MIEMBRO])).rejects.toThrow(NotFoundException);
    });
  });

  describe('quitarMiembro', () => {
    const canal = (nombreCanal: string, ids: number[]) => ({
      idConversacion: 7,
      nombreCanal,
      participantes: ids.map((idUsuario) => ({ idUsuario })),
    });

    it('#general es inmutable: no se le quita a nadie', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(canal('general', [LIDER, MIEMBRO]));
      await expect(service.quitarMiembro(10, 7, LIDER, MIEMBRO)).rejects.toThrow(ForbiddenException);
      expect(prisma.conversacionParticipante.delete).not.toHaveBeenCalled();
    });

    it('no se puede quitar al líder (el canal nunca queda vacío)', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(canal('dev', [LIDER, MIEMBRO]));
      await expect(service.quitarMiembro(10, 7, LIDER, LIDER)).rejects.toThrow(BadRequestException);
    });

    it('solo el líder quita miembros', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(canal('dev', [LIDER, MIEMBRO]));
      await expect(service.quitarMiembro(10, 7, MIEMBRO, MIEMBRO)).rejects.toThrow(ForbiddenException);
    });

    it('quitar a alguien que no es miembro devuelve 404', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(canal('dev', [LIDER]));
      await expect(service.quitarMiembro(10, 7, LIDER, MIEMBRO)).rejects.toThrow(NotFoundException);
    });

    it('quita al miembro y lo saca de la room en vivo', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(canal('dev', [LIDER, MIEMBRO]));
      await service.quitarMiembro(10, 7, LIDER, MIEMBRO);
      expect(prisma.conversacionParticipante.delete).toHaveBeenCalledWith({
        where: { idConversacion_idUsuario: { idConversacion: 7, idUsuario: MIEMBRO } },
      });
      expect(gateway.removeFromConversation).toHaveBeenCalledWith(7, [MIEMBRO]);
    });
  });

  describe('sincronizar', () => {
    beforeEach(() => {
      prisma.conversacionParticipante.findMany.mockResolvedValue([]);
    });

    it('proyecto cerrado: no toca nada', async () => {
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 10, creadoPor: LIDER, estadoProyecto: 'CERRADO' });
      await service.sincronizar(10);
      expect(prisma.conversacion.create).not.toHaveBeenCalled();
      expect(prisma.conversacionParticipante.createMany).not.toHaveBeenCalled();
    });

    it('crea #general si falta y mete al líder y a los activos', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      prisma.conversacion.create.mockResolvedValue({ idConversacion: 3 });

      await service.sincronizar(10);

      expect(prisma.conversacion.create.mock.calls[0][0].data).toMatchObject({
        esCanal: true,
        nombreCanal: 'general',
        creadaPor: LIDER,
      });
      expect(prisma.conversacionParticipante.createMany).toHaveBeenCalledWith({
        data: [
          { idConversacion: 3, idUsuario: LIDER },
          { idConversacion: 3, idUsuario: MIEMBRO },
        ],
        skipDuplicates: true,
      });
    });

    it('si dos accesos crean #general a la vez, reutiliza el que ganó', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      prisma.conversacion.create.mockRejectedValue(p2002());
      prisma.conversacion.findFirstOrThrow.mockResolvedValue({ idConversacion: 3 });

      await service.sincronizar(10);

      expect(prisma.conversacionParticipante.createMany).toHaveBeenCalled();
    });

    it('propaga errores de creación que no son de duplicado', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(null);
      prisma.conversacion.create.mockRejectedValue(new Error('boom'));
      await expect(service.sincronizar(10)).rejects.toThrow('boom');
    });

    it('quien salió del proyecto sale de todos sus canales', async () => {
      prisma.conversacion.findFirst.mockResolvedValue({ idConversacion: 3 });
      prisma.conversacionParticipante.findMany.mockResolvedValue([
        { idConversacion: 3, idUsuario: AJENO },
        { idConversacion: 7, idUsuario: AJENO },
      ]);

      await service.sincronizar(10);

      expect(prisma.conversacionParticipante.findMany.mock.calls[0][0].where.idUsuario).toEqual({
        notIn: [LIDER, MIEMBRO],
      });
      expect(prisma.conversacionParticipante.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { idConversacion: 3, idUsuario: AJENO },
            { idConversacion: 7, idUsuario: AJENO },
          ],
        },
      });
      expect(gateway.removeFromConversation).toHaveBeenCalledWith(3, [AJENO]);
      expect(gateway.removeFromConversation).toHaveBeenCalledWith(7, [AJENO]);
    });

    it('sin obsoletos no borra nada', async () => {
      prisma.conversacion.findFirst.mockResolvedValue({ idConversacion: 3 });
      await service.sincronizar(10);
      expect(prisma.conversacionParticipante.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('sincronizarSinFallar', () => {
    it('traga el error para no romper el flujo que lo invoca', async () => {
      prisma.proyecto.findFirst.mockResolvedValue(null);
      await expect(service.sincronizarSinFallar(10)).resolves.toBeUndefined();
    });
  });

  describe('asegurarGeneral', () => {
    it('sincroniza solo los proyectos del usuario que no tienen #general', async () => {
      prisma.proyecto.findMany.mockResolvedValue([{ idProyecto: 10 }, { idProyecto: 11 }]);
      const sync = vi.spyOn(service, 'sincronizarSinFallar').mockResolvedValue(undefined);

      await service.asegurarGeneral(LIDER);

      expect(prisma.proyecto.findMany.mock.calls[0][0].where.conversaciones).toEqual({
        none: { esCanal: true, nombreCanal: 'general' },
      });
      expect(sync).toHaveBeenCalledTimes(2);
    });
  });

  describe('listarCanales', () => {
    it('quien no es miembro del proyecto no puede listar', async () => {
      await expect(service.listarCanales(10, AJENO)).rejects.toThrow(ForbiddenException);
    });

    it('devuelve solo los canales que integra, marcando #general', async () => {
      prisma.conversacion.findFirst.mockResolvedValue({ idConversacion: 3 });
      prisma.conversacionParticipante.findMany.mockResolvedValue([]);
      const usuario = { idUsuario: MIEMBRO, nombre: 'Ana', apellido: 'Paz', fotoUrl: null };
      prisma.conversacion.findMany.mockResolvedValue([
        { idConversacion: 3, idProyecto: 10, nombreCanal: 'general', participantes: [{ idUsuario: MIEMBRO, usuario }] },
        { idConversacion: 7, idProyecto: 10, nombreCanal: 'dev', participantes: [{ idUsuario: MIEMBRO, usuario }] },
      ]);

      const res = await service.listarCanales(10, MIEMBRO);

      expect(prisma.conversacion.findMany.mock.calls[0][0].where).toMatchObject({
        esCanal: true,
        participantes: { some: { idUsuario: MIEMBRO } },
      });
      expect(res.map((c) => [c.nombre, c.esGeneral])).toEqual([
        ['general', true],
        ['dev', false],
      ]);
      expect(res[0].miembros).toEqual([usuario]);
    });
  });
});

describe('ChatService - acceso a canales', () => {
  let prisma: ReturnType<typeof makePrisma> & { mensajeChat: Record<string, ReturnType<typeof vi.fn>> };
  let service: ChatService;

  const canalRow = (participantes: number[]) => ({
    idConversacion: 7,
    idProyecto: 10,
    esCanal: true,
    participantes: participantes.map((idUsuario) => ({ idUsuario })),
    proyecto: { estadoProyecto: 'EN_PROGRESO' },
  });

  beforeEach(() => {
    prisma = {
      ...makePrisma(),
      mensajeChat: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    };
    service = new ChatService(prisma as any, makeGateway() as any);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 10, creadoPor: LIDER, estadoProyecto: 'EN_PROGRESO' });
  });

  it('un no integrante del canal no puede leer ni escribir', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(canalRow([LIDER]));

    await expect(service.getMessages(10, 7, MIEMBRO)).rejects.toThrow(ForbiddenException);
    await expect(service.createMessage(10, 7, MIEMBRO, 'hola')).rejects.toThrow(ForbiddenException);
    expect(prisma.mensajeChat.create).not.toHaveBeenCalled();
  });

  it('quien salió del proyecto pierde acceso aunque su fila de participante siga', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(canalRow([LIDER, AJENO]));
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);

    await expect(service.getMessages(10, 7, AJENO)).rejects.toThrow(ForbiddenException);
    await expect(service.createMessage(10, 7, AJENO, 'hola')).rejects.toThrow(ForbiddenException);
  });

  it('un integrante con participación activa sí lee', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(canalRow([LIDER, MIEMBRO]));
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.mensajeChat.findMany.mockResolvedValue([]);

    await expect(service.getMessages(10, 7, MIEMBRO)).resolves.toEqual([]);
  });

  it('los canales no se renombran ni se eliminan por el chat genérico', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(canalRow([LIDER]));

    await expect(service.updateConversation(10, 7, LIDER, { nombrePersonalizado: 'otro' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.deleteConversation(10, 7, LIDER)).rejects.toThrow(ForbiddenException);
    expect(prisma.conversacion.update).not.toHaveBeenCalled();
  });

  it('sí permite favorito/silenciar en un canal', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(canalRow([LIDER]));
    await service.updateConversation(10, 7, LIDER, { silenciada: true });
    expect(prisma.conversacion.update).toHaveBeenCalled();
  });
});
