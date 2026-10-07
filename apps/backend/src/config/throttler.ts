export const THROTTLER_DISABLED_VARIABLE = 'THROTTLER_DISABLED';

export function isThrottlerDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env[THROTTLER_DISABLED_VARIABLE] === 'true';
}
