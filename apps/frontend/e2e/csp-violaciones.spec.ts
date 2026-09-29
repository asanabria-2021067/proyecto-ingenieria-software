import { test, expect } from './support/test';
import { unexpectedViolations, type CspViolation } from './support/csp-violations';

/**
 * G06-C09 · OWASP25-C039. Demuestra que la captura funciona con la CSP del
 * build (Report-Only por defecto): una violación artificial e inesperada se
 * registra, normalizada y sin datos sensibles, y NO está en la allowlist, así
 * que haría fallar cualquier test. Aquí se consume con `drain()` para que este
 * test solo verifique la detección.
 */
test('una violación CSP artificial e inesperada se captura y no está permitida', async ({ page, cspViolations }) => {
  await page.goto('/login?token=secreto-que-no-debe-guardarse');
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'https://csp-fixture.invalid/pixel.png?user=privado';
    document.body.appendChild(img);
  });

  const captured: CspViolation[] = [];
  await expect
    .poll(() => {
      captured.push(...cspViolations.drain());
      return captured.some((v) => v.directive === 'img-src' && v.blocked === 'https://csp-fixture.invalid');
    })
    .toBe(true);

  const artificial = captured.find((v) => v.blocked === 'https://csp-fixture.invalid');
  expect(artificial).toMatchObject({ directive: 'img-src', page: '/login' });
  expect(['report', 'enforce']).toContain(artificial?.disposition);
  expect(unexpectedViolations(captured)).toContainEqual(artificial);
  // Nada sensible: ni query de la página ni de lo bloqueado.
  expect(JSON.stringify(captured)).not.toMatch(/secreto|privado|token=|user=/);
});
