import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CACHE_MODULE_OPTIONS, CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BACKEND_ENV_PATH, buildEnvOptions, resolveBackendEnvPath } from '../src/config/env.options';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  assertSweeperAdmin,
  validateEnvironment,
  type ClosureAvailability,
  type SweeperAdminReader,
} from '../src/config/environment.validation';
import { StorageModule } from '../src/storage/storage.module';
import {
  CLOSURE_NOT_CONFIGURED_CODE,
  ClosureTicketService,
} from '../src/storage/closure-ticket.service';
import { ClosureCryptoService } from '../src/storage/closure-crypto.service';
import { CloudinaryClosureStorageAdapter } from '../src/storage/cloudinary-closure-storage.adapter';
import { ProjectClosureReportService } from '../src/project-closure/project-closure-report.service';
import {
  buildReportContext,
  projectClosureModel,
} from '../src/project-closure/closure-report-model';

/**
 * TC03 — foundation única de environment (06 v2 §51.1 y §47). Cada caso usa
 * fixtures sintéticos (directorio temporal o entornos en memoria): nunca lee
 * ni escribe el apps/backend/.env real y no expone ningún secreto.
 */

type ProcessEnvSnapshot = Record<string, string | undefined>;

function snapshotProcessEnv(): ProcessEnvSnapshot {
  return { ...process.env };
}

function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const LOGGER_METHODS = ['log', 'warn', 'error', 'debug', 'verbose'] as const;

function captureLogger(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const spies = LOGGER_METHODS.map((method) =>
    vi.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
      calls.push(args);
    }),
  );
  return { calls, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

// Material sintético y determinista: nunca un secreto real.
const SYNTHETIC_KEK = Buffer.alloc(32, 1).toString('base64');
const SYNTHETIC_HMAC = Buffer.alloc(32, 2).toString('base64');
const SYNTHETIC_API_SECRET = 'synthetic-cloudinary-secret-for-tests';
const SYNTHETIC_SECRETS = [SYNTHETIC_KEK, SYNTHETIC_HMAC, SYNTHETIC_API_SECRET];

function leakedSecrets(haystack: string[]): string[] {
  return SYNTHETIC_SECRETS.filter((secret) => haystack.some((text) => text.includes(secret)));
}

function completeClosureEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:3000',
    CLOUDINARY_CLOUD_NAME: 'demo-cloud',
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: SYNTHETIC_API_SECRET,
    CLOSURE_KEKS: JSON.stringify({ 'kek-2026-09': SYNTHETIC_KEK }),
    CLOSURE_ACTIVE_KEY_ID: 'kek-2026-09',
    CLOSURE_TICKET_HMAC_SECRET: SYNTHETIC_HMAC,
  };
}

// ---- TC03-D: introspección del grafo de módulos sin @nestjs/testing (el repo no lo instala).

type ModuleEntry = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference;

interface AsyncOptionsProvider {
  provide: unknown;
  useFactory: (...args: unknown[]) => unknown;
  inject?: unknown[];
}

function isDynamicModule(value: unknown): value is DynamicModule {
  return typeof value === 'object' && value !== null && 'module' in value;
}

async function resolveModuleEntry(entry: ModuleEntry): Promise<Type<unknown> | DynamicModule> {
  const awaited = await entry;
  if (typeof awaited === 'object' && awaited !== null && 'forwardRef' in awaited) {
    return (awaited as ForwardReference).forwardRef() as Type<unknown>;
  }
  return awaited as Type<unknown> | DynamicModule;
}

function moduleImportsOf(moduleClass: Type<unknown>): ModuleEntry[] {
  return (Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) ?? []) as ModuleEntry[];
}

async function collectModuleGraph(root: Type<unknown>) {
  const classes = new Set<Type<unknown>>();
  const dynamics: DynamicModule[] = [];

  const visit = async (entry: ModuleEntry): Promise<void> => {
    const resolved = await resolveModuleEntry(entry);
    let moduleClass: Type<unknown>;
    let dynamicImports: ModuleEntry[] = [];
    if (isDynamicModule(resolved)) {
      dynamics.push(resolved);
      moduleClass = resolved.module;
      dynamicImports = (resolved.imports ?? []) as ModuleEntry[];
    } else {
      moduleClass = resolved;
    }
    const firstVisit = !classes.has(moduleClass);
    classes.add(moduleClass);
    for (const child of dynamicImports) {
      await visit(child);
    }
    if (firstVisit) {
      for (const child of moduleImportsOf(moduleClass)) {
        await visit(child);
      }
    }
  };

  await visit(root);
  return { classes, dynamics };
}

