import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatService } from '../src/chat/chat.service';
import { CHAT_SEARCH_MAX_LIMIT, SearchMessagesQueryDto } from '../src/chat/dto/search-messages-query.dto';

const USUARIO = { idUsuario: 1, nombre: 'Ana', apellido: 'Perez', fotoUrl: null };
const mensaje = (idMensaje: number) => ({
  idMensaje,
  idConversacion: 5,
  contenido: `m${idMensaje}`,
  enviadoEn: new Date(),
  remitente: USUARIO,
});

function makePrisma() {
  return {
    $queryRaw: vi.fn(),
    conversacion: { findFirst: vi.fn() },
    mensajeChat: { findMany: vi.fn() },
  };
}

describe('ChatService.searchMessages', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ChatService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ChatService(prisma as any, {} as any);
    prisma.conversacion.findFirst.mockResolvedValue({
      idConversacion: 5,
      participantes: [{ idUsuario: 1 }, { idUsuario: 2 }],
      proyecto: { estadoProyecto: 'EN_PROGRESO' },
    });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.mensajeChat.findMany.mockResolvedValue([]);
  });

  const sqlDe = () => prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };

  it('rechaza a quien no participa en la conversacion sin consultar mensajes', async () => {
    await expect(service.searchMessages(10, 5, 99, { q: 'hola' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('404 si la conversacion no existe en el proyecto', async () => {
    prisma.conversacion.findFirst.mockResolvedValue(null);
    await expect(service.searchMessages(10, 5, 1, { q: 'hola' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('solo filtra por conversacion cuando no hay otros filtros', async () => {
    await service.searchMessages(10, 5, 1, {});
    const { sql, values } = sqlDe();
    expect(sql).not.toContain('LIKE');
    expect(sql).not.toContain('id_remitente');
    expect(values).toEqual([5, 21, 0]);
  });

  it('parametriza texto, autor y fechas sin concatenar valores en el SQL', async () => {
    const desde = '2026-01-01T00:00:00.000Z';
    const hasta = '2026-01-31T23:59:59.999Z';
    await service.searchMessages(10, 5, 1, { q: 'Reunión', idAutor: 2, desde, hasta });
    const { sql, values } = sqlDe();
    expect(sql).toContain('LIKE');
    expect(sql).toContain('id_remitente =');
    expect(sql).toContain('enviado_en >=');
    expect(sql).toContain('enviado_en <=');
    expect(sql).not.toContain('Reunión');
    expect(values).toEqual([5, '%Reunión%', 2, new Date(desde), new Date(hasta), 21, 0]);
  });

  it('escapa los comodines de LIKE del texto buscado', async () => {
    await service.searchMessages(10, 5, 1, { q: '100%_a\\b' });
    expect(sqlDe().values[1]).toBe('%100\\%\\_a\\\\b%');
  });

  it('pagina con offset y limite, y detecta si hay otra pagina', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id_mensaje: 3 }, { id_mensaje: 2 }, { id_mensaje: 1 }]);
    prisma.mensajeChat.findMany.mockResolvedValue([mensaje(2), mensaje(3)]);
    const r = await service.searchMessages(10, 5, 1, { q: 'm', pagina: 3, limite: 2 });
    expect(sqlDe().values).toEqual([5, '%m%', 3, 4]);
    expect(r.hasMore).toBe(true);
    expect(r.pagina).toBe(3);
    // conserva el orden de la consulta (mas reciente primero)
    expect(r.items.map((m) => m.idMensaje)).toEqual([3, 2]);
    expect(r.termino).toBe('m');
  });

  it('ultima pagina: hasMore false y termino null sin texto', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id_mensaje: 1 }]);
    prisma.mensajeChat.findMany.mockResolvedValue([mensaje(1)]);
    const r = await service.searchMessages(10, 5, 1, { idAutor: 1 });
    expect(r.hasMore).toBe(false);
    expect(r.termino).toBeNull();
  });

  it('rechaza un rango con desde posterior a hasta', async () => {
    await expect(
      service.searchMessages(10, 5, 1, { desde: '2026-02-01T00:00:00Z', hasta: '2026-01-01T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('SearchMessagesQueryDto', () => {
  const errores = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(SearchMessagesQueryDto, plain))).map((e) => e.property);

  it('acepta una consulta valida con tipos convertidos desde strings', async () => {
    const dto = plainToInstance(SearchMessagesQueryDto, {
      q: '  hola  ',
      idAutor: '2',
      desde: '2026-01-01T00:00:00Z',
      hasta: '2026-01-02T00:00:00Z',
      pagina: '2',
      limite: '10',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ q: 'hola', idAutor: 2, pagina: 2, limite: 10 });
  });

  it('todos los campos son opcionales', async () => {
    expect(await errores({})).toEqual([]);
  });

  it('valida longitud minima y maxima del texto', async () => {
    expect(await errores({ q: 'a' })).toEqual(['q']);
    expect(await errores({ q: ' a ' })).toEqual(['q']);
    expect(await errores({ q: 'a'.repeat(101) })).toEqual(['q']);
    expect(await errores({ q: 'a'.repeat(100) })).toEqual([]);
  });

  it('limita el tamano de pagina', async () => {
    expect(await errores({ limite: String(CHAT_SEARCH_MAX_LIMIT + 1) })).toEqual(['limite']);
    expect(await errores({ limite: '0' })).toEqual(['limite']);
    expect(await errores({ limite: String(CHAT_SEARCH_MAX_LIMIT) })).toEqual([]);
    expect(await errores({ pagina: '0' })).toEqual(['pagina']);
  });

  it('rechaza autor no numerico y fechas invalidas', async () => {
    expect((await errores({ idAutor: 'abc', desde: 'ayer', hasta: '32/13/2026' })).sort()).toEqual([
      'desde',
      'hasta',
      'idAutor',
    ]);
  });
});
