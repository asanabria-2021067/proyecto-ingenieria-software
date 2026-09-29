#!/usr/bin/env node
/**
 * G08-C03 (OWASP25-C048 · A08:2025): verificador local del delta de la
 * workstream OWASP. Trabaja SOLO con Git local; no consulta GitHub, `main`
 * remoto, la VM ni producción.
 *
 * Falla si:
 * - la allowlist no se puede parsear o no cumple el esquema;
 * - la base no existe en el historial local o no es ancestro de HEAD;
 * - un commit (no merge) del rango no lleva la trazabilidad de la workstream
 *   (`Security/integration contract: Gate Gxx · Commit Gxx-Cnn · …`), su gate
 *   no coincide con su ID, el ID se repite o figura como no ejecutado;
 * - un commit toca una ruta ausente de la allowlist o de otro gate;
 * - el diff agregado base..HEAD contiene una ruta ausente de la allowlist.
 *
 * Uso:
 *   node scripts/security/verify-owasp-delta.mjs [--allowlist <json>] [--repo <dir>]
 *        [--base <sha> | --base-ref <ref>] [--head <ref>]
 * Sin `--base`/`--base-ref` usa `baseSha` de la allowlist (BASE_SHA_PHASE2_CODE).
 * Con `--base-ref` (CI del PR) la base es `git merge-base <ref> HEAD`.
 * Solo imprime SHAs cortos, IDs y rutas; nunca el contenido de los commits.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ALLOWLIST = 'docs/security/owasp-delta-allowlist.json';
export const TRACE = /Security\/integration contract: Gate (G\d{2}) · Commit (G\d{2})-C(\d{2}) · /;
const GATE = /^G\d{2}$/;

/** Valida y devuelve la allowlist; lanza con un mensaje claro si no cumple el esquema. */
export function parseAllowlist(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('allowlist: JSON invalido');
  }
  const fail = (message) => {
    throw new Error(`allowlist: ${message}`);
  };
  if (data?.version !== 1) fail('version debe ser 1');
  if (!/^[0-9a-f]{40}$/.test(data.baseSha ?? '')) fail('baseSha debe ser un SHA completo');
  if (!Array.isArray(data.gates) || data.gates.length === 0 || !data.gates.every((gate) => GATE.test(gate))) fail('gates invalidos');
  const known = new Set(data.gates);
  const checkGates = (gates, where) => {
    if (!Array.isArray(gates) || gates.length === 0 || !gates.every((gate) => known.has(gate))) fail(`gates invalidos en ${where}`);
  };
  const checkPath = (path, where) => {
    if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.split('/').includes('..')) fail(`ruta invalida en ${where}`);
  };
  if (!Array.isArray(data.paths)) fail('paths debe ser una lista');
  const seen = new Set();
  for (const entry of data.paths) {
    checkPath(entry?.path, 'paths');
    checkGates(entry.gates, entry.path);
    if (seen.has(entry.path)) fail(`ruta duplicada ${entry.path}`);
    seen.add(entry.path);
  }
  for (const entry of data.patterns ?? []) {
    checkPath(entry?.glob, 'patterns');
    checkGates(entry.gates, entry.glob);
    if (!entry.reason) fail(`patron sin justificacion ${entry.glob}`);
    if (/^\*\*|^[^/]*\*\*$|^\*$/.test(entry.glob)) fail(`patron demasiado amplio ${entry.glob}`);
  }
  for (const entry of data.exceptions ?? []) {
    checkPath(entry?.path, 'exceptions');
    checkGates(entry.gates, entry.path);
    if (!entry.reason) fail(`excepcion sin justificacion ${entry.path}`);
  }
  for (const entry of data.notExecuted ?? []) {
    if (!/^G\d{2}-C\d{2}$/.test(entry?.id ?? '')) fail('notExecuted con ID invalido');
  }
  return data;
}

/** Glob minimo: `**` cruza directorios, `*` no. */
export function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** Gates que pueden tocar una ruta (vacio = ruta fuera de la allowlist). */
export function allowedGates(allowlist, path) {
  const gates = new Set();
  for (const entry of [...allowlist.paths, ...(allowlist.exceptions ?? [])]) {
    if (entry.path === path) entry.gates.forEach((gate) => gates.add(gate));
  }
  for (const entry of allowlist.patterns ?? []) {
    if (globToRegExp(entry.glob).test(path)) entry.gates.forEach((gate) => gates.add(gate));
  }
  return gates;
}

/**
 * Nucleo puro: `commits` = [{ short, message, files, merge }], `deltaPaths` =
 * rutas del diff agregado base..HEAD. Devuelve la lista de hallazgos.
 */
