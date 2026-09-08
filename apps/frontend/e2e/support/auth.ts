import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PASSWORD = 'Test1234!';
// POST /auth/login está limitado a 5 intentos/min por IP (ver
// auth.controller.ts) — deliberado, no configurable (security-rate-limiting
// spec lo fija por regex sobre el código fuente). La suite de humo reutiliza
// unas pocas cuentas sembradas a través de varios specs; en serie eso supera
// el límite real dentro del mismo minuto. En vez de tocar el límite de
// producción, cada cuenta inicia sesión por UI una sola vez por corrida y el
// resto de los specs reutilizan esa cookie.
const CACHE_DIR = path.join(__dirname, '.auth-cache');

function cacheFile(correo: string): string {
  return path.join(CACHE_DIR, `${correo}.json`);
}

export async function login(page: Page, correo: string): Promise<void> {
  const file = cacheFile(correo);
  if (fs.existsSync(file)) {
    const cookies = JSON.parse(fs.readFileSync(file, 'utf-8'));
    await page.context().addCookies(cookies);
    await page.goto('/dashboard');
    return;
  }

  await page.goto('/login');
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByPlaceholder('Minimo 8 caracteres').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
  await page.waitForURL('**/dashboard', { timeout: 45_000 });

  const cookies = await page.context().cookies();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cookies));
}
