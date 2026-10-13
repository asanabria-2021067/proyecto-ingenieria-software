import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realtimeBaseUrl } from '../lib/realtime/socket-url';

/**
 * GPI01-C01 (H-01). Las `NEXT_PUBLIC_*` se hornean al compilar: definirlas solo
 * en el entorno del contenedor no cambia el bundle. El compose local debe
 * pasar la URL del backend como argumento de build; sin él la imagen queda en
 * la variante same-origin y el navegador abre el socket contra :3000, donde la
 * pila local no tiene nginx que reenvíe /socket.io.
 */

const REPO = join(__dirname, '../../..');
const read = (file: string) => readFileSync(join(REPO, file), 'utf8');

/** Bloque `frontend:` del compose raíz (hasta el siguiente servicio o sección). */
function frontendService(compose: string): string {
  const start = compose.indexOf('\n  frontend:');
  expect(start, 'servicio frontend').toBeGreaterThan(-1);
  const rest = compose.slice(start + 1);
  const end = rest.search(/\n(?: {2})?[a-z][\w-]*:\s*\n/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('GPI01-C01: la imagen local hornea la URL del backend', () => {
  const frontend = frontendService(read('docker-compose.yml'));

  it('el build del frontend recibe NEXT_PUBLIC_API_URL como argumento', () => {
    expect(frontend).toMatch(/build:\n(?:.*\n)*?\s+args:\n(?:.*\n)*?\s+NEXT_PUBLIC_API_URL: /);
  });

  it('el default es el backend publicado en el host y solo aplica si la variable no existe', () => {
    // `-` y no `:-`: una variable definida vacía sigue eligiendo same-origin (nginx).
    expect(frontend).toContain('NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL-http://localhost:3001}');
  });

  it('el Dockerfile consume el argumento en la etapa que compila', () => {
    const dockerfile = read('apps/frontend/Dockerfile');
    const build = dockerfile.slice(dockerfile.indexOf('AS build'), dockerfile.indexOf('AS production'));
    expect(build).toMatch(/ARG NEXT_PUBLIC_API_URL\n/);
    expect(build).toContain('ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL');
    expect(build.indexOf('ENV NEXT_PUBLIC_API_URL')).toBeLessThan(build.indexOf('RUN npm run build'));
  });

  it('producción no compila con este compose: el deploy usa imágenes ya construidas', () => {
    const deploy = read('.github/workflows/deploy.yml');
    expect(deploy).toMatch(/docker compose --profile app up -d [^\n]*--no-build/);
    expect(deploy).not.toMatch(/docker compose[^\n]* build\b/);
  });
});

describe('GPI01-C01: resolución del socket en la pila local', () => {
  const page = { origin: 'http://localhost:3000', protocol: 'http:' };

  it('con la URL horneada el socket va al backend, no al puerto del frontend', () => {
    expect(realtimeBaseUrl('http://localhost:3001', page)).toBe('ws://localhost:3001');
  });

  it('horneada vacía (same-origin detrás de nginx) sigue usando el origen de la página', () => {
    expect(realtimeBaseUrl('', { origin: 'https://uvgenius.example', protocol: 'https:' })).toBe(
      'https://uvgenius.example',
    );
  });
});
