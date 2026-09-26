import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * T-245: `unaccent(lower(...))` y el índice GIN `pg_trgm` sobre esa
 * expresión (migración `..._user_name_search_unaccent`) no se pueden
 * verificar de forma creíble con un mock de Prisma — el comportamiento que
 * importa (acentos, mayúsculas, coincidencia parcial) lo decide Postgres,
 * no TypeScript. Se activa solo con INTEGRATION_DATABASE_URL, mismo patrón
 * que el resto de test/integration/.
 */
describeIntegration('UserNameSearchService — PostgreSQL real (unaccent + pg_trgm)', () => {
  let prisma: PrismaClient;
  let service: UserNameSearchService;
  let scope: IntegrationCleanupScope;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    service = new UserNameSearchService(prisma as unknown as PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    scope = {};
  });

  afterEach(async () => {
    await cleanupIntegrationFixtures(prisma, scope);
  });

  it('"saul" encuentra a "Saúl" (sin acentos -> con acentos)', async () => {
    const saul = await createIntegrationUser(prisma, { nombre: 'Saúl', apellido: 'Castillo' });
    scope.userIds = [saul.idUsuario];

    const ids = await service.findMatchingUserIds('saul');

    expect(ids).toContain(saul.idUsuario);
  });

  it('"Saúl" encuentra a un usuario guardado como "Saul" (con acentos -> sin acentos)', async () => {
    const usuario = await createIntegrationUser(prisma, { nombre: 'Saul', apellido: 'Castillo' });
    scope.userIds = [usuario.idUsuario];

    const ids = await service.findMatchingUserIds('Saúl');

    expect(ids).toContain(usuario.idUsuario);
  });

  it('"SAUL" (mayúsculas) encuentra a "Saúl"', async () => {
    const saul = await createIntegrationUser(prisma, { nombre: 'Saúl', apellido: 'Castillo' });
    scope.userIds = [saul.idUsuario];

    const ids = await service.findMatchingUserIds('SAUL');

    expect(ids).toContain(saul.idUsuario);
  });

  it('"her" (parcial) encuentra a "Hernández" por apellido, no solo por nombre', async () => {
    const ana = await createIntegrationUser(prisma, { nombre: 'Ana', apellido: 'Hernández' });
    scope.userIds = [ana.idUsuario];

    const ids = await service.findMatchingUserIds('her');

    expect(ids).toContain(ana.idUsuario);
  });

  it('no devuelve coincidencias para un texto que no aparece en nombre ni apellido', async () => {
    const usuario = await createIntegrationUser(prisma, { nombre: 'Marcos', apellido: 'Aguilar' });
    scope.userIds = [usuario.idUsuario];

    const ids = await service.findMatchingUserIds('zzz-no-existe-zzz');

    expect(ids).not.toContain(usuario.idUsuario);
  });
});
