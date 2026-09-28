import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkflow } from './helpers/workflow-yaml';

/**
 * T-128 (IESUC-286). Lee los archivos de Compose versionados como texto
 * (mismo estilo que labels.controller.spec.ts: fuente real, no un parser
 * YAML completo) y falla si algún servicio publica un puerto en todas las
 * interfaces (forma corta "HOST:CONTAINER" o forma larga sin loopback
 * explícito) fuera de la lista explícitamente permitida (3000 y 3001,
 * frontend/backend detrás del reverse proxy). Bloquea la regresión de
 * IESUC-286: postgres/pgadmin/redis expuestos sin restricción.
 */

const REPO_ROOT = join(__dirname, '../../..');

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.dev.yml',
  'docker-compose.example.yml',
  'apps/backend/docker-compose.yml',
  'apps/backend/docker-compose.example.yml',
].map((relativePath) => ({
  relativePath,
  // Los archivos del repo usan CRLF en Windows; se normaliza a LF para que
  // las anclas "\n" de las expresiones regulares de abajo funcionen igual
  // sin importar en qué sistema operativo se haya hecho el checkout.
  source: readFileSync(join(REPO_ROOT, relativePath), 'utf-8').replace(/\r\n/g, '\n'),
}));

const EXPLICITLY_ALLOWED_CONTAINER_PORTS = new Set(['3000', '3001']);

interface PortMapping {
  service: string;
  raw: string;
}

/**
 * Extrae, por servicio, cada línea `- "..."` dentro de un bloque `ports:`.
 * Los archivos de Compose de este repo usan 2 espacios para el nombre del
 * servicio y 4 para sus claves (`ports:`, `environment:`, etc.), así que el
 * bloque de un servicio termina en la siguiente línea con esa misma
 * indentación de 2 espacios (o fin de archivo).
 */
function extractPortMappings(source: string): PortMapping[] {
  const serviceBlocks = [...source.matchAll(/\n {2}(\w+):\n([\s\S]*?)(?=\n {2}\w+:|\nvolumes:\n|\nnetworks:\n|$)/g)];
  const mappings: PortMapping[] = [];

  for (const [, service, block] of serviceBlocks) {
    const portsSection = block.match(/ {4}ports:\n([\s\S]*?)(?=\n {4}\w|\n {2}\w|$)/);
    if (!portsSection) continue;

    for (const line of [...portsSection[1].matchAll(/-\s*"([^"]+)"/g)]) {
      mappings.push({ service, raw: line[1] });
    }
  }

  return mappings;
}

/**
 * No se parte `raw` por ":" ingenuamente: la forma larga puede llevar una
 * variable de entorno con valor por defecto (`${DB_PORT:-5432}`), que
 * contiene su propio ":" dentro de las llaves. Basta con el prefijo
 * literal para saber que el host-bind es loopback, sea cual sea el resto.
 */
function isLoopbackRestricted(raw: string): boolean {
  return raw.startsWith('127.0.0.1:');
}

function containerPortOf(raw: string): string {
  const match = raw.match(/(\d+)(?:\/\w+)?$/);
  return match ? match[1] : '';
}

describe('Puertos publicados en docker-compose — solo loopback o allowlist explícita', () => {
  for (const { relativePath, source } of COMPOSE_FILES) {
    const mappings = extractPortMappings(source);

    it(`${relativePath}: cada puerto publicado está restringido a 127.0.0.1 o es 3000/3001`, () => {
      const violaciones = mappings.filter(
        (m) => !isLoopbackRestricted(m.raw) && !EXPLICITLY_ALLOWED_CONTAINER_PORTS.has(containerPortOf(m.raw)),
      );

      expect(violaciones).toEqual([]);
    });
  }

  it('postgres, pgadmin y redis nunca aparecen con un mapeo de puerto sin restringir a loopback', () => {
    const serviciosInternos = new Set(['postgres', 'pgadmin', 'redis']);

    for (const { relativePath, source } of COMPOSE_FILES) {
      const mappings = extractPortMappings(source).filter((m) => serviciosInternos.has(m.service));

      for (const mapping of mappings) {
        expect(
          isLoopbackRestricted(mapping.raw),
          `${relativePath}: ${mapping.service} publica "${mapping.raw}" sin restringir a loopback`,
        ).toBe(true);
      }
    }
  });

  it('al menos un archivo define el mapeo de postgres restringido a loopback (evita un test vacío que siempre pase)', () => {
    const backendCompose = COMPOSE_FILES.find((f) => f.relativePath === 'apps/backend/docker-compose.yml')!;
    const mappings = extractPortMappings(backendCompose.source).filter((m) => m.service === 'postgres');

    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings.every((m) => isLoopbackRestricted(m.raw))).toBe(true);
  });
});

