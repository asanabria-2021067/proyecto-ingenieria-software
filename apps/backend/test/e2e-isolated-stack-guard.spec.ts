import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * GPI01-C12. La pila E2E aislada (scripts/e2e/isolated-stack.sh) ejecuta
 * migraciones, seed y flujos que escriben. Estas pruebas fijan que falla
 * CERRADO: ninguna URL que no sea exactamente la base desechable pasa la
 * guardia, todo paso que escribe la invoca antes, y el desmontaje solo alcanza
 * lo que el propio script creó. Ninguna prueba toca Docker ni una base real.
 */

const REPO = join(__dirname, '../../..');
const SCRIPT = join(REPO, 'scripts/e2e/isolated-stack.sh');
const ASSERT = join(REPO, 'scripts/e2e/assert-isolated-database.mjs');
const source = readFileSync(SCRIPT, 'utf8');

const PORT = '55432';
const NAME = 'uvg_e2e_isolated';
const url = (host: string, port: string, name: string, protocol = 'postgresql') =>
  `${protocol}://e2e:synthetic@${host}:${port}/${name}?schema=public`;

type Problems = (rawUrl: string | undefined, port: string | undefined, name: string | undefined) => string[];
const cargar = async () =>
  ((await import(pathToFileURL(ASSERT).href)) as { isolatedDatabaseProblems: Problems; PROTECTED_PORTS: string[] });

/** Cuerpo de una función `nombre() { ... }` del script. */
function funcion(nombre: string): string {
  const inicio = source.indexOf(`\n${nombre}() {`);
  expect(inicio, nombre).toBeGreaterThan(-1);
  return source.slice(inicio, source.indexOf('\n}\n', inicio));
}

describe('GPI01-C12: assert-isolated-database (función)', () => {
  it('acepta únicamente la base desechable en loopback y en su puerto', async () => {
    const { isolatedDatabaseProblems } = await cargar();
    expect(isolatedDatabaseProblems(url('127.0.0.1', PORT, NAME), PORT, NAME)).toEqual([]);
    expect(isolatedDatabaseProblems(url('localhost', PORT, NAME), PORT, NAME)).toEqual([]);
  });

  it.each([
    ['la base de desarrollo publicada en 5433', url('127.0.0.1', '5433', 'uvg_collab')],
    ['el puerto de desarrollo aunque el nombre coincida', url('127.0.0.1', '5433', NAME)],
    ['el puerto estándar de PostgreSQL', url('127.0.0.1', '5432', NAME)],
    ['la base de integración histórica (5456)', url('127.0.0.1', '5456', NAME)],
    ['un host remoto', url('db.produccion.example', PORT, NAME)],
    ['el servicio postgres de la red de compose', url('postgres', '5432', 'uvg_collab')],
    ['otro nombre de base en el puerto correcto', url('127.0.0.1', PORT, 'uvg_collab')],
    ['un nombre que solo empieza igual', url('127.0.0.1', PORT, `${NAME}-prod`)],
    ['una URL sin puerto', `postgresql://e2e:synthetic@127.0.0.1/${NAME}`],
    ['otro motor', url('127.0.0.1', PORT, NAME, 'mysql')],
    ['una cadena que no es URL', 'no-es-una-url'],
    ['una cadena vacía', ''],
  ])('rechaza %s', async (_caso, candidata) => {
    const { isolatedDatabaseProblems } = await cargar();
    expect(isolatedDatabaseProblems(candidata, PORT, NAME).length).toBeGreaterThan(0);
  });

  it('sin puerto o nombre esperados no acepta nada (no hay valores por defecto permisivos)', async () => {
    const { isolatedDatabaseProblems } = await cargar();
    const buena = url('127.0.0.1', PORT, NAME);
    expect(isolatedDatabaseProblems(buena, undefined, NAME).length).toBeGreaterThan(0);
    expect(isolatedDatabaseProblems(buena, PORT, undefined).length).toBeGreaterThan(0);
    expect(isolatedDatabaseProblems(undefined, PORT, NAME).length).toBeGreaterThan(0);
  });

  it('los puertos de las bases con datos reales están protegidos', async () => {
    const { PROTECTED_PORTS } = await cargar();
    expect(PROTECTED_PORTS).toEqual(expect.arrayContaining(['5432', '5433', '5456']));
  });
});

describe('GPI01-C12: assert-isolated-database (línea de comandos)', () => {
  const run = (...args: string[]) => spawnSync('node', [ASSERT, ...args], { encoding: 'utf8' });

  it('termina con 0 para la base desechable', () => {
    expect(run(url('127.0.0.1', PORT, NAME), PORT, NAME).status).toBe(0);
  });

  it('termina con 1 para la base de desarrollo y nunca imprime la URL ni sus credenciales', () => {
    const result = run('postgresql://postgres:un-secreto-real@127.0.0.1:5433/uvg_collab', PORT, NAME);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rechazada');
    expect(result.stdout + result.stderr).not.toContain('un-secreto-real');
    expect(result.stdout + result.stderr).not.toContain('5433/uvg_collab');
  });

  it('termina con 1 sin argumentos', () => {
    expect(run().status).toBe(1);
  });
});

