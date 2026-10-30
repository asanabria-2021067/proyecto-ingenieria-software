import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { isAllowedOrigin } from './origin-guard';

// Origen ausente se acepta: k6/e2e no lo envían y sin navegador no hay cookies ambientales.
export function buildAllowRequest(allowed: string) {
  return (req: { headers: { origin?: string } }, cb: (err: string | null | undefined, ok: boolean) => void) =>
    cb(null, isAllowedOrigin(req.headers.origin, allowed));
}

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowed: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: any) {
    return super.createIOServer(port, {
      ...options,
      allowRequest: buildAllowRequest(this.allowed),
    });
  }
}
