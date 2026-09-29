/**
 * G05 (OWASP25-C037 + C021): origen de un evento de seguridad.
 *
 * La IP es SIEMPRE `req.ip`: nunca la cadena X-Forwarded-For cruda. `ipTrusted`
 * refleja el estado REAL de Express (`trust proxy`, fijado por
 * TRUST_PROXY_HOPS en G04):
 * - hops 0 (default): `req.ip` es la dirección del socket, es decir el proxy
 *   o la red del contenedor, no el cliente → false;
 * - hops > 0: `req.ip` es el cliente que informa el proxy confiable → true.
 *   Solo es una IP de cliente verificada una vez que el backend no tiene
 *   puertos públicos propios (P6); antes, un cliente que llega directo al
 *   puerto podría elegirla. Por eso el valor por defecto es false.
 */
export interface SecurityRequestContext {
  ip: string | null;
  ipTrusted: boolean;
}

export interface RequestLike {
  ip?: string;
  app?: { get(setting: string): unknown };
}

export function securityRequestContext(req: RequestLike): SecurityRequestContext {
  const trustProxy = req.app?.get('trust proxy');
  return {
    ip: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
    ipTrusted: typeof trustProxy === 'number' && trustProxy > 0,
  };
}
