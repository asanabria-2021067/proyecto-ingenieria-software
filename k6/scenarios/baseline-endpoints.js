import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config } from '../config.js';
import { login, authHeaders } from '../helpers/auth.js';

function positiveIntEnvOrDefault(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CONFIGURATION ERROR: ${name} debe ser un entero positivo, se recibió "${raw}"`);
  }
  return parsed;
}

function requirePositiveIntEnv(name) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') {
    throw new Error(`CONFIGURATION ERROR: ${name} is required (pass it with: k6 run -e ${name}=<valor> ...)`);
  }
  return positiveIntEnvOrDefault(name, null);
}

export const options = {
  vus: positiveIntEnvOrDefault('K6_VUS', 1),
  iterations: positiveIntEnvOrDefault('K6_ITERATIONS', 1),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    checks: ['rate==1.0'],
    rate_limited_responses: ['count==0'],
  },
};

const rateLimitedResponses = new Counter('rate_limited_responses');

const ENDPOINTS = [
  { key: 'project_list', label: 'listado de proyectos', path: () => '/proyectos' },
  { key: 'board', label: 'tablero', path: (projectId) => `/proyectos/${projectId}/tareas` },
  { key: 'chat_project', label: 'chat del proyecto', path: (projectId) => `/proyectos/${projectId}/conversaciones` },
  { key: 'chat_dock', label: 'chat global', path: () => '/chats' },
  { key: 'notifications', label: 'notificaciones', path: () => '/notificaciones' },
  { key: 'notifications_unread_count', label: 'conteo de no leídas', path: () => '/notificaciones/mias/conteo-no-leidas' },
].map((endpoint) => ({ ...endpoint, duration: new Trend(`duration_${endpoint.key}`, true) }));

export function setup() {
  const projectId = requirePositiveIntEnv('K6_PROJECT_ID');
  const { accessToken } = login();
  return { accessToken, projectId };
}

export default function (data) {
  const headers = authHeaders(data.accessToken);

  for (const endpoint of ENDPOINTS) {
    const res = http.get(`${config.baseUrl}${endpoint.path(data.projectId)}`, {
      headers,
      tags: { endpoint: endpoint.key },
    });

    endpoint.duration.add(res.timings.duration);
    rateLimitedResponses.add(res.status === 429 ? 1 : 0);

    check(res, {
      [`${endpoint.label}: status es 200`]: (r) => r.status === 200,
      [`${endpoint.label}: respuesta es JSON parseable`]: (r) => {
        try {
          r.json();
          return true;
        } catch (error) {
          return false;
        }
      },
    });
  }
}
