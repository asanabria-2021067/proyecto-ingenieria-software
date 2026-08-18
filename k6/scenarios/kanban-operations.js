// K2 — Escenario MUTABLE: operaciones reales del Kanban (crear tarea, asignar,
// cerrar tramo) bajo el contrato actual de Sprint ACTIVO + ProjectWriteGuard.
//
// EFECTOS SECUNDARIOS: este script escribe datos reales (crea una tarea, una
// asignación y un registro de avance por iteración, y por defecto marca esa
// tarea como HECHO). Está pensado para un backend de TESTING con datos de
// fixture, nunca para producción. Requiere que K6_PROJECT_ID apunte a un
// proyecto donde el usuario K6 (K6_USER_EMAIL/K6_USER_PASSWORD) sea líder,
// tenga participación ACTIVO, y el proyecto tenga un Sprint en estado ACTIVO
// (TasksAuthorizationService.assertCanCreateTask/assertCanAssignTask exigen
// liderazgo; ProjectWriteGuard exige Sprint ACTIVO en cada mutación).
//
// Contrato real inspeccionado (no asumido):
//   crear tarea:    POST {baseUrl}/proyectos/{projectId}/tareas
//                   (TasksController.create, tasks.controller.ts:47-56, tras
//                   ProjectWriteGuard; DTO real: CreateTaskDto — tituloTarea,
//                   fechaLimite "YYYY-MM-DD" estrictamente futura, prioridad
//                   enum BAJA|MEDIA|ALTA; idHito/idRolProyecto/idUsuarioAsignado
//                   quedan omitidos a propósito, ver nota más abajo)
//   asignar:        POST {baseUrl}/proyectos/{projectId}/tareas/{taskId}/asignar
//                   (tasks.controller.ts:91-101, DTO real AssignTaskDto: { idUsuario })
//   cerrar tramo:   POST {baseUrl}/proyectos/{projectId}/tareas/{taskId}/asignaciones/{assignmentId}/cerrar
//                   (tasks.controller.ts:114-129, DTO real CloseAssignmentDto:
//                   { horasReales, contenidoAvance (>=200 chars), marcarComoHecha? })
//
// Nota de diseño (idRolProyecto/idUsuarioAsignado en creación): se omiten
// deliberadamente. TasksService.closeAssignment exige que sea el propio
// usuario asignado quien cierre su tramo (tasks.service.ts:991-993: "Solo el
// usuario asignado puede cerrar este tramo"), y tanto crear como asignar
// tareas son operaciones exclusivas del líder (tasks-authorization.service.ts
// assertCanCreateTask/assertCanAssignTask). La única forma de ejercitar el
// flujo completo (crear -> asignar -> cerrar) con la ÚNICA identidad que K1
// expone es que el líder se autoasigne la tarea. Al omitir idRolProyecto la
// tarea queda sin rol asociado, así que assertUserAssignableToProject solo
// exige participación ACTIVO en el proyecto (tasks-relations.service.ts:134-138),
// no un rol específico — reduce el fixture necesario a un único proyecto +
// líder con participación ACTIVO, sin tener que provisionar además un rol
// compatible.

import http from 'k6/http';
import { check } from 'k6';
import { config } from '../config.js';
import { login, authHeaders } from '../helpers/auth.js';

// Fixture mutable: por diseño, cada iteración crea una tarea NUEVA y única
// (estrategia A de la guía, §16 de la tarea) para nunca competir por el mismo
// idTarea/idAsignacion entre VUs. Por eso el default es, de todas formas, el
// más seguro posible: 1 VU / 1 iteración.
function positiveIntEnvOrDefault(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CONFIGURATION ERROR: ${name} debe ser un entero positivo, se recibió "${raw}"`);
  }
  return parsed;
}

export const options = {
  vus: positiveIntEnvOrDefault('K6_VUS', 1),
  iterations: positiveIntEnvOrDefault('K6_ITERATIONS', 1),
};

function requirePositiveIntEnv(name) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') {
    throw new Error(`CONFIGURATION ERROR: ${name} is required (pass it with: k6 run -e ${name}=<valor> ...)`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CONFIGURATION ERROR: ${name} debe ser un entero positivo, se recibió "${raw}"`);
  }
  return parsed;
}

