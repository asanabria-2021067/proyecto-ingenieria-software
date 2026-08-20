import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
