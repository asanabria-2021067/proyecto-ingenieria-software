import type { APIRequestContext, Page } from '@playwright/test';
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

// `destino` es la pantalla a la que el login lleva a esa cuenta (use-login.ts):
// `/dashboard` para estudiantes y `/dashboard/admin` para administración. Se
// espera la ruta exacta, así que una cuenta que aterriza en otra pantalla falla.
export async function login(page: Page, correo: string, destino = '/dashboard'): Promise<void> {
  const file = cacheFile(correo);
  if (fs.existsSync(file)) {
    const cookies = JSON.parse(fs.readFileSync(file, 'utf-8'));
    await page.context().addCookies(cookies);
    await page.goto(destino);
    return;
  }

  await page.goto('/login');
  await page.getByPlaceholder('usuario@uvg.edu.gt').fill(correo);
  await page.getByPlaceholder('Minimo 8 caracteres').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
  await page.waitForURL(`**${destino}`, { timeout: 45_000 });

  const cookies = await page.context().cookies();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cookies));
}

/**
 * Inicio de sesión que DEBE fallar (contraseña errónea), hecho contra la API
 * real para que la aplicación registre su evento de seguridad. Cuenta para el
 * mismo límite de 5 intentos por minuto: si el límite responde 429 se espera a
 * que venza la ventana y se repite, nunca se toca el límite. Devuelve el
 * estado final (401 cuando el intento llegó a evaluarse).
 */
export async function loginFallido(request: APIRequestContext, apiUrl: string, correo: string): Promise<number> {
  for (let intento = 0; ; intento += 1) {
    const respuesta = await request.post(`${apiUrl}/api/auth/login`, { data: { correo, contrasena: 'Incorrecta-123' } });
    if (respuesta.status() !== 429 || intento >= 2) return respuesta.status();
    await new Promise((resolve) => setTimeout(resolve, 61_000));
  }
}
