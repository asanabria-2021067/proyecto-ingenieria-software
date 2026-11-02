// MEJ-39 - Escenario READ-ONLY de las dos vistas de horas con carga incremental:
//   vista central admin:        GET /admin/horas-semestre?limit=&cursor=
//     (AdminHorasSemestreController, rol administrador)
//   estudiantes de asociacion:  GET /asociaciones/:idAsociacion/estudiantes?limit=&cursor=
//     (AssociationDashboardController, JuntaGuard)
// Cada vista se recorre pagina a pagina siguiendo `siguienteCursor` (maximo K6_MAX_PAGINAS).
//
// Variables: K6_ADMIN_EMAIL / K6_ADMIN_PASSWORD (obligatorias), K6_ASOC_ID /
// K6_JUNTA_EMAIL / K6_JUNTA_PASSWORD (opcionales: sin ellas solo se mide la vista admin).
// No crea datos: usa cuentas que ya existen en el entorno objetivo.

import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { config, requireEnv } from '../config.js';
import { login, authHeaders } from '../helpers/auth.js';

function enteroPositivo(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`CONFIGURATION ERROR: ${name} debe ser un entero positivo, se recibio "${raw}"`);
  return n;
}

const LIMIT = enteroPositivo('K6_LIMIT', 25);
const MAX_PAGINAS = enteroPositivo('K6_MAX_PAGINAS', 5);
const ASOC_ID = __ENV.K6_ASOC_ID ? enteroPositivo('K6_ASOC_ID', 1) : null;

const paginaAdmin = new Trend('horas_admin_pagina_ms', true);
const paginaAsociacion = new Trend('horas_asociacion_pagina_ms', true);

export const options = {
  vus: enteroPositivo('K6_VUS', 1),
  iterations: enteroPositivo('K6_ITERATIONS', 1),
  thresholds: {
    checks: ['rate==1.0'],
    horas_admin_pagina_ms: ['p(95)<2000'],
    horas_asociacion_pagina_ms: ['p(95)<2000'],
  },
};

export function setup() {
  const admin = login({ email: requireEnv('K6_ADMIN_EMAIL'), password: requireEnv('K6_ADMIN_PASSWORD') });
  const junta =
    ASOC_ID !== null
      ? login({ email: requireEnv('K6_JUNTA_EMAIL'), password: requireEnv('K6_JUNTA_PASSWORD') })
      : null;
  return { admin: admin.accessToken, junta: junta ? junta.accessToken : null };
}

function recorrer(nombre, url, token, trend) {
  let cursor = null;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const res = http.get(`${url}?limit=${LIMIT}${cursor !== null ? `&cursor=${cursor}` : ''}`, { headers: authHeaders(token) });
    trend.add(res.timings.duration);
    let body = null;
    const ok = check(res, {
      [`${nombre}: status 200`]: (r) => r.status === 200,
      [`${nombre}: JSON con filas y siguienteCursor`]: (r) => {
        try {
          body = r.json();
          return Array.isArray(body.filas) && 'siguienteCursor' in body;
        } catch (e) {
          return false;
        }
      },
      [`${nombre}: respeta el limite`]: () => body !== null && body.filas.length <= LIMIT,
    });
    if (!ok || body === null || body.siguienteCursor === null) return;
    cursor = body.siguienteCursor;
  }
}

export default function (data) {
  recorrer('vista central admin', `${config.baseUrl}/admin/horas-semestre`, data.admin, paginaAdmin);
  if (data.junta) {
    recorrer('estudiantes de asociacion', `${config.baseUrl}/asociaciones/${ASOC_ID}/estudiantes`, data.junta, paginaAsociacion);
  }
}
