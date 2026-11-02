import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function tsx(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((r) => join(dir, String(r)))
    .filter((r) => r.endsWith('.tsx') && !/node_modules|\.next/.test(r));
}
