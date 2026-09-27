import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflow, parseWorkflow, type Workflow, type WorkflowStep } from './helpers/workflow-yaml';

/**
 * G01-C07 · FASE2-N01 + VM0-F012 + C030. El .env de producción no viaja dentro
 * del comando remoto (argv visible en /proc de la VM) sino por stdin de SSH, y
 * se instala con permisos 0600. Todos los valores de las pruebas son sintéticos.
 */

const SSH_ACTION = 'appleboy/ssh-action';
const TRANSFER_STEP = 'Transferir .env de produccion por stdin';

/** Hallazgos de transporte del .env en el job `deploy`; vacío = contrato cumplido. */
export function deployEnvTransportFindings(workflow: Workflow): string[] {
  const steps: WorkflowStep[] = workflow.jobs.deploy?.steps ?? [];
  const findings: string[] = [];

  for (const step of steps) {
    if (step.uses?.startsWith(SSH_ACTION) && (step.with?.script ?? '').includes('${{')) {
      findings.push(`ssh-script-interpolates:${step.name}`);
    }
    if ((step.run ?? '').includes('${{')) {
      findings.push(`run-interpolates:${step.name}`);
    }
  }

  const sshScripts = steps.filter((s) => s.uses?.startsWith(SSH_ACTION)).map((s) => s.with?.script ?? '');
  if (sshScripts.some((script) => /cat\s*>\s*\.env\s*<</.test(script))) {
    findings.push('env-heredoc-in-remote-script');
  }
  if (!sshScripts.some((script) => /install -m 600 \S+ \.env\b/.test(script))) {
    findings.push('env-not-installed-0600');
  }

  const transfer = steps.find((s) => s.name === TRANSFER_STEP);
  if (!transfer || !/^\s*< "\$work\/env"\s*$/m.test(transfer.run ?? '')) {
    findings.push('env-not-sent-over-stdin');
  }
  return findings;
}

const workflow = loadWorkflow('deploy.yml');
const transferStep = () => {
  const step = workflow.jobs.deploy.steps?.find((s) => s.name === TRANSFER_STEP);
  if (!step?.run || !step.env) {
    throw new Error('Paso de transferencia ausente');
  }
  return step as Required<Pick<WorkflowStep, 'run' | 'env'>>;
};

describe('G01-C07: .env fuera del argv remoto y con 0600 (estático)', () => {
  it('deploy.yml es YAML válido y cumple el contrato de transporte', () => {
    expect(deployEnvTransportFindings(workflow)).toEqual([]);
  });

  it('los secretos solo entran al paso por `env:` y el comando remoto es literal', () => {
    const step = transferStep();
    expect(step.env.JWT_SECRET).toBe('${{ secrets.JWT_SECRET }}');
    const remote = /'(umask 077[^']*)'/.exec(step.run)?.[1] ?? '';
    expect(remote).toContain('cat > ~/.uvg-deploy/env.incoming');
    expect(remote).not.toContain('$');
  });

  describe('fixtures negativos', () => {
    const base = (script: string, run = '  < "$work/env"') =>
      parseWorkflow(
        [
          'jobs:',
          '  deploy:',
          '    steps:',
          `      - name: ${TRANSFER_STEP}`,
          '        run: |',
          ...run.split('\n').map((line) => `          ${line}`),
          '      - name: Deploy via SSH',
          '        uses: appleboy/ssh-action@v1.2.0',
          '        with:',
          '          script: |',
          ...script.split('\n').map((line) => `            ${line}`),
        ].join('\n'),
      );

    it('el heredoc antiguo con secretos interpolados en el script remoto', () => {
      const findings = deployEnvTransportFindings(
        base("cat > .env <<'ENVEOF'\nJWT_SECRET=${{ secrets.JWT_SECRET }}\nENVEOF"),
      );
      expect(findings).toEqual(
        expect.arrayContaining([
          'ssh-script-interpolates:Deploy via SSH',
          'env-heredoc-in-remote-script',
          'env-not-installed-0600',
        ]),
      );
    });

    it('un .env instalado sin modo 0600', () => {
      expect(deployEnvTransportFindings(base('cp ~/.uvg-deploy/env.incoming .env'))).toEqual([
        'env-not-installed-0600',
      ]);
    });

    it('un secreto interpolado en un `run` o un .env que no viaja por stdin', () => {
      const findings = deployEnvTransportFindings(
        base('install -m 600 ~/.uvg-deploy/env.incoming .env', 'echo "${{ secrets.DB_PASSWORD }}"'),
      );
      expect(findings).toEqual([`run-interpolates:${TRANSFER_STEP}`, 'env-not-sent-over-stdin']);
    });
  });
});

