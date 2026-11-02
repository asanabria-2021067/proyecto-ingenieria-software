import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService, ocultarEliminado } from '../src/chat/chat.service';
import { NOTA_VOZ_MAX_BYTES, detectarMimeAudio, validarNotaVoz } from '../src/chat/chat-nota-voz';
import { CreatePollDto } from '../src/chat/dto/create-poll.dto';
import { SendVoiceNoteDto } from '../src/chat/dto/send-voice-note.dto';
import { OrganizationChatService } from '../src/organizations/organization-chat.service';

const webm = (total = 64) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(total - 4)]);
const ogg = () => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(32)]);
const m4a = () => Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(32)]);
const mp3 = () => Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32)]);
const wav = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(16)]);

describe('notas de voz: validacion de tipo en servidor (MEJ-41)', () => {
  it.each([
    ['audio/webm', webm()],
    ['audio/ogg', ogg()],
    ['audio/mp4', m4a()],
    ['audio/mpeg', mp3()],
    ['audio/wav', wav()],
  ])('reconoce %s por firma', (mime, buf) => {
    expect(detectarMimeAudio(buf)).toBe(mime);
  });

  it.each([
    ['ejecutable', Buffer.from('MZ\x90\x00 programa')],
    ['html', Buffer.from('<html><script>alert(1)</script>')],
    ['pdf', Buffer.from('%PDF-1.7\n')],
    ['webp (RIFF no WAVE)', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])],
    ['vacio', Buffer.alloc(0)],
  ])('rechaza %s', (_n, buf) => {
    expect(detectarMimeAudio(buf)).toBeNull();
  });

  it('acepta el MIME declarado con parametros de codec y fija el nombre en el servidor', () => {
    const r = validarNotaVoz({ buffer: webm(), mimetype: 'audio/webm;codecs=opus', originalname: '../../evil.exe' });
    expect(r).toEqual({ mime: 'audio/webm', nombre: 'nota-de-voz.webm' });
  });

  it('rechaza un archivo que declara audio pero tiene otro contenido', () => {
    expect(() => validarNotaVoz({ buffer: Buffer.from('MZ\x90\x00'), mimetype: 'audio/webm', originalname: 'a.webm' })).toThrow(
      'Tipo de audio no permitido',
    );
  });

  it('rechaza un MIME declarado distinto al contenido', () => {
    expect(() => validarNotaVoz({ buffer: webm(), mimetype: 'audio/mpeg', originalname: 'a.mp3' })).toThrow(
      'El tipo declarado no coincide',
    );
  });

  it('rechaza vacio y mas de 5 MB', () => {
    expect(() => validarNotaVoz({ buffer: Buffer.alloc(0), mimetype: 'audio/webm', originalname: 'a.webm' })).toThrow(BadRequestException);
    expect(() => validarNotaVoz({ buffer: webm(NOTA_VOZ_MAX_BYTES + 1), mimetype: 'audio/webm', originalname: 'a.webm' })).toThrow(
      'supera el máximo de 5 MB',
    );
    expect(() => validarNotaVoz({ buffer: webm(NOTA_VOZ_MAX_BYTES), mimetype: 'audio/webm', originalname: 'a.webm' })).not.toThrow();
  });

  it.each([
    [{ duracionSegundos: '1' }, 0],
    [{ duracionSegundos: '120' }, 0],
    [{ duracionSegundos: '121' }, 1],
    [{ duracionSegundos: '0' }, 1],
    [{ duracionSegundos: 'abc' }, 1],
    [{}, 1],
  ])('DTO de duracion %j', async (body, errores) => {
    const dto = plainToInstance(SendVoiceNoteDto, body);
    expect((await validate(dto)).length).toBe(errores);
  });
});

