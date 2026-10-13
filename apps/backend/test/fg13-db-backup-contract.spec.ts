import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T-313 (FG13): el contrato de los scripts de respaldo está escrito en bash
 * (infra/db-backup/test/pg-backup-contract.sh) y usa pg_dump y pg_restore
 * simulados. Este spec lo ejecuta para que corra con la suite unitaria y en
 * CI: no necesita PostgreSQL ni Docker.
 */
const DIR = join(__dirname, '../../../infra/db-backup');

describe('T-313: scripts de respaldo de PostgreSQL', () => {
  it('el contrato en bash pasa completo', () => {
    let salida: string;
    try {
      salida = execFileSync('bash', [join(DIR, 'test/pg-backup-contract.sh')], { encoding: 'utf8', timeout: 60_000 });
    } catch (error) {
      // Las líneas FAIL del contrato son el mensaje útil.
      throw new Error(String((error as { stdout?: string }).stdout ?? error));
    }
    expect(salida).not.toMatch(/^FAIL/m);
    expect(salida).toMatch(/pg-backup-contract: (\d+)\/\1\n$/);
  }, 90_000);

  it('ni la plantilla de configuración ni la de cron traen valores reales', () => {
    const env = readFileSync(join(DIR, 'backup.example.env'), 'utf8');
    const cron = readFileSync(join(DIR, 'pg-backup.cron.example'), 'utf8');
    // Ninguna contraseña activa: las líneas de credenciales van comentadas y con marcador.
    expect(env).not.toMatch(/^PGPASS(WORD|FILE)=/m);
    expect(env).toMatch(/^# PGPASSWORD=CAMBIAR_/m);
    expect(cron).not.toMatch(/PGPASS|postgres(ql)?:\/\//i);
  });
});

/**
 * T-314: el contrato de pg-restore.sh (infra/db-backup/test/pg-restore-contract.sh)
 * usa psql, pg_dump y pg_restore simulados. Corre con la suite unitaria y en CI:
 * no necesita PostgreSQL ni Docker.
 */
describe('T-314: script de restauración de PostgreSQL', () => {
  it('el contrato en bash pasa completo', () => {
    let salida: string;
    try {
      salida = execFileSync('bash', [join(DIR, 'test/pg-restore-contract.sh')], { encoding: 'utf8', timeout: 60_000 });
    } catch (error) {
      throw new Error(String((error as { stdout?: string }).stdout ?? error));
    }
    expect(salida).not.toMatch(/^FAIL/m);
    expect(salida).toMatch(/pg-restore-contract: (\d+)\/\1\n$/);
  }, 90_000);
});
