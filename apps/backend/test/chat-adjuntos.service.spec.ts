import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../src/chat/chat.service';

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(50)]);
const ARCHIVO = { buffer: PDF_BYTES, mimetype: 'application/pdf', originalname: '../Informe final.pdf' };

function conversacion(estadoProyecto = 'EN_PROGRESO', participantes = [{ idUsuario: 1 }, { idUsuario: 2 }]) {
  return { idConversacion: 5, idProyecto: 10, participantes, proyecto: { estadoProyecto } };
}

describe('ChatService - adjuntos', () => {
  const fn = vi.fn;
  let prisma: any;
  let gateway: { broadcastMessage: ReturnType<typeof vi.fn> };
  let storage: { upload: ReturnType<typeof vi.fn>; signedUrl: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      conversacion: { findFirst: fn() },
      mensajeChat: { create: fn() },
      conversacionParticipante: { update: fn().mockResolvedValue({}) },
      adjuntoMensajeChat: { findFirst: fn(), findMany: fn() },
      $transaction: fn(),
    };
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
    gateway = { broadcastMessage: fn() };
    storage = {
      upload: fn().mockResolvedValue(undefined),
      signedUrl: fn().mockResolvedValue('https://firmada.example/x'),
      destroy: fn().mockResolvedValue(undefined),
    };
    service = new ChatService(prisma, gateway as any, storage);
    prisma.conversacion.findFirst.mockResolvedValue(conversacion());
  });

  describe('createMessage con archivo', () => {
    it('sube con clave chat/<conversacion>/, guarda metadatos sanitizados y emite por el gateway', async () => {
      const mensaje = { idMensaje: 9, contenido: '', enviadoEn: new Date(), remitente: USUARIO, adjunto: { idAdjunto: 3 } };
      prisma.mensajeChat.create.mockResolvedValue(mensaje);

      const res = await service.createMessage(10, 5, 1, '', ARCHIVO);

      const [clave, bytes] = storage.upload.mock.calls[0];
      expect(clave).toMatch(/^chat\/5\/[0-9a-f-]{36}\.pdf$/);
      expect(bytes).toBe(PDF_BYTES);
      const data = prisma.mensajeChat.create.mock.calls[0][0].data;
      expect(data.adjunto.create).toMatchObject({
        nombreOriginal: 'Informe final.pdf',
        mime: 'application/pdf',
        tamanoBytes: PDF_BYTES.length,
        claveAlmacenamiento: clave,
      });
      const esperado = { ...mensaje, citado: null };
      expect(gateway.broadcastMessage).toHaveBeenCalledWith(5, [2], esperado);
      expect(res).toEqual(esperado);
    });

    it('no sube nada si el contenido no coincide con el tipo declarado', async () => {
      await expect(
        service.createMessage(10, 5, 1, 'x', { ...ARCHIVO, mimetype: 'image/png' }),
      ).rejects.toThrow(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
      expect(prisma.mensajeChat.create).not.toHaveBeenCalled();
    });

    it('rechaza a quien no participa sin tocar el almacenamiento', async () => {
      await expect(service.createMessage(10, 5, 99, 'x', ARCHIVO)).rejects.toThrow(ForbiddenException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('rechaza en conversaciones archivadas', async () => {
      prisma.conversacion.findFirst.mockResolvedValue(conversacion('CERRADO'));
      await expect(service.createMessage(10, 5, 1, 'x', ARCHIVO)).rejects.toThrow(ForbiddenException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('limpia el archivo remoto si falla guardar el mensaje', async () => {
      prisma.mensajeChat.create.mockRejectedValue(new Error('db'));
      await expect(service.createMessage(10, 5, 1, '', ARCHIVO)).rejects.toThrow('db');
      expect(storage.destroy).toHaveBeenCalledWith(storage.upload.mock.calls[0][0]);
      expect(gateway.broadcastMessage).not.toHaveBeenCalled();
    });

    it('RTF-3.4: si falla la segunda escritura (ultimaLecturaEn) no queda mensaje, ni difusion, y se borra el adjunto', async () => {
      // Transaccion simulada: las escrituras solo "persisten" si el callback resuelve.
      const persistidos: unknown[] = [];
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const staged: unknown[] = [];
        const tx = {
          mensajeChat: {
            create: async () => {
              const m = { idMensaje: 9, enviadoEn: new Date(), remitente: USUARIO };
              staged.push(m);
              return m;
            },
          },
          conversacionParticipante: { update: async () => Promise.reject(new Error('fallo segunda escritura')) },
        };
        const res = await cb(tx);
        persistidos.push(...staged);
        return res;
      });

      await expect(service.createMessage(10, 5, 1, '', ARCHIVO)).rejects.toThrow('fallo segunda escritura');

      expect(persistidos).toHaveLength(0);
      expect(gateway.broadcastMessage).not.toHaveBeenCalled();
      expect(storage.destroy).toHaveBeenCalledWith(storage.upload.mock.calls[0][0]);
    });

    it('un mensaje sin archivo no usa el almacenamiento ni crea adjunto', async () => {
      prisma.mensajeChat.create.mockResolvedValue({ idMensaje: 1, enviadoEn: new Date() });
      await service.createMessage(10, 5, 1, ' hola ');
      expect(storage.upload).not.toHaveBeenCalled();
      expect(prisma.mensajeChat.create.mock.calls[0][0].data).toEqual({
        idConversacion: 5,
        idRemitente: 1,
        contenido: 'hola',
      });
    });
  });

  describe('getAdjuntoUrl', () => {
    it('devuelve URL firmada de vida corta a un participante', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue({
        claveAlmacenamiento: 'chat/5/a.pdf',
        nombreOriginal: 'a.pdf',
        mime: 'application/pdf',
      });
      const res = await service.getAdjuntoUrl(10, 5, 3, 1);
      expect(prisma.adjuntoMensajeChat.findFirst.mock.calls[0][0].where).toEqual({
        idAdjunto: 3,
        idConversacion: 5,
        mensaje: { eliminadoEn: null },
      });
      expect(storage.signedUrl).toHaveBeenCalledWith('chat/5/a.pdf', 60);
      expect(res).toMatchObject({ url: 'https://firmada.example/x', nombreOriginal: 'a.pdf', expiraEnSegundos: 60 });
    });

    it('un no participante no obtiene URL ni consulta el adjunto', async () => {
      await expect(service.getAdjuntoUrl(10, 5, 3, 99)).rejects.toThrow(ForbiddenException);
      expect(prisma.adjuntoMensajeChat.findFirst).not.toHaveBeenCalled();
      expect(storage.signedUrl).not.toHaveBeenCalled();
    });

    it('adjunto de un mensaje eliminado: 404 sin firmar URL', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(null);
      await expect(service.getAdjuntoUrl(10, 5, 3, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.adjuntoMensajeChat.findFirst.mock.calls[0][0].where.mensaje).toEqual({ eliminadoEn: null });
      expect(storage.signedUrl).not.toHaveBeenCalled();
    });

    it('404 si el adjunto no pertenece a la conversacion', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(null);
      await expect(service.getAdjuntoUrl(10, 5, 3, 1)).rejects.toThrow(NotFoundException);
      expect(storage.signedUrl).not.toHaveBeenCalled();
    });
  });

  describe('getAdjuntoImagen', () => {
    const imagen = { claveAlmacenamiento: 'chat/5/a.png', mime: 'image/png', tamanoBytes: 3 };
    afterEach(() => vi.unstubAllGlobals());

    it('descarga la imagen en el servidor y devuelve bytes y mime', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(imagen);
      const fetchMock = fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
      vi.stubGlobal('fetch', fetchMock);
      const res = await service.getAdjuntoImagen(10, 5, 3, 1);
      expect(fetchMock).toHaveBeenCalledWith('https://firmada.example/x');
      expect(res.mime).toBe('image/png');
      expect([...res.datos]).toEqual([1, 2, 3]);
    });

    it('un no participante no descarga nada', async () => {
      const fetchMock = fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(service.getAdjuntoImagen(10, 5, 3, 99)).rejects.toThrow(ForbiddenException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('adjunto de un mensaje eliminado: 404 y no descarga nada', async () => {
      const fetchMock = fn();
      vi.stubGlobal('fetch', fetchMock);
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(null);
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(NotFoundException);
      expect(prisma.adjuntoMensajeChat.findFirst.mock.calls[0][0].where.mensaje).toEqual({ eliminadoEn: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('404 si el adjunto no es de la conversacion', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(null);
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(NotFoundException);
    });

    it('rechaza lo que no es imagen o supera 10 MB', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValueOnce({ ...imagen, mime: 'application/pdf' });
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(BadRequestException);
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValueOnce({ ...imagen, tamanoBytes: 10 * 1024 * 1024 + 1 });
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(BadRequestException);
      expect(storage.signedUrl).not.toHaveBeenCalled();
    });

    it('404 si el proveedor no responde bien y 400 si los bytes exceden el tope', async () => {
      prisma.adjuntoMensajeChat.findFirst.mockResolvedValue(imagen);
      vi.stubGlobal('fetch', fn().mockResolvedValue({ ok: false }));
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(NotFoundException);
      vi.stubGlobal('fetch', fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024 + 1) }));
      await expect(service.getAdjuntoImagen(10, 5, 3, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getArchivos', () => {
    const fila = (idAdjunto: number) => ({
      idAdjunto,
      idMensaje: idAdjunto + 100,
      nombreOriginal: `f${idAdjunto}.pdf`,
      mime: 'application/pdf',
      tamanoBytes: 10,
      creadoEn: new Date(),
      mensaje: { remitente: USUARIO },
    });

    it('rechaza a quien no participa', async () => {
      await expect(service.getArchivos(10, 5, 99)).rejects.toThrow(ForbiddenException);
      expect(prisma.adjuntoMensajeChat.findMany).not.toHaveBeenCalled();
    });

    it('lista sin clave de almacenamiento y pagina por cursor', async () => {
      prisma.adjuntoMensajeChat.findMany.mockResolvedValue([fila(8), fila(7)]);
      const res = await service.getArchivos(10, 5, 1, { cursor: 9, limite: 2 });
      expect(prisma.adjuntoMensajeChat.findMany.mock.calls[0][0]).toMatchObject({
        where: { idConversacion: 5, mensaje: { eliminadoEn: null }, idAdjunto: { lt: 9 } },
        take: 2,
      });
      expect(res.items.map((i) => i.idAdjunto)).toEqual([8, 7]);
      expect(res.items[0]).toMatchObject({ remitente: USUARIO });
      expect(res.items[0]).not.toHaveProperty('claveAlmacenamiento');
      expect(res.nextCursor).toBe(7);
    });

    it('sin mas paginas el cursor es null', async () => {
      prisma.adjuntoMensajeChat.findMany.mockResolvedValue([fila(1)]);
      const res = await service.getArchivos(10, 5, 1);
      expect(res.nextCursor).toBeNull();
      expect(prisma.adjuntoMensajeChat.findMany.mock.calls[0][0].where).toEqual({
        idConversacion: 5,
        mensaje: { eliminadoEn: null },
      });
    });
  });
});