describe('encuestas: DTO (MEJ-42)', () => {
  const ok = { pregunta: ' ¿Cuándo? ', opciones: [' Lunes ', 'Martes'] };

  it('acepta 2 a 6 opciones y recorta los textos', async () => {
    const dto = plainToInstance(CreatePollDto, ok);
    expect(await validate(dto)).toEqual([]);
    expect(dto.pregunta).toBe('¿Cuándo?');
    expect(dto.opciones).toEqual(['Lunes', 'Martes']);
    expect(await validate(plainToInstance(CreatePollDto, { ...ok, opciones: ['a', 'b', 'c', 'd', 'e', 'f'] }))).toEqual([]);
  });

  it.each([
    ['1 opcion', { ...ok, opciones: ['a'] }],
    ['7 opciones', { ...ok, opciones: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    ['opcion vacia', { ...ok, opciones: ['a', '   '] }],
    ['pregunta vacia', { ...ok, pregunta: '  ' }],
    ['cierre invalido', { ...ok, cierraEn: 'manana' }],
  ])('rechaza %s', async (_n, body) => {
    expect((await validate(plainToInstance(CreatePollDto, body))).length).toBeGreaterThan(0);
  });
});

function makePrisma() {
  const prisma: Record<string, any> = {
    conversacion: { findFirst: vi.fn() },
    mensajeChat: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    encuestaChat: { update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ cerradaEn: null, cierraEn: null }) },
    votoEncuestaChat: { deleteMany: vi.fn().mockReturnValue('del'), createMany: vi.fn().mockReturnValue('crear') },
    conversacionParticipante: { update: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  prisma.$transaction = vi.fn(async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[])));
  return prisma;
}

const LIDER = 1;
const AUTOR = 2;
const OTRO = 3;

function conversacionRow(estadoProyecto = 'EN_PROGRESO') {
  return {
    idConversacion: 5,
    idProyecto: 10,
    esCanal: false,
    participantes: [{ idUsuario: LIDER }, { idUsuario: AUTOR }, { idUsuario: OTRO }],
    proyecto: { estadoProyecto, creadoPor: LIDER },
  };
}

const encuesta = (extra: Record<string, unknown> = {}) => ({
  idEncuesta: 9,
  pregunta: '¿Cuándo?',
  multiple: false,
  cierraEn: null,
  cerradaEn: null,
  opciones: [
    { idOpcion: 21, texto: 'Lunes', votos: [] },
    { idOpcion: 22, texto: 'Martes', votos: [] },
    { idOpcion: 23, texto: 'Jueves', votos: [] },
  ],
  ...extra,
});

