import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TipoNotificacion } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, readRepoFile } from './helpers/workflow-yaml';

/**
 * G05-C11 · OWASP25-C038. Exactamente un valor nuevo del enum
 * TipoNotificacion (ALERTA_SEGURIDAD) en una migración aislada, aditiva y sin
 * filas. La aplicación real (desde cero y sobre la base previa) se verifica
 * contra PostgreSQL desechable (ver la auditoría de G05) y en
 * test/integration/g05-security-alert-type.integration.spec.ts.
 */

const MIGRATIONS = join(REPO_ROOT, 'apps/backend/prisma/migrations');
const NAME = '20260927230000_security_alert_notification_type';

describe('G05-C11: tipo de notificación de alerta de seguridad', () => {
  it('es la migración más reciente y contiene solo un ADD VALUE idempotente', () => {
    const dirs = readdirSync(MIGRATIONS).filter((entry) => /^\d{14}_/.test(entry)).sort();
    expect(dirs.at(-1)).toBe(NAME);
    const statements = readRepoFile(`apps/backend/prisma/migrations/${NAME}/migration.sql`)
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('--'));
    expect(statements).toEqual([`ALTER TYPE "TipoNotificacion" ADD VALUE IF NOT EXISTS 'ALERTA_SEGURIDAD';`]);
  });

  it('no crea ni borra objetos ni filas (aditiva)', () => {
    const sql = readRepoFile(`apps/backend/prisma/migrations/${NAME}/migration.sql`).replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\b(CREATE|DROP|INSERT|UPDATE|DELETE|RENAME|TRUNCATE|ALTER\s+TABLE)\b/i);
  });

  it('schema.prisma agrega el valor tras HORAS_ACREDITADAS sin reordenar los existentes', () => {
    // Valores del enum previos a esta migración (S7 M6 y anteriores). Otro
    // valor puede agregarse en paralelo tras HORAS_ACREDITADAS (p. ej.
    // RECORDATORIO_EVENTO de HU-169) sin que esta prueba se rompa: lo único
    // que le importa es que ALERTA_SEGURIDAD llegue después y que ninguno de
    // estos cambie de orden relativo.
    const VALORES_PREVIOS = [
      'NUEVA_POSTULACION',
      'POSTULACION_RESUELTA',
      'TAREA_ASIGNADA',
      'EVIDENCIA_REVISADA',
      'PROYECTO_PUBLICADO',
      'HORAS_VALIDADAS',
      'CERTIFICADO_EMITIDO',
      'PARTICIPACION_ACTUALIZADA',
      'PROYECTO_EN_REVISION',
      'PROYECTO_OBSERVADO',
      'PROYECTO_APROBADO',
      'PROYECTO_ACTUALIZADO',
      'CAMBIO_ESTADO_PROYECTO',
      'SOLICITUD_CIERRE_PROYECTO',
      'CIERRE_APROBADO',
      'CIERRE_RECHAZADO',
      'TAREA_ACTUALIZADA',
      'HITO_ACTUALIZADO',
      'COMENTARIO_PROYECTO',
      'COMENTARIO_TAREA',
      'COMENTARIO_HITO',
      'MENSAJE_REVISION',
      'PROYECTO_ADVERTENCIA_INACTIVIDAD',
      'ROL_ABANDONADO',
      'ROL_ASIGNADO_LIDER',
      'ROL_ACTUALIZADO',
      'SOLICITUD_RECUPERACION_CONTRASENA',
      'SOLICITUD_AMISTAD',
      'AMISTAD_ACEPTADA',
      'NUEVO_SEGUIDOR',
      'APELACION_LIDERAZGO_RECIBIDA',
      'APELACION_LIDERAZGO_RESUELTA',
      'LIDERAZGO_ACTUALIZADO',
      'POSTULACION_RECHAZADA_POR_CIERRE',
      'CIERRE_CORRECCION_DOCUMENTAL',
      'CIERRE_DEVUELTO_A_EJECUCION',
      'HORAS_CONSOLIDADAS',
      'HORAS_ACREDITADAS',
    ];

    const schema = readRepoFile('apps/backend/prisma/schema.prisma');
    const body = /enum TipoNotificacion \{([\s\S]*?)\}/.exec(schema)?.[1] ?? '';
    const values = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//'));

    expect(values.filter((value) => value === 'ALERTA_SEGURIDAD')).toHaveLength(1);
    expect(values.indexOf('ALERTA_SEGURIDAD')).toBeGreaterThan(values.indexOf('HORAS_ACREDITADAS'));
    expect(values.filter((value) => VALORES_PREVIOS.includes(value))).toEqual(VALORES_PREVIOS);
  });

  it('el cliente Prisma generado conoce el valor', () => {
    expect(TipoNotificacion.ALERTA_SEGURIDAD).toBe('ALERTA_SEGURIDAD');
  });
});
