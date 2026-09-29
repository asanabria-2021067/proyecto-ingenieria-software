import { describe, expect, it } from 'vitest';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { TIPO_OBJETO_SEGURIDAD, TipoEventoSeguridad } from '../src/security-events/tipos-evento-seguridad';

/**
 * G05-C02 · OWASP25-C037. Catálogo estable de eventos de seguridad: nombres
 * fijos, sin duplicados, sin colisión con la bitácora funcional y sin un
 * evento paralelo de exportación.
 */

const ESPERADOS = [
  'LOGIN_FAILED',
  'LOGIN_SUCCEEDED',
  'ACCOUNT_LOCKED',
  'PASSWORD_RESET_ISSUED',
  'PASSWORD_RESET_COMPLETED',
  'USER_STATUS_CHANGED',
];

describe('G05-C02: catálogo de eventos de seguridad', () => {
  it('nombres estables y exactos', () => {
    expect([...TipoEventoSeguridad.VALORES]).toEqual(ESPERADOS);
    for (const nombre of ESPERADOS) {
      expect((TipoEventoSeguridad as unknown as Record<string, string>)[nombre]).toBe(nombre);
    }
  });

  it('sin duplicados', () => {
    expect(new Set(TipoEventoSeguridad.VALORES).size).toBe(TipoEventoSeguridad.VALORES.length);
  });

  it('no colisiona con la bitácora funcional (accion ni tipoObjeto)', () => {
    const funcionales = new Set<string>(TipoEventoBitacora.VALORES);
    expect(TipoEventoSeguridad.VALORES.filter((valor) => funcionales.has(valor))).toEqual([]);
    expect((TipoEventoBitacora.ENTIDADES as readonly string[]).includes(TIPO_OBJETO_SEGURIDAD)).toBe(false);
  });

  it('no duplica los eventos de exportación existentes', () => {
    expect(TipoEventoBitacora.VALORES).toContain('PROJECT_EXPORT_CSV_GENERATED');
    expect(TipoEventoBitacora.VALORES).toContain('PROJECT_EXPORT_PDF_GENERATED');
    expect(TipoEventoSeguridad.VALORES.filter((valor) => /EXPORT/i.test(valor))).toEqual([]);
  });

  it('no se confunde con el log técnico de AuditInterceptor ("METHOD /url")', () => {
    for (const valor of TipoEventoSeguridad.VALORES) {
      expect(valor).toMatch(/^[A-Z][A-Z_]+$/);
    }
  });
});