const hasBash = spawnSync('bash', ['--version']).status === 0;

describe.skipIf(!hasBash)('G01-C07: ejecución real del paso con un ssh falso', () => {
  const root = mkdtempSync(join(tmpdir(), 'g01-deploy-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('ningún valor viaja en argv; el remoto recibe el .env por stdin y lo instala con 0600', () => {
    const bin = join(root, 'bin');
    const remoteHome = join(root, 'remote-home');
    const runnerTemp = join(root, 'runner-temp');
    const argvLog = join(root, 'ssh-argv.txt');
    for (const dir of [bin, remoteHome, runnerTemp]) {
      mkdirSync(dir, { recursive: true });
    }
    // ssh falso: registra argv y ejecuta el comando remoto (último argumento) con el stdin recibido.
    writeFileSync(
      join(bin, 'ssh'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${argvLog}"\nfor last; do :; done\nHOME="${remoteHome}" bash -c "$last"\n`,
    );
    chmodSync(join(bin, 'ssh'), 0o755);

    const step = transferStep();
    const env: Record<string, string> = {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      RUNNER_TEMP: runnerTemp,
    };
    for (const name of Object.keys(step.env)) {
      env[name] = `synthetic-${name.toLowerCase()}-value`;
    }
    // stdin a /dev/null: con un socket como stdin, bash lo trata como sesión remota y carga ~/.bashrc.
    const result = spawnSync('bash', ['-c', step.run], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(result.status, result.stderr).toBe(0);

    const argv = readFileSync(argvLog, 'utf8');
    for (const [name, value] of Object.entries(env)) {
      if (name !== 'PATH' && name !== 'RUNNER_TEMP' && !['SERVER_IP', 'SERVER_USER'].includes(name)) {
        expect(argv, `${name} apareció en argv`).not.toContain(value);
      }
    }

    const incoming = join(remoteHome, '.uvg-deploy/env.incoming');
    expect(statSync(incoming).mode & 0o777).toBe(0o600);
    expect(statSync(join(remoteHome, '.uvg-deploy')).mode & 0o777).toBe(0o700);
    const content = readFileSync(incoming, 'utf8');
    expect(content).toContain(`JWT_SECRET=${env.JWT_SECRET}\n`);
    expect(content).toContain('NODE_ENV=production\n');
    // El directorio de trabajo del runner (clave SSH incluida) se elimina al terminar.
    expect(spawnSync('test', ['-e', join(runnerTemp, 'deploy-env')]).status).not.toBe(0);

    // Lado remoto: las líneas del script SSH que instalan el .env.
    const script = workflow.jobs.deploy.steps?.find((s) => s.uses?.startsWith(SSH_ACTION))?.with?.script ?? '';
    const installLines = script.split('\n').filter((line) => line.includes('.uvg-deploy'));
    const project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, '.env'), 'OLD=1\n', { mode: 0o664 });
    const install = spawnSync('bash', ['-ec', installLines.join('\n')], {
      cwd: project,
      env: { PATH: process.env.PATH ?? '', HOME: remoteHome },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(install.status, install.stderr).toBe(0);
    expect(statSync(join(project, '.env')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(project, '.env'), 'utf8')).toBe(content);
    expect(spawnSync('test', ['-e', incoming]).status).not.toBe(0);
  });
});