describe('GPI01-C12: isolated-stack.sh falla cerrado', () => {
  it('la guardia aborta ante un puerto de base persistente, antes de consultar Docker', () => {
    for (const port of ['5432', '5433', '5456']) {
      const result = spawnSync('bash', [SCRIPT, 'guard'], { encoding: 'utf8', env: { ...process.env, E2E_DB_PORT: port } });
      expect(result.status, port).not.toBe(0);
      expect(result.stderr, port).toContain('la URL de base no es la desechable');
    }
  });

  it.each(['cmd_migrate', 'cmd_apps', 'cmd_verify', 'cmd_integration', 'cmd_e2e'])('%s llama a la guardia antes de hacer nada', (nombre) => {
    const cuerpo = funcion(nombre).split('\n').slice(2).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(cuerpo[0]).toBe('guard');
  });

  it('la integración usa su propia base desechable y nunca la sembrada de los E2E', async () => {
    const { isolatedDatabaseProblems } = await cargar();
    expect(isolatedDatabaseProblems(url('127.0.0.1', PORT, `${NAME}_it`), PORT, `${NAME}_it`)).toEqual([]);
    const integracion = funcion('cmd_integration');
    expect(integracion).toContain('DATABASE_URL="$IT_DATABASE_URL"');
    expect(funcion('guard')).toContain('"$IT_DATABASE_URL" "$DB_PORT" "$DB_NAME_IT"');
    // El seed solo se ejecuta sobre la base de los E2E.
    expect(funcion('cmd_migrate').match(/prisma db seed/g)).toHaveLength(1);
    expect(funcion('cmd_migrate')).toMatch(/DATABASE_URL="\$IT_DATABASE_URL" DIRECT_URL="\$IT_DATABASE_URL" npx prisma migrate deploy\)/);
  });

  it('las migraciones y el seed se ejecutan entre dos guardias', () => {
    const lineas = funcion('cmd_migrate').split('\n').slice(2).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lineas[0]).toBe('guard');
    expect(lineas.at(-1)).toBe('guard');
    expect(lineas.join('\n')).toContain('npx prisma migrate deploy && npx prisma db seed');
  });

  it('la guardia exige etiqueta propia, datos en tmpfs, ningún volumen y el puerto en loopback', () => {
    const guard = funcion('guard');
    expect(guard).toContain('assert-isolated-database.mjs');
    expect(guard).toContain('uvg.e2e.isolated');
    expect(guard).toContain('.HostConfig.Tmpfs');
    expect(guard).toMatch(/eq \.Type "volume"/);
    expect(guard).toContain('127.0.0.1:${DB_PORT}');
    expect(guard).toContain('select current_database()');
  });

  it('el entorno de las aplicaciones fija todo lo sensible y apunta solo a la pila', () => {
    const env = spawnSync('bash', [SCRIPT, 'env'], { encoding: 'utf8' });
    expect(env.status).toBe(0);
    const vars = Object.fromEntries(env.stdout.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    for (const clave of ['DATABASE_URL', 'DIRECT_URL']) {
      expect(vars[clave], clave).toBe(`postgresql://e2e:e2e-isolated-synthetic@127.0.0.1:${PORT}/${NAME}?schema=public`);
    }
    // Las suites de integración borran datos: tienen su propia base, sin seed.
    for (const clave of ['INTEGRATION_DATABASE_URL', 'ROLES_IT_DATABASE_URL']) {
      expect(vars[clave], clave).toBe(`postgresql://e2e:e2e-isolated-synthetic@127.0.0.1:${PORT}/${NAME}_it?schema=public`);
    }
    expect(vars.NEXT_PUBLIC_API_URL).toBe('http://localhost:3101');
    expect(vars.API_URL_INTERNAL).toBe('http://localhost:3101');
    expect(vars.FRONTEND_URL).toBe('http://localhost:3100');
    expect(vars.REDIS_PORT).toBe('56379');
    for (const clave of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_URL', 'CLOSURE_KEKS']) {
      expect(clave in vars, `${clave} debe fijarse para que ningún .env local lo aporte`).toBe(true);
    }
    expect(vars.JWT_SECRET).toMatch(/synthetic/);
    expect(env.stdout).not.toMatch(/:3000\b|:3001\b|:5433\b/);
  });

  it('el bundle del frontend se rechaza si referencia el backend de desarrollo', () => {
    expect(funcion('start_frontend')).toMatch(/localhost:3001\|127\\\.0\\\.0\\\.1:3001/);
  });

  it('el desmontaje solo elimina contenedores con la etiqueta y el nombre propios', () => {
    const down = funcion('cmd_down');
    expect(down).toContain('--filter "label=$LABEL"');
    expect(down).toMatch(/case "\$name" in "\$DB_CONTAINER" \| "\$REDIS_CONTAINER"\)/);
  });

  it('el script nunca usa operaciones destructivas sobre recursos ajenos', () => {
    const sinComentarios = source.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(sinComentarios).not.toMatch(/migrate reset|db push|docker volume|compose down|docker system prune|TRUNCATE/i);
    expect(sinComentarios).not.toMatch(/uvg-collab/);
  });
});