// fechaLimite real exige "YYYY-MM-DD" estrictamente posterior al día de hoy
// en America/Guatemala (IsFutureCalendarDateConstraint,
// apps/backend/src/tasks/dto/validators/is-future-calendar-date.validator.ts).
// +14 días desde "ahora" en UTC es holgadamente futuro en cualquier zona
// horaria real del backend/CI, sin depender de Intl/timezone en el runtime k6.
function futureCalendarDate(daysAhead) {
  const now = new Date();
  const future = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead));
  const yyyy = future.getUTCFullYear();
  const mm = String(future.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(future.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// CloseAssignmentDto.contenidoAvance exige MinLength(200) real (ver
// close-assignment.dto.ts:11). Texto estable, muy por encima del mínimo.
const PROGRESS_NOTE = 'Registro de avance generado por el escenario k6 kanban-operations (K2) para validar el cierre real de tramo bajo ProjectWriteGuard y Sprint ACTIVO. '.repeat(2);

export function setup() {
  const projectId = requirePositiveIntEnv('K6_PROJECT_ID');
  // closeAssignment solo permite que el usuario asignado cierre su propio
  // tramo (tasks.service.ts:991-993). login() (K1) solo devuelve tokens, no
  // el id numérico del usuario autenticado, así que K2 lo requiere de forma
  // explícita para poder autoasignarse la tarea con el mismo id real.
  const userId = requirePositiveIntEnv('K6_USER_ID');
  const { accessToken } = login();
  return { accessToken, projectId, userId };
}

export default function (data) {
  const headers = authHeaders(data.accessToken);
  const { projectId, userId } = data;
  const tasksBase = `${config.baseUrl}/proyectos/${projectId}/tareas`;

  const createBody = {
    tituloTarea: `k6-kanban ${__VU}-${__ITER}-${Date.now()}`,
    fechaLimite: futureCalendarDate(14),
    prioridad: 'MEDIA',
  };

  const createRes = http.post(tasksBase, JSON.stringify(createBody), { headers });

  if (createRes.status === 409) {
    // ProjectWriteGuard (no Sprint ACTIVO / Sprint EN_FINALIZACION) o
    // cualquier otro conflicto de dominio: configuración inválida del
    // fixture para este escenario, no un fallo de la operación en sí.
    // No se sortea el guard ni se reintenta silenciosamente.
    check(createRes, {
      'kanban: create task — CONFIGURATION ERROR (fixture/Sprint no ACTIVO), ver body': () => false,
    });
    return;
  }

  const createOk = check(createRes, {
    'kanban: create task status es 201': (r) => r.status === 201,
  });
  if (!createOk) return;

  let task = null;
  const createParseable = check(createRes, {
    'kanban: create task respuesta parseable': (r) => {
      try {
        task = r.json();
        return true;
      } catch (error) {
        return false;
      }
    },
  });
  if (!createParseable || !task || !task.idTarea) return;

  const taskId = task.idTarea;
  const assignRes = http.post(
    `${tasksBase}/${taskId}/asignar`,
    JSON.stringify({ idUsuario: userId }),
    { headers },
  );

  if (assignRes.status === 409) {
    check(assignRes, {
      'kanban: assign — CONFIGURATION ERROR (fixture/Sprint no ACTIVO), ver body': () => false,
    });
    return;
  }

  const assignOk = check(assignRes, {
    'kanban: assign status es 200': (r) => r.status === 200,
  });
  if (!assignOk) return;

  let assignedTask = null;
  const assignParseable = check(assignRes, {
    'kanban: assign respuesta parseable': (r) => {
      try {
        assignedTask = r.json();
        return true;
      } catch (error) {
        return false;
      }
    },
  });
  if (!assignParseable || !assignedTask) return;

  // El contrato HTTP público no expone un "assignmentId" plano: se deriva de
  // `asignaciones` (activas, desasignadaEn: null — TASK_SELECT en
  // tasks.service.ts) buscando la fila del usuario recién asignado, nunca
  // una propiedad inventada.
  const asignaciones = Array.isArray(assignedTask.asignaciones) ? assignedTask.asignaciones : [];
  const activeAssignment = asignaciones.find((a) => a.idUsuario === userId);

  const assignmentFound = check(activeAssignment, {
    'kanban: asignación activa presente en la respuesta': (a) => !!a && !!a.idAsignacion,
  });
  if (!assignmentFound) return;

  const closeRes = http.post(
    `${tasksBase}/${taskId}/asignaciones/${activeAssignment.idAsignacion}/cerrar`,
    JSON.stringify({
      horasReales: 2,
      contenidoAvance: PROGRESS_NOTE,
      marcarComoHecha: true,
    }),
    { headers },
  );

  if (closeRes.status === 409) {
    check(closeRes, {
      'kanban: close assignment — CONFIGURATION ERROR (fixture/Sprint no ACTIVO), ver body': () => false,
    });
    return;
  }

  check(closeRes, {
    'kanban: close assignment status es 200': (r) => r.status === 200,
  });
}