/**
 * G04-C10 (OWASP25-C021 + P5/T19). Resuelve `${VAR:-default}` como Compose
 * (valor definido y no vacío, o el default). Suficiente para las líneas de
 * `ports:` de este repo; la verificación con `docker compose config` real
 * queda en la evidencia del gate.
 */
export function resolveComposeValue(raw: string, env: Record<string, string | undefined>): string {
  return raw.replace(/\$\{(\w+):-([^}]*)\}/g, (_match, name: string, fallback: string) => {
    const value = env[name];
    return value !== undefined && value !== '' ? value : fallback;
  });
}

describe('G04-C10: binds de backend/frontend parametrizados', () => {
  const root = COMPOSE_FILES.find((f) => f.relativePath === 'docker-compose.yml')!;
  const mappingOf = (service: string) => extractPortMappings(root.source).filter((m) => m.service === service);

  it('backend y frontend publican su puerto con BACKEND_BIND / FRONTEND_BIND y default 0.0.0.0', () => {
    expect(mappingOf('backend').map((m) => m.raw)).toEqual(['${BACKEND_BIND:-0.0.0.0}:3001:3001']);
    expect(mappingOf('frontend').map((m) => m.raw)).toEqual(['${FRONTEND_BIND:-0.0.0.0}:3000:3000']);
  });

  it('sin variables (o vacías) se conserva la exposición actual en todas las interfaces', () => {
    for (const env of [{}, { BACKEND_BIND: '', FRONTEND_BIND: '' }]) {
      expect(mappingOf('backend').map((m) => resolveComposeValue(m.raw, env))).toEqual(['0.0.0.0:3001:3001']);
      expect(mappingOf('frontend').map((m) => resolveComposeValue(m.raw, env))).toEqual(['0.0.0.0:3000:3000']);
    }
  });

  it('la variante 127.0.0.1 deja ambos servicios solo en loopback', () => {
    const env = { BACKEND_BIND: '127.0.0.1', FRONTEND_BIND: '127.0.0.1' };
    for (const service of ['backend', 'frontend']) {
      const resolved = mappingOf(service).map((m) => resolveComposeValue(m.raw, env));
      expect(resolved.every(isLoopbackRestricted), service).toBe(true);
    }
  });

  describe('deploy: flags con default actual y valores acotados', () => {
    const step = loadWorkflow('deploy.yml').jobs.deploy.steps?.find((s) => s.name === 'Transferir .env de produccion por stdin');

    it('los flags existen con default 0.0.0.0 y se escriben en el .env', () => {
      expect(step?.env?.BACKEND_BIND).toBe("${{ vars.BACKEND_BIND || '0.0.0.0' }}");
      expect(step?.env?.FRONTEND_BIND).toBe("${{ vars.FRONTEND_BIND || '0.0.0.0' }}");
      expect(step?.run).toContain(`printf 'BACKEND_BIND=%s\\n' "$BACKEND_BIND"`);
      expect(step?.run).toContain(`printf 'FRONTEND_BIND=%s\\n' "$FRONTEND_BIND"`);
    });

    it.each([
      ['BACKEND_BIND', '192.168.1.10'],
      ['FRONTEND_BIND', '0.0.0.0:80'],
      ['BACKEND_BIND', '127.0.0.1; rm -rf /'],
    ])('rechaza %s=%s antes de escribir el .env', (name, value) => {
      const runnerTemp = mkdtempSync(join(tmpdir(), 'g04-bind-'));
      try {
        const env: Record<string, string> = { PATH: process.env.PATH ?? '', RUNNER_TEMP: runnerTemp };
        for (const key of Object.keys(step?.env ?? {})) {
          env[key] = `synthetic-${key.toLowerCase()}`;
        }
        // G06-C07: COOKIE_SECURE también se valida en el paso; recibe su default.
        Object.assign(env, { TRUST_PROXY_HOPS: '0', COOKIE_SECURE: 'false', BACKEND_BIND: '0.0.0.0', FRONTEND_BIND: '0.0.0.0', [name]: value });
        const result = spawnSync('bash', ['-c', step?.run ?? 'exit 99'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('solo admiten 0.0.0.0 o 127.0.0.1');
        expect(spawnSync('test', ['-e', join(runnerTemp, 'deploy-env')]).status).not.toBe(0);
      } finally {
        rmSync(runnerTemp, { recursive: true, force: true });
      }
    });

    it('ningún test exige que producción ya use loopback: el default versionado sigue siendo 0.0.0.0', () => {
      expect(readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8')).toMatch(/^BACKEND_BIND=0\.0\.0\.0$/m);
      expect(readFileSync(join(REPO_ROOT, '.env.example'), 'utf-8')).toMatch(/^FRONTEND_BIND=0\.0\.0\.0$/m);
    });
  });
});
