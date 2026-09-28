import type { HelmetOptions } from 'helmet';

/**
 * G06 (NBD-1 + C008): HSTS de la API fijado explícitamente con el valor que ya
 * emitía Helmet por defecto: un año, includeSubDomains, SIN preload. Así un
 * cambio de default de Helmet o de esta configuración no pasa desapercibido.
 * Nunca preload ni max-age=0: un HSTS ya emitido no se "deshace" desde el
 * servidor (el navegador lo recuerda hasta que caduca).
 * El resto de Helmet (incluida la CSP de la API) sigue con sus defaults.
 */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

export const API_HELMET_OPTIONS: HelmetOptions = {
  strictTransportSecurity: {
    maxAge: HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true,
    preload: false,
  },
};
