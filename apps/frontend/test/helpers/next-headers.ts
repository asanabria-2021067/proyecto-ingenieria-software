import type { NextConfig } from 'next';
import { buildCustomRoute } from 'next/dist/lib/build-custom-route';

/**
 * G06 (OWASP25-C039): evalúa `headers()` de next.config como lo hace el
 * servidor de producción de Next. Cada `source` se compila con
 * `buildCustomRoute('header', …)`, la misma función que genera el `regex` de
 * `routes-manifest.json` en `next build`; todas las reglas que coinciden se
 * aplican en orden y una clave repetida la sobrescribe la última.
 */

export type HeaderMap = Record<string, string>;

export async function headersFor(config: NextConfig, pathname: string): Promise<HeaderMap> {
  const rules = (await config.headers?.()) ?? [];
  const result: HeaderMap = {};
  for (const rule of rules) {
    const { regex } = buildCustomRoute('header', rule);
    if (!new RegExp(regex).test(pathname)) {
      continue;
    }
    for (const { key, value } of rule.headers) {
      result[key.toLowerCase()] = value;
    }
  }
  return result;
}

export interface HeaderContract {
  /** Cabeceras obligatorias con su valor exacto. */
  required?: HeaderMap;
  /** Cabeceras que no deben aparecer. */
  absent?: string[];
}

/** Hallazgos del contrato sobre las cabeceras de una ruta; vacío = cumple. */
export function headerContractFindings(actual: HeaderMap, contract: HeaderContract): string[] {
  const findings: string[] = [];
  for (const [name, expected] of Object.entries(contract.required ?? {})) {
    const value = actual[name.toLowerCase()];
    if (value === undefined) {
      findings.push(`falta ${name}`);
    } else if (value !== expected) {
      findings.push(`${name}=${JSON.stringify(value)} (esperado ${JSON.stringify(expected)})`);
    }
  }
  for (const name of contract.absent ?? []) {
    if (actual[name.toLowerCase()] !== undefined) {
      findings.push(`sobra ${name}`);
    }
  }
  return findings;
}
