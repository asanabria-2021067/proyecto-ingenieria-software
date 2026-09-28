/**
 * Registro único de las variables que el deploy escribe en el .env de
 * producción (G01-C08 · OWASP25-C030 + VM0-F019). Cada entrada nombra un
 * archivo del repositorio que la consume; el test de contrato comprueba que el
 * consumidor existe y la menciona, así que una variable sin consumidor falla.
 *
 * Flags: `kind: 'flag'` y `defaultValue` igual al literal de
 * `${{ vars.NOMBRE || '<default>' }}` en deploy.yml. El default debe
 * reproducir el comportamiento actual (Release B con cero GitHub Variables).
 * Los gates G04/G06/G07 añaden aquí sus flags.
 */

export type DeployEnvKind = 'secret' | 'config' | 'flag';

export interface DeployEnvEntry {
  kind: DeployEnvKind;
  /** Ruta relativa a la raíz del repositorio que lee la variable. */
  consumer: string;
  /** Solo flags: default literal del workflow. */
  defaultValue?: string;
}

export const DEPLOY_ENV_REGISTRY: Record<string, DeployEnvEntry> = {
  NODE_ENV: { kind: 'config', consumer: 'docker-compose.yml' },
  DB_USER: { kind: 'secret', consumer: 'docker-compose.yml' },
  DB_PASSWORD: { kind: 'secret', consumer: 'docker-compose.yml' },
  DB_NAME: { kind: 'config', consumer: 'docker-compose.yml' },
  DB_PORT: { kind: 'config', consumer: 'apps/backend/docker-compose.yml' },
  JWT_SECRET: { kind: 'secret', consumer: 'apps/backend/src/config/jwt-secret.ts' },
  JWT_REFRESH_SECRET: { kind: 'secret', consumer: 'apps/backend/src/auth/auth.service.ts' },
  NEXT_PUBLIC_API_URL: { kind: 'config', consumer: 'apps/frontend/lib/api/client.ts' },
  NEXT_PUBLIC_API_PREFIX: { kind: 'config', consumer: 'apps/frontend/lib/api/client.ts' },
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: { kind: 'config', consumer: 'apps/frontend/lib/cloudinary.ts' },
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: { kind: 'config', consumer: 'apps/frontend/lib/cloudinary.ts' },
  FRONTEND_URL: { kind: 'config', consumer: 'apps/backend/src/config/environment.validation.ts' },
  BACKEND_IMAGE: { kind: 'config', consumer: 'docker-compose.yml' },
  FRONTEND_IMAGE: { kind: 'config', consumer: 'docker-compose.yml' },
  // G04-C08 (OWASP25-C021 + D2): 0 = comportamiento actual (no confiar en XFF).
  TRUST_PROXY_HOPS: { kind: 'flag', consumer: 'apps/backend/src/config/environment.validation.ts', defaultValue: '0' },
  // G04-C10 (OWASP25-C021 + P5/T19): 0.0.0.0 = exposición actual; 127.0.0.1 = solo detrás de nginx.
  BACKEND_BIND: { kind: 'flag', consumer: 'docker-compose.yml', defaultValue: '0.0.0.0' },
  FRONTEND_BIND: { kind: 'flag', consumer: 'docker-compose.yml', defaultValue: '0.0.0.0' },
};

/** Variables del paso de transferencia que solo sirven para la conexión SSH (no van al .env). */
export const DEPLOY_TRANSPORT_ONLY = ['SSH_PRIVATE_KEY', 'SERVER_IP', 'SERVER_USER'];
