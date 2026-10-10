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

function adminCredentials() {
  const email = __ENV.K6_ADMIN_EMAIL;
  const password = __ENV.K6_ADMIN_PASSWORD;
  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error('CONFIGURATION ERROR: K6_ADMIN_EMAIL y K6_ADMIN_PASSWORD deben pasarse juntas');
  }
  return { email, password };
}

const SEARCH_QUERY = 'uvg';
const WARMUP_ROUNDS = 3;

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

const MEMBER = 'member';
const ADMIN = 'admin';

const ENDPOINTS = [
  { key: 'project_list', label: 'listado de proyectos', path: () => '/proyectos' },
  { key: 'project_detail', label: 'detalle de proyecto', path: (ids) => `/proyectos/${ids.projectId}` },
  { key: 'my_projects', label: 'mis proyectos', path: () => '/proyectos/mis-proyectos' },
  { key: 'featured_projects', label: 'proyectos destacados', path: () => '/proyectos/destacados' },
  { key: 'project_progress', label: 'avance del proyecto', path: (ids) => `/proyectos/${ids.projectId}/avance` },
  { key: 'board', label: 'tablero', path: (ids) => `/proyectos/${ids.projectId}/tareas` },
  { key: 'task_detail', label: 'detalle de tarea', path: (ids) => `/proyectos/${ids.projectId}/tareas/${ids.taskId}` },
  {
    key: 'task_comments',
    label: 'comentarios de tarea',
    path: (ids) => `/proyectos/${ids.projectId}/tareas/${ids.taskId}/comentarios`,
  },
  { key: 'sprints', label: 'sprints', path: (ids) => `/proyectos/${ids.projectId}/sprints` },
  { key: 'sprint_detail', label: 'detalle de sprint', path: (ids) => `/proyectos/${ids.projectId}/sprints/${ids.sprintId}` },
  { key: 'sprint_analytics', label: 'analítica de sprints', path: (ids) => `/proyectos/${ids.projectId}/sprints/analytics` },
  {
    key: 'sprint_burndown',
    label: 'burndown del sprint',
    path: (ids) => `/proyectos/${ids.projectId}/sprints/${ids.sprintId}/burndown`,
  },
  { key: 'team', label: 'equipo', path: (ids) => `/proyectos/${ids.projectId}/equipo` },
  { key: 'members_summary', label: 'resumen de miembros', path: (ids) => `/proyectos/${ids.projectId}/miembros/resumen` },
  { key: 'roles', label: 'roles del proyecto', path: (ids) => `/proyectos/${ids.projectId}/roles` },
  { key: 'activities', label: 'actividades y asistencia', path: (ids) => `/proyectos/${ids.projectId}/actividades` },
  { key: 'events', label: 'eventos del proyecto', path: (ids) => `/proyectos/${ids.projectId}/eventos` },
  { key: 'bitacora', label: 'bitácora', path: (ids) => `/proyectos/${ids.projectId}/bitacora` },
  { key: 'project_comments', label: 'comentarios del proyecto', path: (ids) => `/comentarios/proyecto/${ids.projectId}` },
  { key: 'chat_project', label: 'chat del proyecto', path: (ids) => `/proyectos/${ids.projectId}/conversaciones` },
  { key: 'chat_dock', label: 'chat global', path: () => '/chats' },
  { key: 'notifications', label: 'notificaciones', path: () => '/notificaciones' },
  { key: 'notifications_unread_count', label: 'conteo de no leídas', path: () => '/notificaciones/mias/conteo-no-leidas' },
  { key: 'catalogs', label: 'catálogos', path: () => '/catalogs' },
  { key: 'me', label: 'sesión del usuario', path: () => '/usuarios/me' },
  { key: 'profile', label: 'perfil', path: () => '/usuarios/me/perfil' },
  { key: 'dashboard', label: 'dashboard', path: () => '/usuarios/me/dashboard' },
  { key: 'my_tasks', label: 'mis tareas', path: () => '/usuarios/me/tareas' },
  { key: 'my_hours', label: 'mis horas', path: () => '/usuarios/me/horas' },
  { key: 'my_applications', label: 'mis postulaciones', path: () => '/postulaciones/mis-postulaciones' },
  { key: 'search', label: 'búsqueda global', path: () => `/busqueda?q=${SEARCH_QUERY}` },
  { key: 'admin_stats', label: 'admin: estadísticas', actor: ADMIN, path: () => '/admin/estadisticas' },
  { key: 'admin_metrics', label: 'admin: métricas', actor: ADMIN, path: () => '/admin/metricas' },
  { key: 'admin_users', label: 'admin: usuarios', actor: ADMIN, path: () => '/admin/usuarios' },
  { key: 'admin_projects', label: 'admin: proyectos activos', actor: ADMIN, path: () => '/admin/proyectos?grupo=activos' },
  { key: 'admin_review_inbox', label: 'admin: bandeja de revisiones', actor: ADMIN, path: () => '/revisiones/admin/bandeja' },
  { key: 'admin_notifications', label: 'admin: notificaciones', actor: ADMIN, path: () => '/notificaciones' },
].map((endpoint) => ({
  actor: MEMBER,
  ...endpoint,
  duration: new Trend(`duration_${endpoint.key}`, true),
  size: new Trend(`size_${endpoint.key}`),
}));

