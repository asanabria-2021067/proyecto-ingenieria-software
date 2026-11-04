import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TareaEnlacesService, MAX_ENLACES_POR_TAREA } from '../src/tasks/tarea-enlaces.service';
import { LinkPreviewService } from '../src/chat/link-preview/link-preview.service';
import { fakeProjectTx } from './helpers/fake-project-tx';

function crear(opts: { autoriza?: boolean; enlaces?: number; vista?: unknown; p2002?: boolean; resolver?: (h: string) => Promise<{ address: string; family: number }[]> } = {}) {
  const { autoriza = true, enlaces = 0, p2002 = false } = opts;
  const tx = {
    tareaEnlace: {
      count: vi.fn(async () => enlaces),
      create: vi.fn(async ({ data }: { data: object }) => {
        if (p2002) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        return { idEnlace: 1, ...data };
      }),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const auth = {
    assertCanChangeTaskState: vi.fn(async () => {
      if (!autoriza) throw new ForbiddenException('no');
      return { idSprint: 3 };
    }),
    assertCanReadTask: vi.fn(),
  };
  const policy = { assertWriteTx: vi.fn(async () => undefined) };
  // Servicio real del chat: la proteccion SSRF es la del chat, solo se sustituyen DNS y transporte.
  const preview = new LinkPreviewService({ get: async () => undefined, set: async () => undefined } as never);
  preview.resolver = opts.resolver ?? (async () => [{ address: '93.184.216.34', family: 4 }]);
  const transport = vi.fn(async () => {
    if (opts.vista === null) throw new Error('sin respuesta');
    return {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: (async function* () { yield Buffer.from('<html><head><title>Diseno final</title><meta property="og:site_name" content="Figma"></head></html>'); })(),
      destroy: vi.fn(),
    };
  });
  preview.transport = transport as never;
  const service = new TareaEnlacesService({} as never, fakeProjectTx(tx) as never, policy as never, auth as never, {} as never, preview);
  return { service, tx, auth, transport };
}

describe('MEJ-107: enlaces de la tarea', () => {
  it('guarda un enlace https con titulo, sitio e icono por tipo', async () => {
    const { service, tx } = crear();
    const enlace = await service.add(1, 5, 9, { url: 'https://www.figma.com/file/abc' });
    expect(tx.tareaEnlace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { idTarea: 5, url: 'https://www.figma.com/file/abc', titulo: 'Diseno final', sitio: 'Figma', tipo: 'FIGMA', creadoPor: 9 },
      }),
    );
    expect(enlace).toMatchObject({ tipo: 'FIGMA' });
  });

  it.each([
    ['https://drive.google.com/drive/folders/1', 'DRIVE'],
    ['https://docs.google.com/document/d/1', 'DRIVE'],
    ['https://github.com/org/repo', 'GITHUB'],
    ['https://ejemplo.org/pagina', 'GENERICO'],
  ])('clasifica %s como %s', async (url, tipo) => {
    const { service, tx } = crear();
    await service.add(1, 5, 9, { url });
    expect((tx.tareaEnlace.create.mock.calls[0][0] as unknown as { data: { tipo: string } }).data.tipo).toBe(tipo);
  });

  it('si la pagina no responde igual guarda el enlace con el host como titulo y sitio', async () => {
    const { service, tx } = crear({ vista: null });
    await service.add(1, 5, 9, { url: 'https://ejemplo.org/privado' });
    expect((tx.tareaEnlace.create.mock.calls[0][0] as unknown as { data: object }).data).toMatchObject({ titulo: 'ejemplo.org', sitio: 'ejemplo.org' });
  });

  it('un no miembro recibe 403 y el servidor nunca hace la peticion saliente', async () => {
    const { service, tx, transport } = crear({ autoriza: false });
    await expect(service.add(1, 5, 9, { url: 'https://ejemplo.org/' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(1, 5, 1, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transport).not.toHaveBeenCalled();
    expect(tx.tareaEnlace.create).not.toHaveBeenCalled();
    expect(tx.tareaEnlace.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    'http://ejemplo.org/',
    'ftp://ejemplo.org/',
    'javascript:alert(1)',
    'https://usuario:clave@ejemplo.org/',
    'https://ejemplo.org:8443/',
    'no es una url',
  ])('rechaza %s sin llamar a la red', async (url) => {
    const { service, tx, transport } = crear();
    await expect(service.add(1, 5, 9, { url })).rejects.toBeInstanceOf(BadRequestException);
    expect(transport).not.toHaveBeenCalled();
    expect(tx.tareaEnlace.create).not.toHaveBeenCalled();
  });

  it.each([
    'https://127.0.0.1/',
    'https://localhost/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
  ])('bloquea el host interno %s (SSRF)', async (url) => {
    const { service, tx, transport } = crear({
      // localhost resuelve a loopback, como en un servidor real.
      resolver: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    await expect(service.add(1, 5, 9, { url })).rejects.toBeInstanceOf(BadRequestException);
    expect(transport).not.toHaveBeenCalled();
    expect(tx.tareaEnlace.create).not.toHaveBeenCalled();
  });

  it('bloquea un dominio publico que resuelve a una IP privada o a una mezcla con IP privada', async () => {
    for (const direcciones of [
      [{ address: '192.168.1.10', family: 4 }],
      [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
    ]) {
      const { service, transport } = crear({ resolver: async () => direcciones });
      await expect(service.add(1, 5, 9, { url: 'https://rebind.ejemplo.org/' })).rejects.toBeInstanceOf(BadRequestException);
      expect(transport).not.toHaveBeenCalled();
    }
  });

  it('admite hasta 10 enlaces por tarea', async () => {
    const lleno = crear({ enlaces: MAX_ENLACES_POR_TAREA });
    await expect(lleno.service.add(1, 5, 9, { url: 'https://ejemplo.org/' })).rejects.toBeInstanceOf(ConflictException);
    expect(lleno.tx.tareaEnlace.create).not.toHaveBeenCalled();
    const casi = crear({ enlaces: MAX_ENLACES_POR_TAREA - 1 });
    await expect(casi.service.add(1, 5, 9, { url: 'https://ejemplo.org/' })).resolves.toBeDefined();
  });

  it('un enlace repetido en la misma tarea da 409', async () => {
    const { service } = crear({ p2002: true });
    await expect(service.add(1, 5, 9, { url: 'https://ejemplo.org/' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('quitar un enlace de otra tarea da 404', async () => {
    const { service, tx } = crear();
    tx.tareaEnlace.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.remove(1, 5, 77, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.tareaEnlace.deleteMany).toHaveBeenCalledWith({ where: { idEnlace: 77, idTarea: 5 } });
  });
});
