import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BACKEND_ENV_PATH, buildEnvOptions, resolveBackendEnvPath } from '../src/config/env.options';

/**
 * TC03 — foundation única de environment (06 v2 §51.1 y §47). Cada caso usa
 * fixtures sintéticos en un directorio temporal: nunca lee ni escribe el
 * apps/backend/.env real y no expone ningún secreto.
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

  it('TC03-A: BACKEND_ENV_PATH resuelve apps/backend/.env desde src y dist, ignora el .env de la raíz y respeta el entorno ya inyectado', () => {
    const fixture = createFixtureRepository();
    process.env.NODE_ENV = 'development';
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

    ConfigModule.forRoot(fixtureOptions);
    const config = new ConfigService();

    expect(process.env.S7_TC03_PRECEDENCE).toBe('from-process');
    expect(config.get<string>('S7_TC03_PRECEDENCE')).toBe('from-process');
    expect(process.env.S7_TC03_FILE_ONLY).toBe('backend-file-value');
    expect(config.get<string>('S7_TC03_FILE_ONLY')).toBe('backend-file-value');
    expect(process.env.S7_TC03_ROOT_ONLY).toBeUndefined();
    expect(config.get<string>('S7_TC03_ROOT_ONLY')).toBeUndefined();
  });
});
