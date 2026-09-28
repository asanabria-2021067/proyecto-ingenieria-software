import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readRepoFile } from './helpers/workflow-yaml';
// Comparador sin dependencias que también usa el operador desde la raíz del repo.
import { compareSite, EXCLUSION_MARKER } from '../../../infra/nginx/compare-live.mjs';

/**
 * G02-C16 · OWASP25-C047. El nginx de producción queda versionado sin cambios
 * de comportamiento: nginx.conf verbatim y el site de UVG Collab saneado solo
 * con exclusiones declaradas (locations de otros proyectos del host). Los
 * fixtures demuestran que el comparador falla ante cualquier diferencia no
 * declarada, incluido adelantar P1.
 */

interface ManifestEntry {
  path: string;
  liveSha256: string;
  versionedSha256: string;
  mode: 'verbatim' | 'sanitized';
  excludedLocations?: string[];
  excludedComments?: string[];
}

const manifest = JSON.parse(readRepoFile('infra/nginx/manifest.json')) as { files: ManifestEntry[] };
const entry = (mode: ManifestEntry['mode']) => {
  const found = manifest.files.find((file) => file.mode === mode);
  if (!found) {
    throw new Error(`Sin entrada ${mode} en manifest.json`);
  }
  return found;
};
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const site = entry('sanitized');
const SITE = readRepoFile(`infra/nginx/${site.path}`);
const exclusions = { excludedLocations: site.excludedLocations ?? [], excludedComments: site.excludedComments ?? [] };

/** Reconstruye un "site vivo" sintético: el marcador vuelve a ser locations de otros proyectos. */
function liveFixture(versioned: string): string {
  const foreign = [
    '    # Archivos estáticos de estudiantes',
    ...exclusions.excludedLocations.flatMap((path) => [
      `    location ${path} {`,
      '        root /var/www/synthetic;',
      '    }',
      '',
    ]),
  ];
  const lines = versioned.split('\n');
  const start = lines.findIndex((line) => line.includes('[G02-C16]'));
  const end = lines.findIndex((line) => line.includes(EXCLUSION_MARKER));
  return [...lines.slice(0, start), ...foreign, ...lines.slice(end + 1)].join('\n');
}

describe('G02-C16: baseline nginx versionado', () => {
  it('los hashes registrados son los del baseline productivo del plan', () => {
    expect(entry('verbatim').liveSha256).toBe('48c6a4ec1e1fd28ccf968490f07e34a1d7f755793b2108a3ed8670b1ee2a0aa2');
    expect(site.liveSha256).toBe('ea10d072d3bf5ea4710000d4cf311b7fcd4ed4b1b4dfeb055eb2c46733b80148');
  });

  it('cada archivo versionado coincide con su SHA-256 del manifiesto; nginx.conf es verbatim', () => {
    for (const file of manifest.files) {
      expect(sha256(readRepoFile(`infra/nginx/${file.path}`)), file.path).toBe(file.versionedSha256);
    }
    expect(entry('verbatim').versionedSha256).toBe(entry('verbatim').liveSha256);
  });

  it('el site versionado contiene solo los locations del proyecto y ninguno ajeno', () => {
    const locations = [...SITE.matchAll(/^\s*location\s+(\S+)\s*\{/gm)].map((match) => match[1]);
    // G04-C11 añade /socket.io/ (P1).
    expect(locations).toEqual(['/.well-known/acme-challenge/', '/', '/socket.io/', '/api']);
    for (const excluded of exclusions.excludedLocations) {
      expect(SITE).not.toContain(`location ${excluded}`);
    }
    expect(SITE).toContain(`${EXCLUSION_MARKER} ${exclusions.excludedLocations.join(' ')}`);
  });

  /**
   * Prueba tipo B (G04-C11 · P1/T13). Antes exigía que el site NO tuviera
   * /socket.io/ y que los upstreams fueran `localhost`: era el contrato de
   * "baseline sin adelantar P1" de G02. G04 versiona P1 a propósito; lo que
   * sigue exigiéndose es que P1 sea aditivo (sin redirect, HSTS ni cambios de
   * TLS) y que el manifiesto declare que aún no está aplicado en la VM.
   */
  it('G04-C11: P1 versionado y aditivo, pendiente de aplicar en producción', () => {
    const socket = /location \/socket\.io\/ \{([\s\S]*?)\n {4}\}/.exec(SITE)?.[1] ?? '';
    expect(socket).toContain('proxy_pass http://127.0.0.1:3001;');
    expect(socket).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(socket).toContain("proxy_set_header Connection 'upgrade';");
    expect(Number(/proxy_read_timeout (\d+)s;/.exec(socket)?.[1])).toBeGreaterThanOrEqual(60);
    expect(SITE).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(SITE).not.toContain('proxy_pass http://localhost');
    expect(SITE).toContain('listen 443 ssl;');
    expect(SITE).not.toMatch(/add_header|return 301/);
    const pending = (manifest as unknown as { pendingLiveChanges?: Array<{ gate: string; appliedInProduction: boolean }> })
      .pendingLiveChanges;
    expect(pending).toEqual([expect.objectContaining({ gate: 'G04-C11', appliedInProduction: false })]);
  });

  it('G04-C11: contra la configuración viva previa a P1, el comparador reporta la diferencia (no la esconde)', () => {
    const prePrevio = liveFixture(SITE)
      .replace(/\n {4}# \[G04-C11\][\s\S]*?location \/socket\.io\/ \{[\s\S]*?\n {4}\}\n/, '\n')
      .replaceAll('http://127.0.0.1:', 'http://localhost:');
    expect(prePrevio).not.toContain('socket.io');
    expect(compareSite(prePrevio, SITE, exclusions).length).toBeGreaterThan(0);
  });

  it('el comparador acepta un site vivo que solo difiere por las exclusiones declaradas', () => {
    expect(compareSite(liveFixture(SITE), SITE, exclusions)).toEqual([]);
  });

  describe('fixtures negativos: diferencias no declaradas', () => {
    it('un location nuevo no declarado', () => {
      const live = liveFixture(SITE).replace('    # Backend API', '    location /extra/ {\n        return 200;\n    }\n\n    # Backend API');
      expect(compareSite(live, SITE, exclusions).length).toBeGreaterThan(0);
    });

    it('un upstream cambiado', () => {
      const live = liveFixture(SITE).replace('proxy_pass http://127.0.0.1:3001;', 'proxy_pass http://localhost:3001;');
      expect(compareSite(live, SITE, exclusions).length).toBeGreaterThan(0);
    });

    it('un segundo /socket.io/ aplicado en vivo sin versionar', () => {
      const live = liveFixture(SITE).replace(
        '    # Backend API',
        '    location /socket.io/ {\n        proxy_pass http://localhost:3001;\n    }\n\n    # Backend API',
      );
      expect(compareSite(live, SITE, exclusions).length).toBeGreaterThan(0);
    });

    it('una cabecera añadida a nivel server', () => {
      const live = liveFixture(SITE).replace('    listen 80;', '    listen 80;\n    add_header X-Frame-Options DENY;');
      expect(compareSite(live, SITE, exclusions).length).toBeGreaterThan(0);
    });
  });
});
