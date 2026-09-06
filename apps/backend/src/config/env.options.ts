import * as path from 'node:path';
import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnvironment } from './environment.validation';

/**
 * Foundation única de environment (06 v2 §51.1). La fuente local autoritativa
 * es apps/backend/.env, resuelta desde el directorio del propio módulo: tanto
 * src/config como dist/config están dos niveles por debajo de apps/backend
 * (rootDir src / outDir dist), así que ambos llegan al mismo archivo sin
 * depender de process.cwd(). No se encadena el .env de la raíz del
 * repositorio ni se busca otro archivo si este falta; las variables ya
 * inyectadas en el proceso prevalecen sobre el archivo. Este módulo no lee
 * valores de entorno al importarse y no registra nada por sí mismo.
 */

export const BACKEND_ENV_RELATIVE_PATH = '../../.env';

export function resolveBackendEnvPath(moduleDir: string): string {
  return path.resolve(moduleDir, BACKEND_ENV_RELATIVE_PATH);
}

export const BACKEND_ENV_PATH = resolveBackendEnvPath(__dirname);

const ENVIRONMENTS_WITHOUT_ENV_FILE: ReadonlySet<string> = new Set(['production', 'test']);

export function shouldIgnoreEnvFile(nodeEnv: string | undefined): boolean {
  return nodeEnv !== undefined && ENVIRONMENTS_WITHOUT_ENV_FILE.has(nodeEnv);
}

export type EnvironmentValidator = NonNullable<ConfigModuleOptions['validate']>;

export interface BuildEnvOptionsInput {
  /** Validador central de entorno; por defecto `validateEnvironment`. */
  validate?: EnvironmentValidator;
  /** Solo para pruebas: archivo de fixture en lugar de BACKEND_ENV_PATH. */
  envFilePath?: string;
  /** Solo para pruebas: NODE_ENV simulado en lugar de process.env.NODE_ENV. */
  nodeEnv?: string;
}

export function buildEnvOptions(input: BuildEnvOptionsInput = {}): ConfigModuleOptions {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;

  return {
    isGlobal: true,
    envFilePath: input.envFilePath ?? BACKEND_ENV_PATH,
    ignoreEnvFile: shouldIgnoreEnvFile(nodeEnv),
    validate: input.validate ?? validateEnvironment,
  };
}