function findDynamicImport(hostModule: Type<unknown>, moduleClass: Type<unknown>): DynamicModule {
  const dynamic = moduleImportsOf(hostModule).find(
    (entry): entry is DynamicModule => isDynamicModule(entry) && entry.module === moduleClass,
  );
  if (!dynamic) {
    throw new Error(`${hostModule.name} no importa ${moduleClass.name} como módulo dinámico`);
  }
  return dynamic;
}

function findAsyncOptionsProvider(
  hostModule: Type<unknown>,
  moduleClass: Type<unknown>,
  token: unknown,
): AsyncOptionsProvider {
  const dynamic = findDynamicImport(hostModule, moduleClass);
  const provider = (dynamic.providers ?? []).find(
    (candidate): candidate is AsyncOptionsProvider =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      (candidate as { provide: unknown }).provide === token &&
      'useFactory' in candidate,
  );
  if (!provider) {
    throw new Error(`${hostModule.name}: ${moduleClass.name} no registra un provider async de opciones`);
  }
  return provider;
}

function listTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('S7 environment foundation (TC03)', () => {
  const originalEnv = snapshotProcessEnv();
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    restoreProcessEnv(originalEnv);
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function createFixtureRepository() {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's7-env-'));
    temporaryDirectories.push(repositoryRoot);

    const backendDir = path.join(repositoryRoot, 'apps', 'backend');
    fs.mkdirSync(path.join(backendDir, 'src', 'config'), { recursive: true });
    fs.mkdirSync(path.join(backendDir, 'dist', 'config'), { recursive: true });

    const backendEnvPath = path.join(backendDir, '.env');
    const rootEnvPath = path.join(repositoryRoot, '.env');
    fs.writeFileSync(
      backendEnvPath,
      ['S7_TC03_PRECEDENCE=from-backend-file', 'S7_TC03_FILE_ONLY=backend-file-value', ''].join('\n'),
    );
    fs.writeFileSync(
      rootEnvPath,
      ['S7_TC03_PRECEDENCE=from-root-file', 'S7_TC03_ROOT_ONLY=root-file-value', ''].join('\n'),
    );

    return { backendDir, backendEnvPath, rootEnvPath };
  }

  it('TC03-A: BACKEND_ENV_PATH resuelve apps/backend/.env desde src y dist, ignora el .env de la raíz y respeta el entorno ya inyectado', async () => {
    const fixture = createFixtureRepository();
    process.env.NODE_ENV = 'development';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.S7_TC03_PRECEDENCE = 'from-process';
    delete process.env.S7_TC03_FILE_ONLY;
    delete process.env.S7_TC03_ROOT_ONLY;

    // La ruta autoritativa real del módulo es absoluta y termina en apps/backend/.env.
    expect(path.isAbsolute(BACKEND_ENV_PATH)).toBe(true);
    expect(BACKEND_ENV_PATH.endsWith(path.join('apps', 'backend', '.env'))).toBe(true);

    // src/config y dist/config resuelven exactamente el mismo archivo.
    const fromSrc = resolveBackendEnvPath(path.join(fixture.backendDir, 'src', 'config'));
    const fromDist = resolveBackendEnvPath(path.join(fixture.backendDir, 'dist', 'config'));
    expect(fromSrc).toBe(fixture.backendEnvPath);
    expect(fromDist).toBe(fixture.backendEnvPath);

    // Opciones por defecto: un único archivo, módulo global, archivo activo en desarrollo.
    const defaults = buildEnvOptions();
    expect(defaults.isGlobal).toBe(true);
    expect(defaults.envFilePath).toBe(BACKEND_ENV_PATH);
    expect(Array.isArray(defaults.envFilePath)).toBe(false);
    expect(defaults.ignoreEnvFile).toBe(false);
    expect(buildEnvOptions({ nodeEnv: 'production' }).ignoreEnvFile).toBe(true);
    expect(buildEnvOptions({ nodeEnv: 'test' }).ignoreEnvFile).toBe(true);
    expect(buildEnvOptions({ nodeEnv: 'development' }).ignoreEnvFile).toBe(false);

    // Carga real del fixture: el proceso prevalece y la raíz nunca se encadena.
    const fixtureOptions = buildEnvOptions({ envFilePath: fromSrc });
    expect(fixtureOptions.envFilePath).toBe(fixture.backendEnvPath);
    expect(JSON.stringify(fixtureOptions)).not.toContain(fixture.rootEnvPath);

    const logger = captureLogger();
    try {
      await ConfigModule.forRoot(fixtureOptions);
    } finally {
      logger.restore();
    }
    const config = new ConfigService();

    expect(process.env.S7_TC03_PRECEDENCE).toBe('from-process');
    expect(config.get<string>('S7_TC03_PRECEDENCE')).toBe('from-process');
    expect(process.env.S7_TC03_FILE_ONLY).toBe('backend-file-value');
    expect(config.get<string>('S7_TC03_FILE_ONLY')).toBe('backend-file-value');
    expect(process.env.S7_TC03_ROOT_ONLY).toBeUndefined();
    expect(config.get<string>('S7_TC03_ROOT_ONLY')).toBeUndefined();
  });

  it('TC03-B: validateEnvironment deriva disponibilidad de Closure sin emitir valores y permite arrancar el resto del backend', () => {
    const logger = captureLogger();
    try {
      // (1) Entorno completo y válido.
      const complete = validateEnvironment(completeClosureEnvironment());
      expect(complete.closure.disponible).toBe(true);
      expect(complete.closure.deliveryMode).toBe('authenticated');
      expect(complete.closure.prefix).toBe('uvgenius/cierre');
      expect(complete.closure.faltantes).toEqual([]);
      expect(complete.closure.motivos).toEqual([]);
      expect(complete.closure.cloudName).toBe('demo-cloud');
      expect(complete.closure.activeKeyId).toBe('kek-2026-09');
      expect(complete.closure.keyIds).toEqual(['kek-2026-09']);
      expect(complete.app).toEqual({
        nodeEnv: 'development',
        port: 3001,
        frontendUrl: 'http://localhost:3000',
        cookieSecure: false,
        redis: { host: 'localhost', port: 6379 },
      });

      // (2) Sin las tres variables criptográficas: no lanza, solo marca no disponible.
      const {
        CLOSURE_KEKS: _keks,
        CLOSURE_ACTIVE_KEY_ID: _activeKeyId,
        CLOSURE_TICKET_HMAC_SECRET: _hmac,
        ...withoutCryptoSecrets
      } = completeClosureEnvironment();
      const partial = validateEnvironment(withoutCryptoSecrets);
      expect(partial.closure.disponible).toBe(false);
      expect(partial.closure.faltantes).toEqual([
        'CLOSURE_KEKS',
        'CLOSURE_ACTIVE_KEY_ID',
        'CLOSURE_TICKET_HMAC_SECRET',
      ]);
      expect(partial.closure.motivos).toEqual([]);
      expect(partial.closure.deliveryMode).toBe('authenticated');
      expect(partial.app.frontendUrl).toBe('http://localhost:3000');

      // (3) Clave activa inexistente y HMAC igual a una KEK.
      const inconsistent = validateEnvironment({
        ...completeClosureEnvironment(),
        CLOSURE_ACTIVE_KEY_ID: 'kek-inexistente',
        CLOSURE_TICKET_HMAC_SECRET: SYNTHETIC_KEK,
      });
      expect(inconsistent.closure.disponible).toBe(false);
      expect(inconsistent.closure.faltantes).toEqual([]);
      expect(inconsistent.closure.motivos).toEqual(['ACTIVE_KEY_ID_NO_EN_KEKS', 'HMAC_NO_INDEPENDIENTE']);

      // Ningún campo derivado ni ningún argumento del logger contiene material de clave.
      for (const result of [complete, partial, inconsistent]) {
        expect(leakedSecrets(collectStrings(result.closure))).toEqual([]);
        expect(leakedSecrets(collectStrings(result.app))).toEqual([]);
      }
      const loggedText = collectStrings(logger.calls);
      expect(loggedText.length).toBeGreaterThan(0);
      expect(leakedSecrets(loggedText)).toEqual([]);
      expect(loggedText.some((text) => text.includes('CLOSURE_KEKS'))).toBe(true);
      expect(loggedText.some((text) => text.includes('HMAC_NO_INDEPENDIENTE'))).toBe(true);

      // Las validaciones vigentes del backend se conservan con el mismo mensaje.
      const { FRONTEND_URL: _frontendUrl, ...withoutFrontendUrl } = completeClosureEnvironment();
      expect(() => validateEnvironment(withoutFrontendUrl)).toThrow(
        'FRONTEND_URL environment variable is required',
      );
      expect(() => validateEnvironment({ ...completeClosureEnvironment(), FRONTEND_URL: '*' })).toThrow(
        'FRONTEND_URL cannot allow every origin',
      );
      expect(() =>
        validateEnvironment({ ...completeClosureEnvironment(), FRONTEND_URL: 'ftp://example.com' }),
      ).toThrow('FRONTEND_URL must use http or https');
    } finally {
      logger.restore();
    }
  });
  it('TC03-C: CLOSURE_SWEEPER_ADMIN_ID solo acepta un entero positivo y su verificación de administrador ocurre contra la base, no contra el entorno', async () => {
    const logger = captureLogger();
    try {
      const uuid = '8f3c1b2e-4a5d-4c6f-9e7a-1b2c3d4e5f60';

      // Formatos rechazados: cleanup no disponible, documentos intactos, sin lanzar en arranque.
      for (const invalid of [uuid, '0', '-3', '12.5']) {
        const result = validateEnvironment({
          ...completeClosureEnvironment(),
          CLOSURE_SWEEPER_ADMIN_ID: invalid,
        });
        expect(result.closure.disponible).toBe(true);
        expect(result.closure.cleanupDisponible).toBe(false);
        expect(result.closure.sweeperAdminId).toBeNull();
        expect(result.closure.motivosCleanup).toEqual(['SWEEPER_ADMIN_ID_INVALIDO']);
        expect(result.closure.motivos).toEqual([]);
      }

      // Ausente: cleanup no disponible sin afectar la disponibilidad de documentos.
      const absent = validateEnvironment(completeClosureEnvironment());
      expect(absent.closure.disponible).toBe(true);
      expect(absent.closure.cleanupDisponible).toBe(false);
      expect(absent.closure.sweeperAdminId).toBeNull();
      expect(absent.closure.motivosCleanup).toEqual(['SWEEPER_ADMIN_ID_AUSENTE']);

      // "7": el formato valida; la verificación de administrador es responsabilidad de la base.
      const configured = validateEnvironment({
        ...completeClosureEnvironment(),
        CLOSURE_SWEEPER_ADMIN_ID: '7',
      });
      expect(configured.closure.sweeperAdminId).toBe(7);
      expect(configured.closure.cleanupDisponible).toBe(true);
      expect(configured.closure.motivosCleanup).toEqual([]);

      const readerWith = (record: { idUsuario: number } | null) =>
        ({
          usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(record) },
        }) as unknown as SweeperAdminReader;

      const enabledAdmin = readerWith({ idUsuario: 7 });
      await expect(assertSweeperAdmin(enabledAdmin, 7)).resolves.toEqual({ idUsuario: 7 });
      const query = (enabledAdmin.usuarioRolAcceso.findFirst as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { where: Record<string, unknown> };
      expect(query.where).toEqual({
        idUsuario: 7,
        rolAcceso: { nombrePerfil: 'administrador' },
        usuario: { estado: 'ACTIVO' },
      });

      // Usuario sin perfil de administrador (o deshabilitado) e inexistente: 503 sin exponer el valor.
      const notAdmin = readerWith(null);
      const missing = readerWith(null);
      for (const reader of [notAdmin, missing]) {
        const failure = await assertSweeperAdmin(reader, 7).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(ServiceUnavailableException);
        expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
        const message = (failure as ServiceUnavailableException).message;
        expect(message).toContain('CLOSURE_SWEEPER_ADMIN_ID');
        expect(message).not.toContain('7');
      }

      // Con tx, la consulta usa la transacción del caller y no abre otra.
      const txReader = readerWith({ idUsuario: 7 });
      const untouched = readerWith(null);
      await expect(assertSweeperAdmin(untouched, 7, txReader)).resolves.toEqual({ idUsuario: 7 });
      expect(untouched.usuarioRolAcceso.findFirst).not.toHaveBeenCalled();
      expect(txReader.usuarioRolAcceso.findFirst).toHaveBeenCalledTimes(1);

      // Ningún mensaje ni log contiene valores de entorno distintos del nombre de la variable.
      const loggedText = collectStrings(logger.calls);
      expect(loggedText.some((text) => text.includes(uuid))).toBe(false);
      expect(leakedSecrets(loggedText)).toEqual([]);
    } finally {
      logger.restore();
    }
  });
  it('TC03-D: ningún consumidor lee el entorno antes de ConfigModule.forRoot y las factories Jwt/Cache reciben ConfigService', async () => {
    // Arrange: un process.env mínimo válido antes del arranque; con NODE_ENV=test el .env real nunca se lee.
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.JWT_SECRET = 'synthetic-jwt-secret-for-tests';
    process.env.REDIS_HOST = 'redis.test.local';
    process.env.REDIS_PORT = '6380';

    const watchedKeys = new Set(['JWT_SECRET', 'REDIS_HOST', 'REDIS_PORT']);
    const readsBeforeForRoot: string[] = [];
    let forRootStarted = false;
    const originalForRoot = ConfigModule.forRoot;
    const forRootSpy = vi.spyOn(ConfigModule, 'forRoot').mockImplementation((options) => {
      forRootStarted = true;
      return originalForRoot.call(ConfigModule, options);
    });
    const realEnv = process.env;
    process.env = new Proxy(realEnv, {
      get(target, property) {
        if (!forRootStarted && typeof property === 'string' && watchedKeys.has(property)) {
          readsBeforeForRoot.push(property);
        }
        return Reflect.get(target, property);
      },
    });
    const logger = captureLogger();

    // Act: importar el grafo completo de la aplicación con el espía instalado.
    let AppModule: Type<unknown> | undefined;
    let forRootCalls = 0;
    try {
      ({ AppModule } = await import('../src/app.module'));
      forRootCalls = forRootSpy.mock.calls.length;
    } finally {
      process.env = realEnv;
      forRootSpy.mockRestore();
      logger.restore();
    }
    if (!AppModule) {
      throw new Error('AppModule no se pudo importar');
    }

    // Cero lecturas de las claves vigiladas durante la fase de import; una sola carga.
    expect(readsBeforeForRoot).toEqual([]);
    expect(forRootCalls).toBe(1);

    // Exactamente una registración global de ConfigModule en todo el grafo.
    const graph = await collectModuleGraph(AppModule);
    const configRegistrations = graph.dynamics.filter((entry) => entry.module === ConfigModule);
    expect(configRegistrations).toHaveLength(1);
    expect(configRegistrations[0].global).toBe(true);

    const { AuthModule } = await import('../src/auth/auth.module');
    const { AdminModule } = await import('../src/admin/admin.module');
    const { NotificationsModule } = await import('../src/notifications/notifications.module');
    const { ChatModule } = await import('../src/chat/chat.module');
    for (const hostModule of [AuthModule, AdminModule, NotificationsModule, ChatModule]) {
      expect(moduleImportsOf(hostModule).includes(ConfigModule)).toBe(false);
    }

    // Las cinco factories reciben ConfigService y sus valores provienen del validador.
    const validated = validateEnvironment({
      NODE_ENV: 'test',
      FRONTEND_URL: 'http://localhost:3000',
      JWT_SECRET: 'validator-jwt-secret',
      REDIS_HOST: 'redis.validator.local',
      REDIS_PORT: '6390',
      PORT: '4100',
    });
    const configService = new ConfigService(validated);
    expect(configService.get<number>('app.port')).toBe(4100);

    const jwtExpectations: Array<[Type<unknown>, string]> = [
      [AuthModule, '24h'],
      [AdminModule, '24h'],
      [NotificationsModule, '7d'],
      [ChatModule, '7d'],
    ];
    for (const [hostModule, expiresIn] of jwtExpectations) {
      const provider = findAsyncOptionsProvider(hostModule, JwtModule, 'JWT_MODULE_OPTIONS');
      expect(provider.inject).toEqual([ConfigService]);
      expect(await provider.useFactory(configService)).toEqual({
        secret: 'validator-jwt-secret',
        signOptions: { expiresIn },
      });
    }

    const cacheProvider = findAsyncOptionsProvider(AppModule, CacheModule, CACHE_MODULE_OPTIONS);
    expect(cacheProvider.inject).toEqual([ConfigService]);
    const cacheOptions = (await cacheProvider.useFactory(configService)) as Record<string, unknown>;
    expect(cacheOptions).toMatchObject({ host: 'redis.validator.local', port: 6390, ttl: 300 });
    // El store es el namespace de cache-manager-redis-store, igual que antes (bajo vitest puede colgar de `default`).
    const store = cacheOptions.store as { redisStore?: unknown; default?: { redisStore?: unknown } };
    expect(typeof (store.redisStore ?? store.default?.redisStore)).toBe('function');
    expect(findDynamicImport(AppModule, CacheModule).global).toBe(true);

    // main.ts obtiene el puerto vía ConfigService tras NestFactory.create; ningún dotenv paralelo en src/.
    const sourceRoot = path.join(__dirname, '../src');
    const mainSource = fs.readFileSync(path.join(sourceRoot, 'main.ts'), 'utf8');
    const createIndex = mainSource.indexOf('await NestFactory.create(AppModule)');
    const configIndex = mainSource.indexOf('app.get(ConfigService)');
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(configIndex).toBeGreaterThan(createIndex);
    expect(mainSource).toMatch(/configService\.get<number>\('app\.port'/);
    expect(mainSource).not.toContain('process.env.PORT');
    for (const file of listTypeScriptFiles(sourceRoot)) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/dotenv/);
    }
  });

  it('TC03-E: sin configuración válida de Closure las superficies de documentos responden 503 antes de reservar, firmar o subir', async () => {
    // El módulo está REGISTRADO en la aplicación: estar registrado no
    // significa poder operar, y eso es justo lo que se comprueba abajo.
    // `AppModule` se importa perezosamente porque su ConfigModule valida el
    // entorno al evaluarse; el fixture mínimo evita tocar el .env real.
    process.env.FRONTEND_URL ??= 'http://localhost:3000';
    const { AppModule } = await import('../src/app.module');
    expect(moduleImportsOf(AppModule as Type<unknown>)).toContain(StorageModule);
    const providersDeStorage = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StorageModule) ??
      []) as unknown[];
    expect(providersDeStorage).toContain(ClosureTicketService);
    expect(providersDeStorage).toContain(ClosureCryptoService);
    expect(providersDeStorage).toContain(CloudinaryClosureStorageAdapter);

    // Los cuatro motivos de indisponibilidad del contrato, cada uno derivado
    // por el validador real a partir de un entorno sintético.
    const base = {
      FRONTEND_URL: 'http://localhost:3000',
      CLOUDINARY_CLOUD_NAME: 'cuenta',
      CLOUDINARY_API_KEY: '123456789012345',
      CLOUDINARY_API_SECRET: 'secreto-sintetico',
      CLOSURE_KEKS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
      CLOSURE_ACTIVE_KEY_ID: 'k1',
      CLOSURE_TICKET_HMAC_SECRET: Buffer.alloc(32, 9).toString('base64'),
    };
    const escenarios: Array<[string, Record<string, unknown>]> = [
      ['KEKs ausentes', { ...base, CLOSURE_KEKS: undefined }],
      ['activeKeyId fuera del conjunto', { ...base, CLOSURE_ACTIVE_KEY_ID: 'k9' }],
      ['HMAC ausente', { ...base, CLOSURE_TICKET_HMAC_SECRET: undefined }],
      ['credenciales Cloudinary ausentes', { ...base, CLOUDINARY_API_SECRET: undefined }],
    ];

    for (const [escenario, crudo] of escenarios) {
      const validado = validateEnvironment(crudo);
      const closure = validado.closure as ClosureAvailability;
      expect(closure.disponible, escenario).toBe(false);

      // Prisma y el SDK espiados: nada debe llegar a ellos.
      const escrituras = vi.fn();
      const prismaEspia = { documentoCierre: { create: escrituras, update: escrituras } };
      // `StorageModule` declara exactamente estos providers y `AppModule` lo
      // importa; se construyen con el mismo ConfigService que resolvería la
      // inyección, sin añadir una dependencia de testing al backend.
      const configFalso = {
        get: (clave: string) => (validado as Record<string, unknown>)[clave],
      } as unknown as ConfigService;
      const tickets = new ClosureTicketService(configFalso);
      const crypto = new ClosureCryptoService(configFalso);
      const adaptador = new CloudinaryClosureStorageAdapter(configFalso);
      const uploadEspia = vi.spyOn(
        adaptador as unknown as { uploadStream: (...args: unknown[]) => Promise<unknown> },
        'uploadStream' as never,
      );

      const identidad = {
        proveedor: 'cloudinary' as const,
        cloudName: 'cuenta',
        publicId: 'uvgenius/cierre/41/0b6f0f2c-6a1a-4f0e-9d1a-3f0f7f1c9a11.enc',
        resourceType: 'raw' as const,
        deliveryType: 'authenticated' as const,
      };
      const firmados = {
        publicId: identidad.publicId,
        timestamp: 1,
        type: 'authenticated' as const,
        overwrite: false as const,
        signature: 'x',
        apiKey: 'y',
      };
      const contextoAad = {
        projectId: 41,
        documentId: 900,
        publicId: identidad.publicId,
        tipoDocumento: 'INFORME_AUTOMATICO',
      };

      // Las cinco operaciones que necesitan almacenamiento.
      const operaciones: Array<[string, () => unknown]> = [
        ['reserva', () => tickets.assertAvailable()],
        [
          'firma de ticket',
          () =>
            tickets.sign({
              purpose: 'upload',
              documentId: 900,
              projectId: 41,
              revisionId: 12,
              actorId: 7,
            }),
        ],
        ['upload', () => adaptador.uploadImmutable(identidad, Buffer.from('x'), firmados)],
        ['lectura de contenido', () => adaptador.readCiphertext(identidad, 1000)],
        ['generación de informe', () => crypto.seal(Buffer.from('%PDF-1.7\n'), contextoAad)],
      ];

      for (const [nombre, ejecutar] of operaciones) {
        let fallo: unknown;
        try {
          await ejecutar();
        } catch (error) {
          fallo = error;
        }
        const etiqueta = `${escenario} / ${nombre}`;
        expect(fallo, etiqueta).toBeInstanceOf(ServiceUnavailableException);
        const cuerpo = (fallo as ServiceUnavailableException).getResponse() as {
          statusCode: number;
          code: string;
          faltantes?: string[];
          motivos?: string[];
        };
        expect((fallo as ServiceUnavailableException).getStatus(), etiqueta).toBe(503);
        expect(cuerpo.code, etiqueta).toBe(CLOSURE_NOT_CONFIGURED_CODE);
        // El diagnóstico nombra variables y motivos, nunca valores.
        const serializado = JSON.stringify(cuerpo);
        for (const valor of Object.values(base)) {
          expect(serializado, etiqueta).not.toContain(String(valor));
        }
      }

      // Ni una fila escrita, ni una llamada al SDK, ni una clave inventada.
      expect(escrituras, escenario).not.toHaveBeenCalled();
      expect(uploadEspia, escenario).not.toHaveBeenCalled();
      expect(prismaEspia.documentoCierre.create).not.toHaveBeenCalled();
      expect(closure.activeKeyId === 'k9' || closure.keyIds.length <= 1).toBe(true);

      // Lo que NO necesita almacenamiento sigue funcionando: el render del
      // informe y la lectura de metadata autorizada no se bloquean.
      const render = new ProjectClosureReportService().render(
        projectClosureModel({
          proyecto: {
            idProyecto: 41,
            tituloProyecto: 'Proyecto',
            descripcionProyecto: null,
            objetivos: null,
            tipoProyecto: 'ACADEMICO_HORAS_BECA',
            modalidad: null,
            ubicacion: null,
            contexto: null,
            recursoExterno: null,
            fechaInicio: null,
            fechaFin: null,
            estadoProyecto: 'EN_PROGRESO',
          },
          lider: { idUsuario: 7, nombre: 'Ana', apellido: 'L\u00f3pez' },
          liderazgo: [],
          sprintsCerrados: [],
          hitos: [],
          tareas: [],
          participaciones: [],
          propuestasPorParticipante: [],
          totales: { horasReportadas: '0.00', horasLegacy: '0.00', horasPropuestas: '0.00', tareasDistintas: 0 },
        }),
        buildReportContext({
          cicloRevisionOrigenId: 12,
          presentacion: { usuarios: [], catalogos: [] },
          variante: 'AUTOMATICO',
          fechaGeneracion: '2026-09-06T12:00:00.000Z',
        }),
      );
      expect(render.pdf.subarray(0, 5).toString('utf8'), escenario).toBe('%PDF-');

      // Lectura de metadata no secreta autorizada: nombre de cuenta, prefijo y
      // modalidad viajan; ninguna clave lo hace.
      expect(closure.prefix).toBe('uvgenius/cierre');
      expect(JSON.stringify(closure)).not.toContain(base.CLOSURE_TICKET_HMAC_SECRET);
      expect(JSON.stringify(closure)).not.toContain(Buffer.alloc(32, 1).toString('base64'));

      uploadEspia.mockRestore();
    }
  });
});
