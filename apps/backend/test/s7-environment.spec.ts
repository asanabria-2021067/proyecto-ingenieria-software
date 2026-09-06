import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BACKEND_ENV_PATH, buildEnvOptions, resolveBackendEnvPath } from '../src/config/env.options';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  assertSweeperAdmin,
  validateEnvironment,
  type SweeperAdminReader,
} from '../src/config/environment.validation';

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
});
