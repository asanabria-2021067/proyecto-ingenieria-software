import { vi } from 'vitest';

export function fakeProjectTx(tx: unknown) {
  return { run: vi.fn(async (_p: number, _u: number, _op: string, fn: (ctx: unknown) => unknown) => fn({ tx, project: { idProyecto: 1 } })) };
}