describe('ChatService - encuestas (MEJ-42)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: { broadcastPollUpdated: ReturnType<typeof vi.fn>; broadcastMessageChange: ReturnType<typeof vi.fn>; broadcastMessage: ReturnType<typeof vi.fn> };
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = { broadcastPollUpdated: vi.fn(), broadcastMessageChange: vi.fn(), broadcastMessage: vi.fn() };
    service = new ChatService(prisma as any, gateway as any, {} as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, encuesta: encuesta() });
  });

  it('voto unico: reemplaza el voto previo y emite los resultados por socket', async () => {
    const r = await service.votarEncuesta(10, 5, 7, OTRO, [22]);
    expect(prisma.votoEncuestaChat.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: OTRO, opcion: { idEncuesta: 9 } } });
    expect(prisma.votoEncuestaChat.createMany).toHaveBeenCalledWith({ data: [{ idOpcion: 22, idUsuario: OTRO }] });
    expect(gateway.broadcastPollUpdated).toHaveBeenCalledWith(5, 7, r);
  });

  it('arreglo vacio retira el voto', async () => {
    await service.votarEncuesta(10, 5, 7, OTRO, []);
    expect(prisma.votoEncuestaChat.deleteMany).toHaveBeenCalled();
    expect(prisma.votoEncuestaChat.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('voto unico rechaza dos opciones; multiple las acepta', async () => {
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21, 22])).rejects.toThrow('un solo voto');
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, encuesta: encuesta({ multiple: true }) });
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21, 22])).resolves.toBeDefined();
  });

  it('rechaza opciones que no son de la encuesta', async () => {
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [999])).rejects.toThrow(BadRequestException);
    expect(prisma.votoEncuestaChat.createMany).not.toHaveBeenCalled();
  });

  it('no deja votar si esta cerrada manualmente o por fecha', async () => {
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, encuesta: encuesta({ cerradaEn: new Date() }) });
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21])).rejects.toThrow('cerrada');
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, encuesta: encuesta({ cierraEn: new Date(Date.now() - 1000) }) });
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21])).rejects.toThrow('cerrada');
  });

  it('no deja votar a quien no participa ni en proyecto archivado', async () => {
    prisma.conversacion.findFirst.mockResolvedValue({ ...conversacionRow(), participantes: [{ idUsuario: LIDER }] });
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21])).rejects.toThrow(ForbiddenException);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));
    await expect(service.votarEncuesta(10, 5, 7, OTRO, [21])).rejects.toThrow(ForbiddenException);
  });

  it('solo el autor o el lider cierran la encuesta', async () => {
    await expect(service.cerrarEncuesta(10, 5, 7, OTRO)).rejects.toThrow(ForbiddenException);
    expect(prisma.encuestaChat.update).not.toHaveBeenCalled();
    await service.cerrarEncuesta(10, 5, 7, AUTOR);
    await service.cerrarEncuesta(10, 5, 7, LIDER);
    expect(prisma.encuestaChat.update).toHaveBeenCalledTimes(2);
    expect(gateway.broadcastPollUpdated).toHaveBeenCalledTimes(2);
  });

  it('crear encuesta: contenido es la pregunta, cierre en el pasado y opciones repetidas se rechazan', async () => {
    prisma.mensajeChat.create.mockResolvedValue({ idMensaje: 7, enviadoEn: new Date(), citado: null });
    await service.createMessage(10, 5, AUTOR, '', undefined, undefined, {
      encuesta: { pregunta: '¿Cuándo?', opciones: ['Lunes', 'Martes'], multiple: true },
    });
    const data = prisma.mensajeChat.create.mock.calls[0][0].data;
    expect(data.contenido).toBe('¿Cuándo?');
    expect(data.encuesta.create.multiple).toBe(true);
    expect(data.encuesta.create.opciones.create).toEqual([
      { texto: 'Lunes', orden: 0 },
      { texto: 'Martes', orden: 1 },
    ]);
    await expect(
      service.createMessage(10, 5, AUTOR, '', undefined, undefined, {
        encuesta: { pregunta: 'x', opciones: ['a', 'b'], cierraEn: new Date(Date.now() - 1000).toISOString() },
      }),
    ).rejects.toThrow('fecha futura');
    await expect(
      service.createMessage(10, 5, AUTOR, '', undefined, undefined, { encuesta: { pregunta: 'x', opciones: ['Si', 'si'] } }),
    ).rejects.toThrow('no se pueden repetir');
  });

  it('un mensaje eliminado no expone su encuesta', () => {
    expect(ocultarEliminado({ contenido: 'x', eliminadoEn: new Date(), encuesta: encuesta() }).encuesta).toBeNull();
  });
});

