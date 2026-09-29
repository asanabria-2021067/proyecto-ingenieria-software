/**
 * G06 (OWASP25-C039): lógica pura de la captura de violaciones CSP del E2E.
 * Sin dependencias de Playwright para poder probarla con Vitest.
 *
 * Normaliza cada violación a datos NO sensibles: directiva, disposición,
 * ORIGEN de lo bloqueado (o su tipo: inline, eval, data, blob) y la ruta de la
 * página sin query ni fragmento. Nunca se guardan URLs completas, cookies,
 * tokens ni contenido de la página.
 */

export interface RawCspViolation {
  directive: string;
  disposition: string;
  blocked: string;
  page: string;
}

export interface CspViolation {
  directive: string;
  disposition: string;
  blocked: string;
  page: string;
}

export interface AllowedViolation {
  directive: string;
  blocked: string;
  /** Razón explícita obligatoria: nunca una excepción genérica. */
  reason: string;
}

/**
 * Excepciones conocidas. Vacía a propósito: cada entrada debe citar el flujo
 * que la produce y por qué es aceptable. Una entrada con comodín o sin razón
 * invalida la lista (ver allowlistFindings).
 */
export const CSP_VIOLATION_ALLOWLIST: AllowedViolation[] = [];

const KEYWORDS = new Set(['inline', 'eval', 'data', 'blob', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);

function originOrKind(value: string): string {
  if (!value) {
    return 'unknown';
  }
  if (KEYWORDS.has(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      return url.protocol.slice(0, -1);
    }
    return url.origin;
  } catch {
    return 'unknown';
  }
}

function pathOnly(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return 'unknown';
  }
}

export function normalizeViolation(raw: RawCspViolation): CspViolation {
  return {
    directive: raw.directive,
    disposition: raw.disposition,
    blocked: originOrKind(raw.blocked),
    page: pathOnly(raw.page),
  };
}

export function unexpectedViolations(
  violations: CspViolation[],
  allowlist: AllowedViolation[] = CSP_VIOLATION_ALLOWLIST,
): CspViolation[] {
  return violations.filter(
    (violation) => !allowlist.some((allowed) => allowed.directive === violation.directive && allowed.blocked === violation.blocked),
  );
}

/** Una allowlist que silencie todo o sin razón no es válida. */
export function allowlistFindings(allowlist: AllowedViolation[]): string[] {
  return allowlist.flatMap((entry) => {
    const findings: string[] = [];
    if (!entry.reason || entry.reason.trim().length < 20) {
      findings.push(`${entry.directive}:${entry.blocked}:sin-razon`);
    }
    if (/[*]/.test(entry.directive) || /[*]/.test(entry.blocked) || entry.blocked === 'unknown') {
      findings.push(`${entry.directive}:${entry.blocked}:generica`);
    }
    return findings;
  });
}

/** Clave estable para deduplicar la evidencia. */
export function violationKey(violation: CspViolation): string {
  return `${violation.disposition}|${violation.directive}|${violation.blocked}|${violation.page}`;
}
