export function rutaDePruebaActiva(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.E2E_PRODUCTION_SERVER === '1';
}