describe('ChatService - notas de voz (MEJ-41)', () => {
  it('guarda el audio con la duracion y sin conservar el nombre del cliente', async () => {
    const prisma = makePrisma();
    const gateway = { broadcastMessage: vi.fn() };
    const storage = { upload: vi.fn(), destroy: vi.fn() };
    const service = new ChatService(prisma as any, gateway as any, storage as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.create.mockResolvedValue({ idMensaje: 7, enviadoEn: new Date(), citado: null });

    await service.createMessage(10, 5, AUTOR, '', { buffer: webm(), mimetype: 'audio/webm', originalname: 'x.exe' }, undefined, {
      duracionSegundos: 42,
    });

    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^chat\/5\/[0-9a-f-]+\.webm$/), expect.any(Buffer));
    const adjunto = prisma.mensajeChat.create.mock.calls[0][0].data.adjunto.create;
    expect(adjunto).toMatchObject({ nombreOriginal: 'nota-de-voz.webm', mime: 'audio/webm', duracionSegundos: 42 });
  });

  describe('getAdjuntoAudio', () => {
    function build(adjunto: unknown) {
      const prisma = makePrisma();
      (prisma as any).adjuntoMensajeChat = { findFirst: vi.fn().mockResolvedValue(adjunto) };
      prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
      const storage = { signedUrl: vi.fn().mockResolvedValue('https://firmada.example/a') };
      return { service: new ChatService(prisma as any, {} as any, storage as any), prisma, storage };
    }

    it('devuelve los bytes del audio a un participante', async () => {
      const { service } = build({ claveAlmacenamiento: 'chat/5/a.webm', mime: 'audio/webm', tamanoBytes: 64 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array(webm()).buffer }));
      const r = await service.getAdjuntoAudio(10, 5, 3, AUTOR);
      expect(r.mime).toBe('audio/webm');
      expect(r.datos.length).toBe(64);
      vi.unstubAllGlobals();
    });

    it('rechaza adjuntos que no son audio, mas grandes que 5 MB o inexistentes, y a quien no participa', async () => {
      await expect(build({ claveAlmacenamiento: 'k', mime: 'application/pdf', tamanoBytes: 10 }).service.getAdjuntoAudio(10, 5, 3, AUTOR)).rejects.toThrow(
        'no es una nota de voz',
      );
      await expect(
        build({ claveAlmacenamiento: 'k', mime: 'audio/webm', tamanoBytes: NOTA_VOZ_MAX_BYTES + 1 }).service.getAdjuntoAudio(10, 5, 3, AUTOR),
      ).rejects.toThrow('no es una nota de voz');
      await expect(build(null).service.getAdjuntoAudio(10, 5, 3, AUTOR)).rejects.toThrow('no encontrado');
      await expect(build({ claveAlmacenamiento: 'k', mime: 'audio/webm', tamanoBytes: 1 }).service.getAdjuntoAudio(10, 5, 3, 999)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('no sube nada si el contenido no es audio', async () => {
    const prisma = makePrisma();
    const storage = { upload: vi.fn(), destroy: vi.fn() };
    const service = new ChatService(prisma as any, { broadcastMessage: vi.fn() } as any, storage as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    await expect(
      service.createMessage(10, 5, AUTOR, '', { buffer: Buffer.from('MZ\x90\x00'), mimetype: 'audio/webm', originalname: 'a.webm' }, undefined, {
        duracionSegundos: 5,
      }),
    ).rejects.toThrow('Tipo de audio no permitido');
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('ChatService - mensajes fijados en proyecto (MEJ-43)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let gateway: { broadcastMessageChange: ReturnType<typeof vi.fn> };
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    gateway = { broadcastMessageChange: vi.fn() };
    service = new ChatService(prisma as any, gateway as any, {} as any);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, fijadoEn: null });
    prisma.mensajeChat.count.mockResolvedValue(0);
    prisma.mensajeChat.findUniqueOrThrow.mockResolvedValue({ idMensaje: 7, citado: null, fijadoEn: new Date() });
  });

  it('el autor y el lider pueden fijar; los demas participantes no', async () => {
    await service.fijarMensaje(10, 5, 7, AUTOR, true);
    await service.fijarMensaje(10, 5, 7, LIDER, true);
    expect(prisma.mensajeChat.update).toHaveBeenCalledTimes(2);
    await expect(service.fijarMensaje(10, 5, 7, OTRO, true)).rejects.toThrow(ForbiddenException);
    await expect(service.fijarMensaje(10, 5, 7, OTRO, false)).rejects.toThrow(ForbiddenException);
    expect(prisma.mensajeChat.update).toHaveBeenCalledTimes(2);
  });

  it('bloquea la conversacion al contar y avisa por socket a todos', async () => {
    await service.fijarMensaje(10, 5, 7, LIDER, true);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(gateway.broadcastMessageChange).toHaveBeenCalledWith('messageUpdated', 5, [LIDER, AUTOR, OTRO], expect.objectContaining({ idMensaje: 7 }));
  });

  it('no pasa de 3 fijados', async () => {
    prisma.mensajeChat.count.mockResolvedValue(3);
    await expect(service.fijarMensaje(10, 5, 7, LIDER, true)).rejects.toThrow('hasta 3 mensajes');
    expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
  });

  it('fijar un mensaje ya fijado no gasta cupo; desfijar lo libera', async () => {
    prisma.mensajeChat.count.mockResolvedValue(3);
    prisma.mensajeChat.findFirst.mockResolvedValue({ idRemitente: AUTOR, fijadoEn: new Date() });
    await service.fijarMensaje(10, 5, 7, LIDER, true);
    expect(prisma.mensajeChat.update).not.toHaveBeenCalled();
    await service.fijarMensaje(10, 5, 7, LIDER, false);
    expect(prisma.mensajeChat.update).toHaveBeenCalledWith({ where: { idMensaje: 7 }, data: { fijadoEn: null } });
  });

  it('no se fija en proyecto archivado, mensaje ajeno a la conversacion ni por quien no participa', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow('CERRADO'));
    await expect(service.fijarMensaje(10, 5, 7, LIDER, true)).rejects.toThrow(ForbiddenException);
    prisma.conversacion.findFirst.mockResolvedValue({ ...conversacionRow(), participantes: [{ idUsuario: AUTOR }] });
    await expect(service.fijarMensaje(10, 5, 7, LIDER, true)).rejects.toThrow(ForbiddenException);
    prisma.conversacion.findFirst.mockResolvedValue(conversacionRow());
    prisma.mensajeChat.findFirst.mockResolvedValue(null);
    await expect(service.fijarMensaje(10, 5, 99, LIDER, true)).rejects.toThrow('no encontrado');
  });
});

describe('OrganizationChatService - fijados (MEJ-43)', () => {
  function build(rol: string | null, estado = 'ACTIVA') {
    const prisma: Record<string, any> = {
      organizacion: {
        findUnique: vi.fn().mockResolvedValue({ idOrganizacion: 4, nombreOrganizacion: 'Org', estadoOrganizacion: estado, visibilidad: 'PRIVADA' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ creadaPor: 1 }),
      },
      usuarioOrganizacion: {
        findUnique: vi.fn().mockResolvedValue(rol ? { rolOrganizacion: rol, estadoMembresia: 'ACTIVA' } : null),
        findMany: vi.fn().mockResolvedValue([{ idUsuario: 10 }, { idUsuario: 11 }]),
      },
      conversacion: { findFirst: vi.fn().mockResolvedValue({ idConversacion: 50 }) },
      conversacionParticipante: {
        findMany: vi.fn().mockResolvedValue([{ idUsuario: 10 }, { idUsuario: 11 }]),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    const chat = { aplicarFijado: vi.fn().mockResolvedValue({ idMensaje: 7 }), fijadosDe: vi.fn().mockResolvedValue([]) };
    return { service: new OrganizationChatService(prisma as any, {} as any, chat as any), chat };
  }

  it.each(['PROPIETARIO', 'ADMINISTRADOR'])('%s puede fijar y desfijar', async (rol) => {
    const { service, chat } = build(rol);
    await service.fijar(10, 4, 7, true);
    await service.fijar(10, 4, 7, false);
    expect(chat.aplicarFijado).toHaveBeenNthCalledWith(1, 50, 7, true, [10, 11]);
    expect(chat.aplicarFijado).toHaveBeenNthCalledWith(2, 50, 7, false, [10, 11]);
  });

  it.each(['EDITOR', 'LECTURA'])('%s no puede fijar', async (rol) => {
    const { service, chat } = build(rol);
    await expect(service.fijar(10, 4, 7, true)).rejects.toThrow(ForbiddenException);
    expect(chat.aplicarFijado).not.toHaveBeenCalled();
  });

  it('un no miembro no fija ni ve los fijados; con la organizacion archivada tampoco se fija', async () => {
    const ajeno = build(null);
    await expect(ajeno.service.fijar(10, 4, 7, true)).rejects.toThrow();
    await expect(ajeno.service.fijados(10, 4)).rejects.toThrow();
    const archivada = build('PROPIETARIO', 'ARCHIVADA');
    await expect(archivada.service.fijar(10, 4, 7, true)).rejects.toThrow(ForbiddenException);
    expect(archivada.chat.aplicarFijado).not.toHaveBeenCalled();
  });

  it('un miembro de solo lectura si ve los fijados', async () => {
    const { service, chat } = build('LECTURA');
    await service.fijados(10, 4);
    expect(chat.fijadosDe).toHaveBeenCalledWith(50);
  });
});