function firstIdFrom(url, headers, field, envName) {
  const res = http.get(url, { headers });
  let body = null;
  try {
    body = res.json();
  } catch (error) {
    body = null;
  }
  const id = Array.isArray(body) && body.length > 0 ? body[0][field] : null;
  if (res.status !== 200 || !Number.isInteger(id)) {
    throw new Error(`CONFIGURATION ERROR: no se pudo resolver ${field} desde ${url} (status ${res.status}); pasa -e ${envName}=<id>`);
  }
  return id;
}

function endpointsFor(data) {
  return ENDPOINTS.filter((endpoint) => endpoint.actor === MEMBER || data.adminToken);
}

function requestFor(endpoint, data) {
  const token = endpoint.actor === ADMIN ? data.adminToken : data.accessToken;
  return {
    url: `${config.baseUrl}${endpoint.path(data.ids)}`,
    params: { headers: authHeaders(token), tags: { endpoint: endpoint.key } },
  };
}

export function setup() {
  const projectId = requirePositiveIntEnv('K6_PROJECT_ID');
  const { accessToken } = login();
  const headers = authHeaders(accessToken);

  const taskId =
    positiveIntEnvOrDefault('K6_TASK_ID', null) ??
    firstIdFrom(`${config.baseUrl}/proyectos/${projectId}/tareas`, headers, 'idTarea', 'K6_TASK_ID');
  const sprintId =
    positiveIntEnvOrDefault('K6_SPRINT_ID', null) ??
    firstIdFrom(`${config.baseUrl}/proyectos/${projectId}/sprints`, headers, 'idSprint', 'K6_SPRINT_ID');

  const admin = adminCredentials();
  const adminToken = admin ? login(admin).accessToken : null;

  const data = { accessToken, adminToken, ids: { projectId, taskId, sprintId } };

  http.cookieJar().clear(config.baseUrl);

  const warmup = endpointsFor(data).map((endpoint) => {
    const { url, params } = requestFor(endpoint, data);
    return ['GET', url, null, { headers: params.headers, tags: { endpoint: 'warmup' } }];
  });
  for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
    http.batch(warmup);
  }

  return data;
}

export default function (data) {
  for (const endpoint of endpointsFor(data)) {
    const { url, params } = requestFor(endpoint, data);
    const res = http.get(url, params);

    endpoint.duration.add(res.timings.duration);
    endpoint.size.add(res.body ? res.body.length : 0);
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
