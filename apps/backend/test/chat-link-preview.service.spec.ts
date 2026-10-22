import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { LinkPreviewService, type Address, type HopResponse } from '../src/chat/link-preview/link-preview.service';
import { LinkPreviewError } from '../src/chat/link-preview/url-safety';

const PUBLIC: Address = { address: '93.184.216.34', family: 4 };

function html(body = '<title>Hola</title><meta property="og:description" content="Desc">'): HopResponse {
  return respond(200, { 'content-type': 'text/html; charset=utf-8' }, [Buffer.from(body)]);
}

function respond(status: number, headers: Record<string, string>, chunks: Array<Buffer | string> = []): HopResponse {
  return {
    status,
    headers,
    body: (async function* () {
      yield* chunks;
    })(),
    destroy: vi.fn(),
  };
}

function setup() {
  const cache = { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) };
  const service = new LinkPreviewService(cache as never);
  const resolver = vi.fn().mockResolvedValue([PUBLIC]);
  const transport = vi.fn().mockImplementation(async () => html());
  service.resolver = resolver;
  service.transport = transport;
  return { service, cache, resolver, transport };
}

async function reasonOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(LinkPreviewError);
    return (e as LinkPreviewError).reason;
  }
  return null;
}

describe('LinkPreviewService.fetchHtml bloqueo SSRF', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it.each([
    ['http://127.0.0.1/', 'blocked-ip'],
    ['http://10.0.0.5/', 'blocked-ip'],
    ['http://192.168.1.10/', 'blocked-ip'],
    ['http://172.16.0.1/', 'blocked-ip'],
    ['http://169.254.169.254/latest/meta-data/', 'blocked-ip'],
    ['http://[::1]/', 'blocked-ip'],
    ['http://[::ffff:127.0.0.1]/', 'blocked-ip'],
    ['http://[::ffff:169.254.169.254]/', 'blocked-ip'],
    ['http://[fe80::1]/', 'blocked-ip'],
    ['http://[fd00::1]/', 'blocked-ip'],
    ['http://2130706433/', 'blocked-ip'],
    ['http://0x7f.0.0.1/', 'blocked-ip'],
    ['file:///etc/passwd', 'scheme'],
    ['ftp://example.com/', 'scheme'],
    ['gopher://example.com/', 'scheme'],
    ['https://user:pw@example.com/', 'credentials'],
    ['http://example.com:8080/', 'port'],
    ['http://example.com:22/', 'port'],
  ])('rechaza %s (%s) sin abrir ninguna conexion', async (url, reason) => {
    expect(await reasonOf(ctx.service.fetchHtml(url))).toBe(reason);
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it('rechaza un hostname que resuelve a IP privada', async () => {
    ctx.resolver.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    expect(await reasonOf(ctx.service.fetchHtml('https://interno.example.com/'))).toBe('blocked-ip');
    expect(ctx.transport).not.toHaveBeenCalled();
  });

  it('rechaza si ALGUNA de las direcciones resueltas es privada', async () => {
    ctx.resolver.mockResolvedValue([PUBLIC, { address: '::1', family: 6 }]);
    expect(await reasonOf(ctx.service.fetchHtml('https://mixto.example.com/'))).toBe('blocked-ip');
  });

  it('rechaza hostname que resuelve a IPv4-mapped privada', async () => {
    ctx.resolver.mockResolvedValue([{ address: '::ffff:192.168.0.1', family: 6 }]);
    expect(await reasonOf(ctx.service.fetchHtml('https://mapped.example.com/'))).toBe('blocked-ip');
  });

  it('falla con dns cuando no resuelve o devuelve vacio', async () => {
    ctx.resolver.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await reasonOf(ctx.service.fetchHtml('https://nope.example.com/'))).toBe('dns');
    ctx.resolver.mockResolvedValue([]);
    expect(await reasonOf(ctx.service.fetchHtml('https://vacio.example.com/'))).toBe('dns');
  });

  it('conecta a la IP ya validada (anti DNS rebinding)', async () => {
    await ctx.service.fetchHtml('https://example.com/');
    expect(ctx.resolver).toHaveBeenCalledTimes(1);
    expect(ctx.transport.mock.calls[0][1]).toEqual(PUBLIC);
  });

  it('una IP publica literal no consulta DNS', async () => {
    await ctx.service.fetchHtml('http://93.184.216.34/');
    expect(ctx.resolver).not.toHaveBeenCalled();
    expect(ctx.transport.mock.calls[0][1]).toEqual({ address: '93.184.216.34', family: 4 });
  });
});

describe('LinkPreviewService.fetchHtml redirecciones', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('sigue una redireccion valida y devuelve la URL final', async () => {
    ctx.transport
      .mockImplementationOnce(async () => respond(301, { location: '/final' }))
      .mockImplementationOnce(async () => html('<title>Final</title>'));
    const out = await ctx.service.fetchHtml('https://example.com/inicio');
    expect(out.url.href).toBe('https://example.com/final');
    expect(out.html).toContain('Final');
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'blocked-ip'],
    ['http://127.0.0.1/admin', 'blocked-ip'],
    ['http://[::ffff:10.0.0.1]/', 'blocked-ip'],
    ['file:///etc/passwd', 'scheme'],
    ['http://example.com:8080/', 'port'],
    ['https://user:pw@example.com/', 'credentials'],
  ])('rechaza redireccion a %s', async (location, reason) => {
    ctx.transport.mockImplementationOnce(async () => respond(302, { location }));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe(reason);
    expect(ctx.transport).toHaveBeenCalledTimes(1);
  });

  it('rechaza redireccion a hostname que resuelve a IP privada (se revalida el DNS en cada salto)', async () => {
    ctx.resolver.mockResolvedValueOnce([PUBLIC]).mockResolvedValueOnce([{ address: '10.0.0.9', family: 4 }]);
    ctx.transport.mockImplementationOnce(async () => respond(302, { location: 'https://rebind.example.com/' }));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('blocked-ip');
    expect(ctx.transport).toHaveBeenCalledTimes(1);
  });

  it('permite 3 redirecciones y falla a la cuarta', async () => {
    ctx.transport.mockImplementation(async () => respond(302, { location: '/otra' }));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('redirects');
    expect(ctx.transport).toHaveBeenCalledTimes(4);

    ctx.transport.mockReset();
    ctx.transport
      .mockImplementationOnce(async () => respond(302, { location: '/1' }))
      .mockImplementationOnce(async () => respond(302, { location: '/2' }))
      .mockImplementationOnce(async () => respond(302, { location: '/3' }))
      .mockImplementationOnce(async () => html());
    await expect(ctx.service.fetchHtml('https://example.com/')).resolves.toBeDefined();
  });

  it('una 3xx sin Location es respuesta no valida', async () => {
    ctx.transport.mockImplementationOnce(async () => respond(304, {}));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('content-type');
  });
});