export function verifyDelta({ allowlist, commits, deltaPaths }) {
  const findings = [];
  const ids = new Map();
  const notExecuted = new Set((allowlist.notExecuted ?? []).map((entry) => entry.id));
  for (const commit of commits) {
    if (commit.merge) continue;
    const match = TRACE.exec(commit.message);
    if (!match) {
      findings.push(`sin-trazabilidad: ${commit.short}`);
      continue;
    }
    const [, gate, idGate, number] = match;
    const id = `${idGate}-C${number}`;
    if (gate !== idGate) findings.push(`gate-inconsistente: ${commit.short} ${gate}/${id}`);
    if (!allowlist.gates.includes(gate)) findings.push(`gate-desconocido: ${commit.short} ${gate}`);
    if (notExecuted.has(id)) findings.push(`id-marcado-como-no-ejecutado: ${commit.short} ${id}`);
    if (ids.has(id)) findings.push(`id-duplicado: ${id} (${ids.get(id)} y ${commit.short})`);
    ids.set(id, commit.short);
    for (const path of commit.files) {
      const gates = allowedGates(allowlist, path);
      if (gates.size === 0) findings.push(`ruta-fuera-de-allowlist: ${path} (${commit.short})`);
      else if (!gates.has(gate)) findings.push(`ruta-de-otro-gate: ${path} (${commit.short} ${gate})`);
    }
  }
  for (const path of deltaPaths) {
    if (allowedGates(allowlist, path).size === 0) findings.push(`ruta-fuera-de-allowlist: ${path} (delta)`);
  }
  return [...new Set(findings)];
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commitExists(repo, ref) {
  try {
    git(repo, ['cat-file', '-e', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(repo, ancestor, head) {
  try {
    git(repo, ['merge-base', '--is-ancestor', ancestor, head]);
    return true;
  } catch {
    return false;
  }
}

/** Recolecta del Git local los commits y el diff agregado; valida la base. */
export function collectDelta({ repo, allowlist, base, baseRef, head = 'HEAD' }) {
  if (git(repo, ['rev-parse', '--is-shallow-repository']) === 'true') {
    throw new Error('historial incompleto (clon superficial): se necesita fetch-depth 0');
  }
  const headSha = git(repo, ['rev-parse', '--verify', `${head}^{commit}`]);
  if (!commitExists(repo, allowlist.baseSha)) throw new Error(`la base de la fase ${allowlist.baseSha.slice(0, 12)} no existe en el historial local`);
  if (!isAncestor(repo, allowlist.baseSha, headSha)) throw new Error('la base de la fase no es ancestro de HEAD');
  let baseSha = base ?? allowlist.baseSha;
  if (baseRef) {
    if (!commitExists(repo, baseRef)) throw new Error(`la referencia base ${baseRef} no existe en el historial local`);
    baseSha = git(repo, ['merge-base', baseRef, headSha]);
  }
  if (!commitExists(repo, baseSha)) throw new Error(`la base ${String(baseSha).slice(0, 12)} no existe en el historial local`);
  if (!isAncestor(repo, baseSha, headSha)) throw new Error('la base no es ancestro de HEAD');
  const shas = git(repo, ['rev-list', '--reverse', `${baseSha}..${headSha}`]).split('\n').filter(Boolean);
  const commits = shas.map((sha) => {
    const parents = git(repo, ['show', '-s', '--format=%P', sha]).split(' ').filter(Boolean);
    const merge = parents.length > 1;
    return {
      short: sha.slice(0, 8),
      merge,
      message: git(repo, ['show', '-s', '--format=%B', sha]),
      files: merge ? [] : git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', '--root', sha]).split('\n').filter(Boolean),
    };
  });
  const deltaPaths = git(repo, ['diff', '--name-only', '--no-renames', baseSha, headSha]).split('\n').filter(Boolean);
  return { baseSha, headSha, commits, deltaPaths };
}

export function run({ repo, allowlistPath, base, baseRef, head }) {
  const allowlist = parseAllowlist(readFileSync(allowlistPath, 'utf8'));
  const delta = collectDelta({ repo, allowlist, base, baseRef, head });
  const findings = verifyDelta({ allowlist, ...delta });
  return { ...delta, findings };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (!['--allowlist', '--repo', '--base', '--base-ref', '--head'].includes(flag) || value === undefined) {
      throw new Error(`argumento no reconocido: ${flag}`);
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const repo = resolve(options.repo ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
    const result = run({
      repo,
      allowlistPath: resolve(repo, options.allowlist ?? DEFAULT_ALLOWLIST),
      base: options.base,
      baseRef: options['base-ref'],
      head: options.head,
    });
    const merges = result.commits.filter((commit) => commit.merge).length;
    const summary = `base=${result.baseSha.slice(0, 12)} head=${result.headSha.slice(0, 12)} commits=${result.commits.length - merges} merges=${merges} paths=${result.deltaPaths.length}`;
    if (result.findings.length === 0) {
      console.log(`OWASP_DELTA_ISOLATED=PASS ${summary}`);
    } else {
      console.log(`OWASP_DELTA_ISOLATED=FAIL ${summary}`);
      result.findings.forEach((finding) => console.log(`  - ${finding}`));
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(`OWASP_DELTA_ISOLATED=FAIL ${error instanceof Error ? error.message : 'error'}`);
    process.exitCode = 1;
  }
}
