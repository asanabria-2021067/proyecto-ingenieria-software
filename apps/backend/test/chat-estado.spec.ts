import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetEstadoChatDto } from '../src/chat/dto/set-estado-chat.dto';
import { ChatEstadoService, estadoVigente } from '../src/chat/chat-estado.service';
import { ChatService } from '../src/chat/chat.service';

const errores = async (plano: Record<string, unknown>) =>
  (await validate(plainToInstance(SetEstadoChatDto, plano))).map((e) => e.property);

describe('SetEstadoChatDto', () => {
  it('acepta los tipos fijos sin texto', async () => {
    for (const tipo of ['EN_CLASE', 'OCUPADO', 'DISPONIBLE']) {
      expect(await errores({ tipo })).toEqual([]);
    }
  });

  it('rechaza un tipo desconocido', async () => {
    expect(await errores({ tipo: 'AUSENTE' })).toContain('tipo');
  });

  it('exige texto solo con PERSONALIZADO', async () => {
    expect(await errores({ tipo: 'PERSONALIZADO' })).toContain('texto');
    expect(await errores({ tipo: 'PERSONALIZADO', texto: '   ' })).toContain('texto');
    expect(await errores({ tipo: 'OCUPADO', texto: '' })).toEqual([]);
  });

  it('limita el texto a 60 caracteres, contando despues del trim', async () => {
    expect(await errores({ tipo: 'PERSONALIZADO', texto: `  ${'a'.repeat(60)}  ` })).toEqual([]);
    expect(await errores({ tipo: 'PERSONALIZADO', texto: 'a'.repeat(61) })).toContain('texto');
  });

  it('rechaza caracteres de control y hace trim del texto', async () => {
    expect(await errores({ tipo: 'PERSONALIZADO', texto: 'hola\u0007' })).toContain('texto');
    expect(await errores({ tipo: 'PERSONALIZADO', texto: 'a\nb' })).toContain('texto');
    const dto = plainToInstance(SetEstadoChatDto, { tipo: 'PERSONALIZADO', texto: '  Estudiando  ' });
    expect(dto.texto).toBe('Estudiando');
  });

  it('valida venceEn como fecha ISO y permite omitirlo o null', async () => {
    expect(await errores({ tipo: 'OCUPADO' })).toEqual([]);
    expect(await errores({ tipo: 'OCUPADO', venceEn: null })).toEqual([]);
    expect(await errores({ tipo: 'OCUPADO', venceEn: '2026-10-16T12:00:00.000Z' })).toEqual([]);
    expect(await errores({ tipo: 'OCUPADO', venceEn: 'manana' })).toContain('venceEn');
  });
});

describe('estadoVigente', () => {
  const ahora = new Date('2026-10-16T12:00:00.000Z');
  const base = { tipo: 'OCUPADO' as const, texto: null };

  it('sin estado devuelve null', () => {
    expect(estadoVigente(null, ahora)).toBeNull();
    expect(estadoVigente(undefined, ahora)).toBeNull();
  });

  it('sin caducidad siempre es vigente', () => {
    expect(estadoVigente({ ...base, venceEn: null }, ahora)).toEqual({ ...base, venceEn: null });
  });

  it('un milisegundo antes del limite sigue vigente', () => {
    const venceEn = new Date(ahora.getTime() + 1);
    expect(estadoVigente({ ...base, venceEn }, ahora)).not.toBeNull();
  });

  it('justo en el limite ya se trata como inexistente', () => {
    expect(estadoVigente({ ...base, venceEn: new Date(ahora) }, ahora)).toBeNull();
  });

  it('despues del limite es inexistente', () => {
    expect(estadoVigente({ ...base, venceEn: new Date(ahora.getTime() - 1) }, ahora)).toBeNull();
  });
});

