import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UserNameSearchService } from '../src/common/search/user-name-search.service';

function makePrisma(filas: { id_usuario: number }[] = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(filas),
  } as unknown as PrismaService & { $queryRaw: ReturnType<typeof vi.fn> };
}

describe('UserNameSearchService.findMatchingUserIds', () => {
  it('devuelve [] sin consultar la BD cuando el texto es vacío o solo espacios', async () => {
    const prisma = makePrisma();
    const service = new UserNameSearchService(prisma);

    expect(await service.findMatchingUserIds('')).toEqual([]);
    expect(await service.findMatchingUserIds('   ')).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('mapea las filas id_usuario de $queryRaw a un array de números', async () => {
    const prisma = makePrisma([{ id_usuario: 9 }, { id_usuario: 42 }]);
    const service = new UserNameSearchService(prisma);

    const resultado = await service.findMatchingUserIds('saul');

    expect(resultado).toEqual([9, 42]);
  });

  it('recorta espacios y arma el patrón LIKE con % al inicio y al final', async () => {
    const prisma = makePrisma();
    const service = new UserNameSearchService(prisma);

    await service.findMatchingUserIds('  saul  ');

    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['%saul%', '%saul%']);
  });

  it('escapa los comodines de LIKE (%, _, \\) en el texto de búsqueda antes de armar el patrón', async () => {
    const prisma = makePrisma();
    const service = new UserNameSearchService(prisma);

    await service.findMatchingUserIds('50%_raro\\');

    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(['%50\\%\\_raro\\\\%', '%50\\%\\_raro\\\\%']);
  });

  it('la consulta filtra sobre nombre y apellido, no solo sobre el primer nombre', async () => {
    const prisma = makePrisma();
    const service = new UserNameSearchService(prisma);

    await service.findMatchingUserIds('hernandez');

    const sql = prisma.$queryRaw.mock.calls[0][0];
    const texto = sql.strings.join('');
    expect(texto).toContain('nombre');
    expect(texto).toContain('apellido');
  });
});
