// Regenera CHANGELOG.md desde el historial de git (y gh, si esta disponible).
// Uso: npm run changelog
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const Y = 2026;
// [nombre, inicio, fin] en MM-DD
export const SPRINTS = [
  ['Sprint 1', '03-29', '04-08'],
  ['Sprint 2', '04-13', '04-22'],
  ['Sprint 3', '04-27', '05-11'],
  ['Sprint 4', '05-14', '05-28'],
  ['Sprint 5', '07-06', '07-28'],
  ['Sprint 6', '07-30', '08-19'],
  ['Sprint 7', '08-27', '09-08'],
  ['Sprint 8', '09-12', '09-29'],
  ['Sprint 9', '10-05', '10-13'],
  ['Sprint 10', '10-16', '10-27'],
];
export const OTROS = 'Otros (previo al Sprint 1)';

// date: 'YYYY-MM-DD'. Dentro de rango -> ese sprint; en hueco o despues del ultimo -> siguiente
// sprint (el ultimo si ya paso); anterior al Sprint 1 -> OTROS.
export function sprintOf(date) {
  if (date < `${Y}-${SPRINTS[0][1]}`) return OTROS;
  for (const [name, , end] of SPRINTS) if (date <= `${Y}-${end}`) return name;
  return SPRINTS[SPRINTS.length - 1][0];
}

export const TIPOS = [
  ['feat', 'Funcionalidades'],
  ['fix', 'Correcciones'],
  ['perf', 'Rendimiento'],
  ['refactor', 'Refactor'],
  ['test', 'Pruebas'],
  ['docs', 'Documentacion'],
  ['style', 'Estilo'],
  ['a11y', 'Accesibilidad'],
  ['ci', 'CI/CD'],
  ['build', 'Mantenimiento'],
  ['chore', 'Mantenimiento'],
];
const OTRO = 'Otros';

export function tipoOf(subject) {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(subject);
  const hit = m && TIPOS.find(([t]) => t === m[1].toLowerCase());
  return hit ? hit[0] : OTRO;
}

export const esRuido = (s) => /^merge\b/i.test(s);

export function agrupar(commits) {
  const out = new Map();
  for (const c of commits) {
    const sp = sprintOf(c.date);
    const sec = TIPOS.find(([t]) => t === tipoOf(c.subject))?.[1] ?? OTRO;
    if (!out.has(sp)) out.set(sp, new Map());
    const secs = out.get(sp);
    if (!secs.has(sec)) secs.set(sec, []);
    secs.get(sec).push(c);
  }
  return out;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

function leerCommits() {
  const raw = git('log', 'HEAD', '--format=%H%x1f%P%x1f%aI%x1f%s');
  const commits = [];
  const prDe = new Map();
  for (const line of raw.split('\n')) {
    const [hash, parents, iso, subject] = line.split('\x1f');
    if (parents.split(' ').length > 1) {
      const m = /Merge pull request #(\d+)/.exec(subject);
      if (m) {
        const [p1, p2] = parents.split(' ');
        for (const h of git('rev-list', `${p1}..${p2}`).split('\n')) if (h) prDe.set(h, m[1]);
      }
      continue;
    }
    if (esRuido(subject)) continue;
    commits.push({ hash, date: iso.slice(0, 10), subject: subject.replace(/[–—]/g, '-') });
  }
  for (const c of commits) {
    const inl = /\(#(\d+)\)\s*$/.exec(c.subject);
    c.pr = inl ? inl[1] : prDe.get(c.hash);
    c.subject = c.subject.replace(/\s*\(#\d+\)\s*$/, '');
  }
  return commits;
}

function totalPRs() {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '5000', '--json', 'number'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out).length;
  } catch {
    return null; // gh no disponible: solo git
  }
}

export function render(commits, prs) {
  const g = agrupar(commits);
  const L = [];
  L.push('# Changelog', '');
  L.push('Generado con `npm run changelog` (scripts/changelog.mjs) desde el historial de git' + (prs ? ` y ${prs} PR fusionados en GitHub.` : '.'));
  L.push('', '## Como regenerar', '', '```bash', 'npm run changelog        # regenera este archivo completo', 'npm run test:changelog   # prueba de los limites de sprint', '```', '');
  L.push('## Reglas de agrupacion', '');
  L.push('- Los commits se asignan al sprint por fecha de autor (ano 2026).');
  L.push('- Commits en los huecos entre sprints, o posteriores al ultimo sprint, van al sprint siguiente mas cercano (o al ultimo si ya paso).');
  L.push('- Commits anteriores al Sprint 1 (29/03) van a "' + OTROS + '".');
  L.push('- Se excluyen los commits de merge; el numero de PR se toma de "(#n)" o del merge del PR que contiene el commit.');
  L.push('- Tipos segun Conventional Commits; los demas van a "Otros".');
  L.push('', '## [1.0.0] - pendiente', '', 'Primera version estable. La etiqueta aun no se ha creado (ver "Como etiquetar" al final).', '');
  const orden = [...SPRINTS.map((s) => s[0]).reverse(), OTROS];
  const fechas = Object.fromEntries(SPRINTS.map(([n, a, b]) => [n, `${a.slice(3)}/${a.slice(0, 2)} - ${b.slice(3)}/${b.slice(0, 2)}`]));
  for (const sp of orden) {
    const secs = g.get(sp);
    if (!secs) continue;
    const n = [...secs.values()].reduce((a, v) => a + v.length, 0);
    L.push(`## ${sp}${fechas[sp] ? ` (${fechas[sp]}/${Y}${sp === 'Sprint 10' ? ', en curso' : ''})` : ''} - ${n} commits`, '');
    const nombres = [...new Set([...TIPOS.map((t) => t[1]), OTRO])];
    for (const sec of nombres) {
      const items = secs.get(sec);
      if (!items) continue;
      L.push(`### ${sec}`, '');
      for (const c of items) L.push(`- ${c.subject} (\`${c.hash.slice(0, 7)}\`${c.pr ? `, #${c.pr}` : ''})`);
      L.push('');
    }
  }
  L.push('## Como etiquetar', '');
  L.push('NO ejecutar hasta que el equipo lo indique.', '', '```bash');
  L.push('git checkout main && git pull', 'git tag -a v1.0.0 -m "Version 1.0.0"', 'git push origin v1.0.0', 'gh release create v1.0.0 --title "v1.0.0" --notes-file CHANGELOG.md', '```', '');
  return L.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commits = leerCommits();
  writeFileSync('CHANGELOG.md', render(commits, totalPRs()));
  console.log(`CHANGELOG.md generado: ${commits.length} commits`);
}
