import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './helpers/workflow-yaml';
import {
  GIT_MAX_BUFFER,
  PHASE2_BASE,
  TRACE,
  TRACE_GREP,
  git,
  gitAvailable,
  historyCommitIds,
  parseTraceLog,
  phaseHead,
} from './helpers/owasp-evidence';

/**
 * GPI01-C11. Las pruebas `g08-*` leían el cuerpo de TODOS los commits desde la
 * base de la fase OWASP. Al integrar `develop` ese rango pasó de ~100 a miles
 * de commits y la salida superó el tope por defecto de Node (1 MiB):
 * `spawnSync git ENOBUFS` reventaba cinco pruebas antes de evaluar nada.
 *
 * La lectura se acota en origen (`git log --grep` con el texto fijo de la línea
 * de trazabilidad) y el resto de comandos tiene un tope explícito. Aquí se
 * demuestra que acotar NO cambia el resultado ni debilita ninguna
 * comprobación: una prueba que antes fallaba por una desviación real del
 * historial sigue fallando, ahora por su aserción y no por el búfer.
 */

const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;
const RANGO = `${PHASE2_BASE}..HEAD`;

/** Lectura de referencia SIN acotar: todo el historial del rango, con búfer holgado. */
function historialCompleto(): string {
  return execFileSync('git', ['log', '--format=%H%x00%B%x1e', RANGO], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

const linea = (gate: string, id: string) => `Security/integration contract: Gate ${gate} · Commit ${id}`;
const entrada = (sha: string, body: string) => `${sha}\x00${body}\x1e`;

describe('GPI01-C11: el filtro en origen es un superconjunto de la trazabilidad', () => {
  it('toda línea que cumple TRACE contiene el texto fijo que usa --grep', () => {
    for (const gate of ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09']) {
      const texto = linea(gate, `${gate}-C07`);
      expect(TRACE.test(texto), texto).toBe(true);
      expect(texto.includes(TRACE_GREP), texto).toBe(true);
    }
  });

  it('el texto fijo no es más estricto que TRACE (no exige número de commit ni separador)', () => {
    expect(TRACE_GREP).toBe('Security/integration contract: Gate G0');
    expect(TRACE.source.startsWith('Security\\/integration contract: Gate (G0\\d)')).toBe(true);
  });
});

describe('GPI01-C11: parseTraceLog conserva la semántica', () => {
  it('ignora los commits sin línea de trazabilidad y los que solo se le parecen', () => {
    const log = [
      entrada('a'.repeat(40), `fix: algo\n\n${linea('G01', 'G01-C01')}`),
      entrada('b'.repeat(40), 'feat: commit de otra persona sin trazabilidad'),
      entrada('c'.repeat(40), 'docs: menciona Security/integration contract: Gate G0 pero sin el ID'),
      entrada('d'.repeat(40), `test: otro\n\n${linea('G07', 'G07-C13')}`),
    ].join('\n');
    expect([...parseTraceLog(log)]).toEqual([
      ['G01-C01', 'a'.repeat(40)],
      ['G07-C13', 'd'.repeat(40)],
    ]);
  });

  it('un ID fuera del plan o repetido se sigue viendo: no se filtra nada que una prueba deba detectar', () => {
    const log = [
      entrada('1'.repeat(40), linea('G01', 'G01-C13')),
      entrada('2'.repeat(40), linea('G01', 'G01-C13')),
      entrada('3'.repeat(40), linea('G02', 'G02-C03')),
    ].join('');
    const ids = parseTraceLog(log);
    expect(ids.has('G01-C13')).toBe(true);
    expect(ids.has('G02-C03')).toBe(true);
    // Igual que antes del cambio: gana la última entrada del log (el commit más antiguo).
    expect(ids.get('G01-C13')).toBe('2'.repeat(40));
  });

  it('una salida vacía no produce IDs', () => {
    expect(parseTraceLog('').size).toBe(0);
  });
});

describe.runIf(gitAvailable())('GPI01-C11: lectura acotada del historial real', () => {
  it('devuelve exactamente el mismo mapa que la lectura completa sin acotar', () => {
    // Mismo rango que audita `historyCommitIds`: de la base de la fase a su cierre.
    const referencia = parseTraceLog(
      execFileSync('git', ['log', '--format=%H%x00%B%x1e', `${PHASE2_BASE}..${phaseHead()}`], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
      }),
    );
    const acotada = historyCommitIds();
    expect(acotada.size).toBe(referencia.size);
    expect([...acotada]).toEqual([...referencia]);
  });

  it('cabe en el tope por defecto de Node aunque el historial completo no quepa', () => {
    const completa = Buffer.byteLength(historialCompleto());
    const acotada = Buffer.byteLength(
      execFileSync('git', ['log', '--fixed-strings', `--grep=${TRACE_GREP}`, '--format=%H%x00%B%x1e', RANGO], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
      }),
    );
    expect(acotada).toBeLessThan(NODE_DEFAULT_MAX_BUFFER);
    expect(acotada).toBeLessThanOrEqual(completa);
  });

  it('los listados de todo el rango ya no desbordan y siguen bajo el tope explícito', () => {
    for (const args of [
      ['log', '--format=%B', RANGO],
      ['log', '--name-only', '--format=', RANGO],
      ['log', '--format=%an <%ae>|%cn <%ce>', RANGO],
    ]) {
      const salida = git(...args);
      expect(Buffer.byteLength(salida), args.join(' ')).toBeLessThan(GIT_MAX_BUFFER / 4);
    }
  });

  it('el tope sigue siendo un tope: una salida mayor falla en vez de crecer sin límite', () => {
    expect(Number.isFinite(GIT_MAX_BUFFER)).toBe(true);
    expect(() =>
      execFileSync('git', ['log', '--format=%B', RANGO], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 }),
    ).toThrow(/ENOBUFS/);
  });
});
