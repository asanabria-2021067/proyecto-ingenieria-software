import type { INestApplication } from '@nestjs/common';

/**
 * G04 (OWASP25-C021 + D2): aplica TRUST_PROXY_HOPS a Express. Con 0 (default)
 * no toca nada: `req.ip` es la dirección del socket y X-Forwarded-For se
 * ignora, como hoy. Con N > 0 Express toma como cliente la dirección que
 * reportan los N proxies más cercanos; activarlo en producción (1 = nginx del
 * host) es una decisión del administrador una vez cerrados los puertos
 * públicos de la app.
 */
export function applyTrustProxy(app: INestApplication, hops: number): void {
  if (hops > 0) {
    const express = app.getHttpAdapter().getInstance() as { set: (setting: string, value: unknown) => void };
    express.set('trust proxy', hops);
  }
}
