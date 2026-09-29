import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';
import {
  normalizeViolation,
  unexpectedViolations,
  violationKey,
  type CspViolation,
  type RawCspViolation,
} from './csp-violations';

/**
 * G06 (OWASP25-C039): `test` de la suite con captura de violaciones CSP en TODOS
 * los contextos del test (el por defecto y los que abre `browser.newContext()`).
 * Escucha `securitypolicyviolation`, que el navegador dispara también en modo
 * Report-Only, y falla el test solo por violaciones no incluidas en la
 * allowlist. La evidencia (normalizada, sin datos sensibles) se adjunta al
 * reporte como `csp-violations`.
 */

const BINDING = '__uvgCspViolation';

const LISTENER = `
document.addEventListener('securitypolicyviolation', (event) => {
  const report = window['${BINDING}'];
  if (typeof report === 'function') {
    report({
      directive: event.effectiveDirective || event.violatedDirective || '',
      disposition: event.disposition || '',
      blocked: event.blockedURI || '',
      page: location.href,
    });
  }
});
`;

export interface CspCollector {
  /** Violaciones capturadas hasta ahora; `drain` las entrega y vacía la lista. */
  drain(): CspViolation[];
}

interface InternalCollector extends CspCollector {
  list: CspViolation[];
}

// El fixture `context` de Playwright también pasa por `browser.newContext`:
// cada contexto se instrumenta una sola vez.
const attached = new WeakSet<BrowserContext>();

async function attach(context: BrowserContext, violations: CspViolation[]): Promise<void> {
  if (attached.has(context)) {
    return;
  }
  attached.add(context);
  await context.exposeBinding(BINDING, (_source, raw: RawCspViolation) => {
    violations.push(normalizeViolation(raw));
  });
  await context.addInitScript({ content: LISTENER });
}

export const test = base.extend<{ cspViolations: CspCollector; context: BrowserContext }>({
  cspViolations: [
    async ({ browser }, provide, testInfo) => {
      const violations: CspViolation[] = [];
      const collector: InternalCollector = { list: violations, drain: () => violations.splice(0) };

      // Contextos abiertos por el propio test (chat con dos usuarios).
      const original = browser.newContext.bind(browser) as Browser['newContext'];
      browser.newContext = (async (...args: Parameters<Browser['newContext']>) => {
        const context = await original(...args);
        await attach(context, violations);
        return context;
      }) as Browser['newContext'];

      try {
        await provide(collector);
      } finally {
        browser.newContext = original;
      }

      const unique = [...new Map(violations.map((v) => [violationKey(v), v])).values()];
      if (unique.length > 0) {
        await testInfo.attach('csp-violations', { body: JSON.stringify(unique, null, 2), contentType: 'application/json' });
      }
      expect(unexpectedViolations(unique), 'violaciones CSP inesperadas').toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, cspViolations }, provide) => {
    await attach(context, (cspViolations as InternalCollector).list);
    await provide(context);
  },
});

export { expect };
