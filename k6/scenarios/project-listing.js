// K2 — Escenario READ-ONLY: baseline de listado/navegación de proyectos.
//
// Contrato real inspeccionado (no asumido):
//   listado:  GET  {config.baseUrl}/proyectos            (ProjectsController.findAll,
//             apps/backend/src/projects/projects.controller.ts:28-53 — sin guard,
//             sin ?page devuelve un array plano `ProyectoListItemDTO[]`, ver
//             ProjectsService.findAll/proyectoListSelect en projects.service.ts)
//   detalle:  GET  {config.baseUrl}/proyectos/{idProyecto} (ProjectsController.findOne,
//             projects.controller.ts:78-81 — sin guard, ProyectoDetalleDTO)
//   frontend real que usa exactamente estas rutas: apps/frontend/lib/services/projects.ts
//   (getProjects -> `/proyectos${params}`, getProjectById -> `/proyectos/${id}`).
//
// No requiere JWT (ninguna de las dos rutas tiene @UseGuards), pero el escenario
// igual autentica una vez en setup() vía K1 para representar navegación de un
// usuario con sesión real y reutilizar la infraestructura común sin duplicar login.
//
// Este script NO escribe nada: solo GET. Sin efectos secundarios, repetible.

import http from 'k6/http';
import { check } from 'k6';
import { config } from '../config.js';
import { login, authHeaders } from '../helpers/auth.js';

// Selección segura por defecto (ver §6 de la tarea K2): 1 VU / 1 iteración.
// K3 puede escalar esto vía -e K6_VUS=/-e K6_ITERATIONS= sin tocar el flujo.
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

/**
 * K6_PROJECT_ID (opcional): si se proporciona, se usa directamente para el
 * detalle. Se valida como entero positivo — nunca se dispara un request con
 * "undefined"/NaN. Si no se define, el proyecto se selecciona del propio
 * listado (primer elemento con `idProyecto` real, nunca una propiedad
 * inventada).
 */
function parseOptionalProjectIdEnv() {
  const raw = __ENV.K6_PROJECT_ID;
  if (raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `CONFIGURATION ERROR: K6_PROJECT_ID debe ser un entero positivo, se recibió "${raw}"`,
    );
  }
  return parsed;
}

export function setup() {
  // Login único en setup(): el objetivo medido es navegación de proyectos,
  // no autenticación — evita loguear en cada iteración/VU.
  const { accessToken } = login();
  return { accessToken };
}

export default function (data) {
  const headers = authHeaders(data.accessToken);

  const listRes = http.get(`${config.baseUrl}/proyectos`, { headers });

  const listStatusOk = check(listRes, {
    'project list: status es 200': (r) => r.status === 200,
  });

  let listBody = null;
  const listParseable = check(listRes, {
    'project list: respuesta es JSON parseable': (r) => {
      try {
        listBody = r.json();
        return true;
      } catch (error) {
        return false;
      }
    },
  });

  check(listBody, {
    'project list: shape es un arreglo': (body) => Array.isArray(body),
  });

  if (!listStatusOk || !listParseable || !Array.isArray(listBody)) {
    // No se puede navegar de forma segura sin un listado válido — el check
    // ya quedó registrado como fallo, no hace falta lanzar un request de
    // detalle contra un id inexistente.
    return;
  }

  const explicitProjectId = parseOptionalProjectIdEnv();
  const projectId = explicitProjectId ?? (listBody.length > 0 ? listBody[0].idProyecto : null);

  if (projectId === null || projectId === undefined) {
    // Ningún K6_PROJECT_ID y listado vacío: no hay proyecto real para
    // navegar. Se marca como check fallido explícito en vez de pedir
    // `/proyectos/undefined`.
    check(null, {
      'project detail: proyecto disponible para navegar (K6_PROJECT_ID o listado no vacío)': () => false,
    });
    return;
  }

  const detailRes = http.get(`${config.baseUrl}/proyectos/${projectId}`, { headers });

  const detailStatusOk = check(detailRes, {
    'project detail: status es 200': (r) => r.status === 200,
  });

  if (!detailStatusOk) return;

  let detailBody = null;
  const detailParseable = check(detailRes, {
    'project detail: respuesta es JSON parseable': (r) => {
      try {
        detailBody = r.json();
        return true;
      } catch (error) {
        return false;
      }
    },
  });

  if (!detailParseable) return;

  check(detailBody, {
    'project detail: idProyecto coincide con el solicitado': (body) => body && body.idProyecto === projectId,
  });
}