describe('LinkPreviewService.fetchHtml respuesta', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it.each(['application/json', 'image/png', 'text/plain', 'application/pdf', ''])('rechaza content-type %j', async (type) => {
    ctx.transport.mockImplementationOnce(async () => respond(200, type ? { 'content-type': type } : {}, ['x']));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('content-type');
  });

  it('rechaza estados que no son 200', async () => {
    ctx.transport.mockImplementationOnce(async () => respond(404, { 'content-type': 'text/html' }, ['x']));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('content-type');
  });

  it('rechaza por Content-Length declarado mayor al limite', async () => {
    const res = respond(200, { 'content-type': 'text/html', 'content-length': String(600 * 1024) }, ['x']);
    ctx.transport.mockImplementationOnce(async () => res);
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('too-large');
    expect(res.destroy).toHaveBeenCalled();
  });

  it('aborta el stream al exceder 512 KB aunque no declare Content-Length', async () => {
    const res = respond(200, { 'content-type': 'text/html' }, [Buffer.alloc(300 * 1024, 'a'), Buffer.alloc(300 * 1024, 'a')]);
    ctx.transport.mockImplementationOnce(async () => res);
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('too-large');
    expect(res.destroy).toHaveBeenCalled();
  });

  it('acepta cuerpo justo en el limite y chunks en string', async () => {
    ctx.transport.mockImplementationOnce(async () =>
      respond(200, { 'content-type': 'text/html' }, [Buffer.alloc(512 * 1024 - 5, 'a'), '12345']),
    );
    const out = await ctx.service.fetchHtml('https://example.com/');
    expect(out.html).toHaveLength(512 * 1024);
  });

  it('timeout total: una conexion colgada se corta a los ~3 s', async () => {
    vi.useFakeTimers();
    try {
      ctx.transport.mockImplementationOnce(
        (_u: URL, _t: Address, signal: AbortSignal) =>
          new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      const result = reasonOf(ctx.service.fetchHtml('https://example.com/'));
      await vi.advanceTimersByTimeAsync(3100);
      expect(await result).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout total: un DNS colgado tambien se corta', async () => {
    vi.useFakeTimers();
    try {
      ctx.resolver.mockImplementationOnce(() => new Promise(() => undefined));
      const result = reasonOf(ctx.service.fetchHtml('https://example.com/'));
      await vi.advanceTimersByTimeAsync(3100);
      expect(await result).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('error de red se reporta como network', async () => {
    ctx.transport.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('network');
  });

  it('Location invalida se reporta como network', async () => {
    ctx.transport.mockImplementationOnce(async () => respond(302, { location: 'http://[' }));
    expect(await reasonOf(ctx.service.fetchHtml('https://example.com/'))).toBe('network');
  });
});

describe('LinkPreviewService.preview', () => {
  it('devuelve metadatos y guarda en cache con TTL', async () => {
    const { service, cache } = setup();
    const out = await service.preview('https://example.com/a');
    expect(out).toEqual({ url: 'https://example.com/a', titulo: 'Hola', descripcion: 'Desc', sitio: 'example.com' });
    expect(cache.set).toHaveBeenCalledWith('link-preview:https://example.com/a', out, expect.any(Number));
  });

  it('sirve desde cache sin tocar la red', async () => {
    const { service, cache, resolver } = setup();
    const cached = { url: 'https://example.com/a', titulo: 'C', descripcion: null, sitio: 'example.com' };
    cache.get.mockResolvedValue(cached);
    await expect(service.preview('https://example.com/a')).resolves.toBe(cached);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('un fallo de la cache no rompe la vista previa', async () => {
    const { service, cache } = setup();
    cache.get.mockRejectedValue(new Error('redis'));
    cache.set.mockRejectedValue(new Error('redis'));
    await expect(service.preview('https://example.com/a')).resolves.toMatchObject({ titulo: 'Hola' });
  });

  it('cualquier fallo se traduce a un 422 generico y no se cachea', async () => {
    const { service, cache } = setup();
    for (const url of ['http://127.0.0.1/', 'file:///etc/passwd', 'http://example.com:8080/']) {
      const err = await service.preview(url).catch((e) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(err.message).toBe('No se pudo generar la vista previa');
    }
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('usa la URL final tras redirecciones en la respuesta', async () => {
    const { service, transport } = setup();
    transport
      .mockImplementationOnce(async () => respond(301, { location: 'https://www.example.com/x' }))
      .mockImplementationOnce(async () => html('<title>X</title>'));
    expect((await service.preview('https://example.com/')).url).toBe('https://www.example.com/x');
  });
});
