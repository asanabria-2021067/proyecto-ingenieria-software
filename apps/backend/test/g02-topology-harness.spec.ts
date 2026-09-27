import { describe, expect, it } from 'vitest';
import { readRepoFile, parseWorkflow } from './helpers/workflow-yaml';
// Scripts sin dependencias del arnés (infra/staging), también usados por CI.
import {
  checkAll,
  loadSubstitutions,
  representativityFindings,
} from '../../../infra/staging/check-representativity.mjs';
import { assertLocalHost, CHECKS, EXPECTED_HSTS } from '../../../infra/staging/characterize.mjs';

/**
 * G02-C17 · D4 + OWASP25-C043/C047. Arnés efímero de topología: su nginx solo
 * difiere del baseline productivo por sustituciones declaradas, se construye
 * con los Dockerfiles de producción y no puede alcanzar producción. La
 * ejecución completa (docker) la hace run-harness.sh (local y CI, G02-C18).
 */

interface ComposeService {
  image?: string;
  build?: { context: string; dockerfile: string; args?: Record<string, string> };
  ports?: string[];
  environment?: Record<string, string>;
}

const compose = parseWorkflow(
  // parseWorkflow exige `jobs`; el compose se valida como YAML con un envoltorio mínimo.
  `jobs: {}\n${readRepoFile('infra/staging/docker-compose.yml')}`,
) as unknown as { services: Record<string, ComposeService> };

describe('G02-C17: guard de representatividad', () => {
  it('la configuración nginx del arnés solo difiere del baseline por las sustituciones declaradas', () => {
    expect(checkAll()).toEqual([]);
  });

  it('las sustituciones son mínimas y todas de entorno (usuario, TLS y upstreams)', () => {
    const substitutions = loadSubstitutions() as Array<{ from: string; to: string; reason: string }>;
    expect(substitutions).toHaveLength(5);
    for (const substitution of substitutions) {
      expect(substitution.reason.length).toBeGreaterThan(10);
      expect(substitution.to).toMatch(/^(user nginx;|\s+ssl_certificate(_key)? \/etc\/nginx\/harness-tls\/|\s+proxy_pass http:\/\/(frontend|backend):300[01];)/);
    }
  });

  describe('fixtures negativos', () => {
    const baseline = readRepoFile('infra/nginx/sites-enabled/uvg-collab');
    const harness = readRepoFile('infra/staging/nginx/sites-enabled/uvg-collab');
    const subs = loadSubstitutions();
    const check = (text: string) => representativityFindings('sites-enabled/uvg-collab', text, baseline, subs);

    it('el arnés real es representativo', () => {
      expect(check(harness)).toEqual([]);
    });

    it('una cabecera añadida solo en el arnés', () => {
      expect(check(harness.replace('    listen 80;', '    listen 80;\n    add_header X-Test 1;')).length).toBeGreaterThan(0);
    });

    it('un location nuevo solo en el arnés', () => {
      const drifted = harness.replace('    # Backend API', '    location /socket.io/ {\n        return 200;\n    }\n\n    # Backend API');
      expect(check(drifted).length).toBeGreaterThan(0);
    });

    it('una sustitución que no se aplicó (upstream productivo en el arnés)', () => {
      expect(check(harness.replace('http://backend:3001', 'http://localhost:3001'))).toEqual(
        expect.arrayContaining([expect.stringContaining('sustitucion no aplicada')]),
      );
    });
  });
});

describe('G02-C17: contrato del arnés', () => {
  it('backend y frontend se construyen con los Dockerfiles de producción; PostgreSQL 17 y Redis 7', () => {
    expect(compose.services.backend.build).toMatchObject({ context: '../../apps/backend', dockerfile: 'Dockerfile' });
    expect(compose.services.frontend.build).toMatchObject({ context: '../../apps/frontend', dockerfile: 'Dockerfile' });
    expect(compose.services.postgres.image).toBe('postgres:17-alpine');
    expect(compose.services.redis.image).toBe('redis:7-alpine');
    expect(compose.services.nginx.image).toMatch(/^nginx:[0-9.]+-alpine$/);
  });

  it('solo nginx publica puertos y únicamente en 127.0.0.1', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      if (name === 'nginx') {
        for (const port of service.ports ?? []) {
          expect(port).toMatch(/^127\.0\.0\.1:/);
        }
      } else {
        expect(service.ports, name).toBeUndefined();
      }
    }
  });

  it('sin secretos, hosts ni datos productivos', () => {
    const text = readRepoFile('infra/staging/docker-compose.yml');
    expect(text).not.toMatch(/158\.23\.57\.118|nip\.io|secrets\.|\$\{\{/);
    expect(text).not.toMatch(/db seed|seed\.ts/);
    const jwt = compose.services.backend.environment?.JWT_SECRET ?? '';
    expect(jwt).toMatch(/synthetic/);
    expect(jwt.length).toBeGreaterThanOrEqual(32);
  });

  it('el script de ciclo de vida destruye todo al terminar', () => {
    const script = readRepoFile('infra/staging/run-harness.sh');
    expect(script).toContain('trap cleanup EXIT');
    expect(script).toContain('down -v --remove-orphans --rmi local');
    expect(script).toContain('node check-representativity.mjs');
    expect(script.indexOf('node check-representativity.mjs')).toBeLessThan(script.indexOf('docker compose'));
  });

  it('la caracterización cubre la línea base exigida y rechaza hosts no locales', () => {
    expect(CHECKS.map((check: { id: string }) => check.id)).toEqual(['HARN-01', 'HARN-02', 'HARN-03', 'HARN-04', 'HARN-05']);
    expect(EXPECTED_HSTS).toBe('max-age=31536000; includeSubDomains');
    expect(() => assertLocalHost('127.0.0.1')).not.toThrow();
    for (const host of ['158.23.57.118', '158.23.57.118.nip.io', 'example.com']) {
      expect(() => assertLocalHost(host)).toThrow();
    }
  });
});