describe('ChatEstadoService', () => {
  let prisma: any;
  let gateway: any;
  let service: ChatEstadoService;

  beforeEach(() => {
    prisma = {
      estadoChatUsuario: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
      conversacionParticipante: { findMany: vi.fn().mockResolvedValue([]) },
    };
    gateway = { notifyConversationCreated: vi.fn() };
    service = new ChatEstadoService(prisma, gateway);
    prisma.estadoChatUsuario.upsert.mockImplementation(async ({ create }: any) => create);
  });

  it('obtener devuelve null si el estado esta vencido', async () => {
    prisma.estadoChatUsuario.findUnique.mockResolvedValue({
      tipo: 'EN_CLASE',
      texto: null,
      venceEn: new Date(Date.now() - 1000),
    });
    expect(await service.obtener(1)).toBeNull();
  });

  it('definir con tipo fijo ignora el texto y guarda sin caducidad', async () => {
    const dto = Object.assign(new SetEstadoChatDto(), { tipo: 'OCUPADO', texto: 'x' });
    const r = await service.definir(1, dto);
    expect(prisma.estadoChatUsuario.upsert.mock.calls[0][0].update).toEqual({ tipo: 'OCUPADO', texto: null, venceEn: null });
    expect(r).toMatchObject({ tipo: 'OCUPADO', texto: null, venceEn: null });
  });

  it('definir PERSONALIZADO guarda el texto y la caducidad', async () => {
    const venceEn = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const dto = Object.assign(new SetEstadoChatDto(), { tipo: 'PERSONALIZADO', texto: 'Estudiando', venceEn });
    const r = await service.definir(1, dto);
    expect(r).toMatchObject({ tipo: 'PERSONALIZADO', texto: 'Estudiando', venceEn: new Date(venceEn) });
  });

  it('rechaza caducidad pasada o de mas de 24 h', async () => {
    const pasada = Object.assign(new SetEstadoChatDto(), { tipo: 'OCUPADO', venceEn: new Date(Date.now() - 1000).toISOString() });
    const lejana = Object.assign(new SetEstadoChatDto(), { tipo: 'OCUPADO', venceEn: new Date(Date.now() + 2 * 86400000).toISOString() });
    await expect(service.definir(1, pasada)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.definir(1, lejana)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.estadoChatUsuario.upsert).not.toHaveBeenCalled();
  });

  it('avisa solo a quienes comparten conversacion con el usuario', async () => {
    prisma.conversacionParticipante.findMany.mockResolvedValue([{ idConversacion: 5, idUsuario: 2 }]);
    await service.definir(1, Object.assign(new SetEstadoChatDto(), { tipo: 'DISPONIBLE' }));
    expect(prisma.conversacionParticipante.findMany.mock.calls[0][0].where).toMatchObject({
      idUsuario: { not: 1 },
      conversacion: { participantes: { some: { idUsuario: 1 } } },
    });
    expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(5, [2]);
  });

  it('limpiar borra solo el estado propio y avisa', async () => {
    prisma.conversacionParticipante.findMany.mockResolvedValue([{ idConversacion: 5, idUsuario: 2 }]);
    await service.limpiar(1);
    expect(prisma.estadoChatUsuario.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 1 } });
    expect(gateway.notifyConversationCreated).toHaveBeenCalledWith(5, [2]);
  });
});

describe('ChatService - estado de participantes', () => {
  const usuario = { idUsuario: 2, nombre: 'Bea', apellido: 'Lopez', fotoUrl: null };
  const conversacion = (estadoChat: unknown) => ({
    idConversacion: 5,
    idProyecto: 10,
    proyecto: { idProyecto: 10, tituloProyecto: 'P' },
    tipo: 'INDIVIDUAL',
    nombre: null,
    nombrePersonalizado: null,
    esFavorita: false,
    archivadaEn: null,
    silenciada: false,
    esPrioritaria: true,
    mensajes: [],
    apodos: [],
    participantes: [
      { idUsuario: 1, ultimaLecturaEn: null, usuario: { ...usuario, idUsuario: 1, estadoChat: null } },
      { idUsuario: 2, ultimaLecturaEn: null, usuario: { ...usuario, estadoChat } },
    ],
  });

  const make = (row: unknown) => {
    const prisma: any = {
      conversacion: { findMany: vi.fn().mockResolvedValue([row]) },
      mensajeChat: { count: vi.fn().mockResolvedValue(0) },
    };
    return { prisma, service: new ChatService(prisma, {} as any) };
  };

  it('incluye el estado vigente del participante y oculta el vencido', async () => {
    const vigente = { tipo: 'EN_CLASE', texto: null, venceEn: new Date(Date.now() + 60000) };
    const a = make(conversacion(vigente));
    const [c1] = await a.service.listAllConversations(1);
    expect(c1.participantes[1].estado).toMatchObject({ tipo: 'EN_CLASE' });
    expect(c1.participantes[0].estado).toBeNull();
    expect('estadoChat' in c1.participantes[1]).toBe(false);

    const b = make(conversacion({ ...vigente, venceEn: new Date(Date.now() - 1) }));
    const [c2] = await b.service.listAllConversations(1);
    expect(c2.participantes[1].estado).toBeNull();
  });

  it('solo consulta conversaciones donde el usuario participa (privacidad)', async () => {
    const { prisma, service } = make(conversacion(null));
    await service.listAllConversations(1);
    expect(prisma.conversacion.findMany.mock.calls[0][0].where.participantes).toEqual({ some: { idUsuario: 1 } });
  });
});
