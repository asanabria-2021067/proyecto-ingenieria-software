// K2 (+ K2.1) — Escenario Socket.IO: conexión real al namespace de
// notificaciones y, opcionalmente, disparo seguro y VERIFICABLE de
// SPRINT_FINALIZATION_STARTED con dos actores reales distintos.
//
// =====================================================================
// PROTOCOLO — Socket.IO NO es un WebSocket plano (ver §25 de la tarea K2).
// =====================================================================
// Backend real: `socket.io` ^4.8.3 (apps/backend/package.json), gateway en
// apps/backend/src/notifications/notifications.gateway.ts:
//   - namespace real: '/notifications' (WebSocketGateway({ namespace: '/notifications' }))
//   - sin adapter/path custom en main.ts -> path Socket.IO por defecto: /socket.io/
//   - auth real: `client.handshake.auth.token` (fallback a header Authorization
//     Bearer, notifications.gateway.ts:30) — igual que el cliente real del
//     frontend, apps/frontend/lib/hooks/useRealtimeNotifications.ts:22-25:
//     `io(\`\${wsUrl}/notifications\`, { auth: { token }, transports: [...] })`.
//   - al conectar, el gateway hace `client.join(\`user:\${userId}\`)`
//     automáticamente (notifications.gateway.ts:42) — NO existe un evento de
//     "join room" explícito que el cliente deba emitir; el servidor te mete
//     a tu room solo con un JWT válido en el handshake.
//   - eventos reales emitidos: 'connected' (ack informal tras auth OK, línea
//     45), 'notification' (genérico, notifyUser/notifyUsers), y
//     'SPRINT_FINALIZATION_STARTED' (A4, notifySprintFinalizationStarted,
//     líneas 73-80) con payload real `{ projectId, sprintId }`.
//
// No existe ninguna extensión k6 de Socket.IO en este repo/toolchain (no
// package.json de k6, no binarios xk6) — no se introduce ninguna (prohibido
// por §26). Estrategia elegida (B, §27): reproducir el framing mínimo
// Engine.IO v4 + Socket.IO v5 (protocolo real de socket.io ^4.x) sobre la
// API WebSocket OFICIAL y estable de k6, `k6/ws` (no experimental, no
// extensión de terceros).
//
// Framing implementado (y SOLO el necesario):
//   Engine.IO packet = primer carácter del mensaje de texto:
//     '0' OPEN    (servidor->cliente, único al abrir; payload JSON con sid)
//     '1' CLOSE
//     '2' PING    (servidor->cliente en protocolo v4 — el servidor pinguea)
//     '3' PONG    (cliente->servidor, respuesta obligatoria al PING)
//     '4' MESSAGE (envuelve un packet Socket.IO en el resto del string)
//   Socket.IO packet (tras el '4' de Engine.IO) = siguiente carácter:
//     '0' CONNECT       (cliente->servidor: "40<nsp>,<authJSON>"; también
//                        servidor->cliente como ACK de conexión al namespace)
//     '1' DISCONNECT
//     '2' EVENT         ("2<nsp>,[\"evento\",payload]")
//     '4' CONNECT_ERROR
//   El namespace ('/notifications', no default) se antepone al payload
//   separado por coma en las capas CONNECT/EVENT, tal como especifica el
//   protocolo Socket.IO v5 para namespaces no-default.
//
// Conexión DIRECTA por WebSocket (sin upgrade previo desde polling): se abre
// la conexión ya con `?EIO=4&transport=websocket` desde el inicio (sin
// `sid`) — el servidor Engine.IO acepta esto como una sesión nueva y emite
// el OPEN packet directamente sobre el WebSocket. No se implementa el
// transporte de polling porque el cliente real tampoco lo necesita para
// completar la conexión (transports: ['websocket', 'polling'] intenta
// websocket primero cuando está disponible).
//
// =====================================================================
// K2.1 — DOS IDENTIDADES REALES PARA EL MODO TRIGGER
// =====================================================================
// NotificationsService.notifySprintFinalizationStarted excluye
// EXPLÍCITAMENTE al autor de finalizeSprint de los destinatarios del evento
// (`idUsuario: { not: autorId }`, apps/backend/src/notifications/
// notifications.service.ts:242). Ese comportamiento es correcto y NO se
// toca. La consecuencia para el escenario de carga es que, para observar
// una recepción real de SPRINT_FINALIZATION_STARTED, la conexión que
// escucha y el actor que finaliza el Sprint deben ser DOS usuarios
// distintos:
//
//   LÍDER    (K6_USER_EMAIL / K6_USER_PASSWORD, mismas variables K1 de
//             siempre, vía login() sin argumentos) — llama finalizeSprint.
//   LISTENER (K6_SOCKET_LISTENER_EMAIL / K6_SOCKET_LISTENER_PASSWORD,
//             nuevas, vía login({email, password}) — auth.js extendido de
//             forma retrocompatible en K2.1) — abre y escucha el socket.
//             Debe tener ParticipacionProyecto ACTIVO en K6_PROJECT_ID
//             (no lo crea este script — fixture del ambiente, §14). Si no
//             participa, el síntoma esperado es timeout sin evento, que
//             debe diagnosticarse como fixture inválido, no como bug de
//             Socket.IO.
//
// Sin trigger (K6_TRIGGER_SPRINT_FINALIZATION!=="true") el escenario sigue
// funcionando como una conexión de solo lectura con la identidad estándar
// K6_USER_* — no exige las variables de listener, que no hacen falta para
// simplemente conectar y observar tráfico.
//
// SIDE EFFECTS: sin trigger, este script es de solo lectura/conexión — no
// muta nada. Con el trigger habilitado, llama una única vez a
// finalizeSprint (con el token del LÍDER) sobre un Sprint de testing ya
// preparado (nunca crea el fixture, nunca marca tareas como HECHO para
// forzarlo, nunca llama al gateway directamente). No usar contra producción.

import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';
import { config } from '../config.js';
import { login, authHeaders } from '../helpers/auth.js';

const NAMESPACE = '/notifications';
const NOTIFICATION_EVENT = 'notification';
const SPRINT_FINALIZATION_EVENT = 'SPRINT_FINALIZATION_STARTED';
const CONNECTED_EVENT = 'connected';

// Trigger seguro por defecto: SIEMPRE 1 VU / 1 iteración, sin excepción y
// sin lectura de K6_VUS/K6_ITERATIONS — a diferencia de los otros dos
// escenarios de K2. Esto es intencional (§37/§18 K2.1): nunca debe existir
// una forma de escalar este archivo a múltiples VUs finalizando el mismo
// Sprint. Si K3 necesita medir conexiones Socket.IO concurrentes, debe
// hacerlo con el trigger deshabilitado (seguro de paralelizar); escalar el
// trigger requiere un script separado, deliberadamente fuera de alcance de
// K2/K2.1.
export const options = {
  vus: 1,
  iterations: 1,
};

const TRIGGER_ENABLED = __ENV.K6_TRIGGER_SPRINT_FINALIZATION === 'true';

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

function requireEnvValue(name) {
  const raw = __ENV[name];
  if (!raw) {
    throw new Error(`CONFIGURATION ERROR: ${name} is required (pass it with: k6 run -e ${name}=<valor> ...)`);
  }
  return raw;
}

function positiveIntEnvOrDefault(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`CONFIGURATION ERROR: ${name} debe ser un entero positivo, se recibió "${raw}"`);
  }
  return parsed;
}

// Ventana total de la conexión (si no hay trigger, o tras esperar el evento)
// y timeout de espera específico del evento — ambos finitos y configurables,
// nunca presentados como SLA (§39).
const CONNECTION_WINDOW_MS = positiveIntEnvOrDefault('K6_SOCKET_WINDOW_MS', 20000);
const EVENT_WAIT_TIMEOUT_MS = positiveIntEnvOrDefault('K6_SOCKET_EVENT_TIMEOUT_MS', 15000);

// config.baseUrl (K1) = `${host}/api` (main.ts: app.setGlobalPrefix('api')).
// Socket.IO NO vive bajo ese prefijo: el cliente real
// (useRealtimeNotifications.ts:19-22) conecta contra el host puro
// (NEXT_PUBLIC_API_URL, sin '/api') + '/notifications'. Se deriva el origin
// WS quitando el sufijo '/api' de config.baseUrl de forma explícita, sin
// tocar K1.
function deriveWsOrigin(baseUrl) {
  const withoutApiSuffix = baseUrl.replace(/\/api\/?$/, '');
  return withoutApiSuffix.replace(/^http/, 'ws');
}

export function setup() {
  if (TRIGGER_ENABLED && __VU > 1) {
    // Defensa adicional además de options fijo en 1/1: si en el futuro
    // alguien fuerza VUs por fuera de `options` (p. ej. scenarios custom),
    // esto sigue evitando una doble finalización del mismo Sprint.
    throw new Error('CONFIGURATION ERROR: el trigger de finalización solo puede ejecutarse con 1 VU');
  }

  if (!TRIGGER_ENABLED) {
    // Modo sin trigger: conexión de solo lectura con la identidad estándar
    // K1 — no exige variables de listener, que no hacen falta aquí.
    const { accessToken } = login();
    return {
      connectAccessToken: accessToken,
      leaderAccessToken: null,
      projectId: null,
      sprintId: null,
    };
  }

  // Modo trigger: dos identidades reales, obligatorias, distintas (§7/§8 K2.1).
  const projectId = requirePositiveIntEnv('K6_PROJECT_ID');
  const sprintId = requirePositiveIntEnv('K6_SPRINT_ID');
  const listenerEmail = requireEnvValue('K6_SOCKET_LISTENER_EMAIL');
  const listenerPassword = requireEnvValue('K6_SOCKET_LISTENER_PASSWORD');
  const leaderEmail = requireEnvValue('K6_USER_EMAIL');

  if (listenerEmail === leaderEmail) {
    // Falla ANTES de generar tráfico mutable — el backend excluye
    // correctamente al autor de SPRINT_FINALIZATION_STARTED, así que la
    // misma identidad para líder y listener jamás podría recibir el evento
    // (exactamente el defecto de fixture que motivó K2.1). Sin exponer
    // contraseñas en el mensaje.
    throw new Error(
      'CONFIGURATION ERROR: Socket listener must be different from the sprint finalization actor ' +
        'because the backend excludes the author from SPRINT_FINALIZATION_STARTED recipients ' +
        '(K6_SOCKET_LISTENER_EMAIL must differ from K6_USER_EMAIL).',
    );
  }

  // A. leader login — identidad estándar K1, sin cambios.
  const leaderSession = login();
  // B. listener login — identidad explícita nueva, mismo código HTTP único
  // de auth.js (login() extendido de forma retrocompatible en K2.1).
  const listenerSession = login({ email: listenerEmail, password: listenerPassword });

  return {
    connectAccessToken: listenerSession.accessToken,
    leaderAccessToken: leaderSession.accessToken,
    projectId,
    sprintId,
  };
}

export default function (data) {
  const wsOrigin = deriveWsOrigin(config.baseUrl);
  const url = `${wsOrigin}/socket.io/?EIO=4&transport=websocket`;

  const state = {
    engineIoOpen: false,
    namespaceConnectAckReceived: false,
    connectedEventReceived: false,
    notificationReceived: false,
    sprintFinalizationReceived: false,
    sprintFinalizationPayload: null,
    triggerCalled: false,
    triggerHttpStatus: null,
    triggerConfigurationError: false,
  };

  function sendSocketIoConnect(socket) {
    // C/D del flujo (§13 K2.1): el CONNECT packet SIEMPRE transporta el
    // token de conexión resuelto en setup() — el LISTENER cuando hay
    // trigger, la identidad estándar cuando no lo hay. Nunca el del líder.
    // Mismo mecanismo real que el cliente: `auth: { token }` (gateway lee
    // `client.handshake.auth.token`).
    const authPayload = JSON.stringify({ token: data.connectAccessToken });
    socket.send(`40${NAMESPACE},${authPayload}`);
  }

  function callFinalizeTrigger(socket) {
    if (state.triggerCalled) return; // una única vez (§37).
    state.triggerCalled = true;
    // F del flujo (§13 K2.1): finalizeSprint SIEMPRE con el token del
    // LÍDER — nunca el del listener — para demostrar separación real de
    // actores (§12).
    const headers = authHeaders(data.leaderAccessToken);
    const finalizeUrl = `${config.baseUrl}/proyectos/${data.projectId}/sprints/${data.sprintId}/finalizar`;
    const res = http.post(finalizeUrl, null, { headers });
    state.triggerHttpStatus = res.status;
    if (res.status === 409) {
      // Sprint no ACTIVO, tareas pendientes, o cualquier otro conflicto de
      // dominio: fixture inválido para este escenario, no un fallo del
      // transporte Socket.IO (§36 — no se reporta como fallo de Socket.IO).
      state.triggerConfigurationError = true;
    }
  }

  function handleSocketIoPacket(raw, socket) {
    const sioType = raw.charAt(0);
    let rest = raw.slice(1);
    if (rest.indexOf(NAMESPACE) === 0) {
      rest = rest.slice(NAMESPACE.length);
      if (rest.charAt(0) === ',') rest = rest.slice(1);
    }

    if (sioType === '0') {
      // CONNECT ack: el namespace confirmó la conexión.
      state.namespaceConnectAckReceived = true;
      return;
    }

    if (sioType === '4') {
      // CONNECT_ERROR — el namespace rechazó la conexión.
      return;
    }

    if (sioType === '2' && rest.length > 0) {
      let parsed;
      try {
        parsed = JSON.parse(rest);
      } catch (error) {
        return;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const eventName = parsed[0];
      const payload = parsed.length > 1 ? parsed[1] : undefined;

      if (eventName === CONNECTED_EVENT) {
        state.connectedEventReceived = true;
        // E del flujo (§13 K2.1): recién aquí la autenticación quedó
        // confirmada por el gateway real (notifications.gateway.ts:44-45) y
        // el LISTENER está realmente escuchando en su room
        // `user:{idUsuario}` — es el punto correcto para disparar
        // finalizeSprint (nunca antes de estar escuchando).
        if (TRIGGER_ENABLED) {
          callFinalizeTrigger(socket);
        }
      } else if (eventName === NOTIFICATION_EVENT) {
        // Reconocimiento separado y explícito de 'notification': nunca se
        // acepta como sustituto de SPRINT_FINALIZATION_STARTED (§15/§27).
        state.notificationReceived = true;
      } else if (eventName === SPRINT_FINALIZATION_EVENT) {
        state.sprintFinalizationReceived = true;
        state.sprintFinalizationPayload = payload;
      }
    }
  }

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Nada que enviar todavía: el protocolo exige esperar el OPEN de
      // Engine.IO (packet '0') antes de mandar el CONNECT de Socket.IO.
    });

    socket.on('message', (msg) => {
      if (typeof msg !== 'string' || msg.length === 0) return;
      const eioType = msg.charAt(0);

      if (eioType === '0') {
        state.engineIoOpen = true;
        sendSocketIoConnect(socket);
        return;
      }

      if (eioType === '2') {
        // Engine.IO PING (servidor->cliente en protocolo v4): responder PONG
        // inmediatamente o el servidor cierra la conexión por pingTimeout.
        socket.send('3');
        return;
      }

      if (eioType === '4') {
        handleSocketIoPacket(msg.slice(1), socket);
        return;
      }

      // '1' (CLOSE) u otros: sin acción — el cierre real se maneja vía
      // evento 'close' del socket k6.
    });

    socket.on('error', (e) => {
      // Logging mínimo, sin datos sensibles (§40): solo la fase.
      console.warn(`socket-io scenario: error de transporte (fase=${state.engineIoOpen ? 'post-open' : 'handshake'})`);
    });

    // Ventana total acotada: si hay trigger, da tiempo a que el evento
    // llegue tras el disparo; si no, simplemente mantiene la conexión activa
    // el tiempo configurado y cierra. Nunca indefinido (§39/§17 K2.1): un
    // evento no recibido dentro de esta ventana queda como check fallido,
    // jamás se convierte en éxito.
    const totalWindow = TRIGGER_ENABLED ? EVENT_WAIT_TIMEOUT_MS : CONNECTION_WINDOW_MS;
    socket.setTimeout(() => {
      // Desconexión limpia: packet DISCONNECT de Socket.IO para el
      // namespace antes de cerrar el transporte, igual que
      // `newSocket.close()` en el cliente real dispara internamente.
      if (state.namespaceConnectAckReceived) {
        socket.send(`41${NAMESPACE}`);
      }
      socket.close();
    }, totalWindow);
  });

  check(res, {
    'socket.io: upgrade a WebSocket exitoso (status 101)': (r) => !!r && r.status === 101,
  });

  check(state, {
    'socket.io: Engine.IO OPEN recibido': (s) => s.engineIoOpen === true,
  });

  check(state, {
    'socket.io: namespace /notifications conectado (CONNECT ack)': (s) => s.namespaceConnectAckReceived === true,
  });

  check(state, {
    "socket.io: evento 'connected' recibido (auth aceptada por el gateway)": (s) => s.connectedEventReceived === true,
  });

  if (TRIGGER_ENABLED) {
    check(state, {
      'socket.io trigger: finalizeSprint (líder) invocado exactamente una vez': (s) => s.triggerCalled === true,
    });

    if (state.triggerConfigurationError) {
      check(state, {
        'socket.io trigger: CONFIGURATION ERROR — finalizeSprint devolvió 409 (fixture/Sprint no preparado, no es fallo de Socket.IO)': () => false,
      });
    } else if (state.triggerCalled) {
      check(state, {
        'socket.io trigger: finalizeSprint (líder) status es 200': (s) => s.triggerHttpStatus === 200,
      });

      // K2.1: con dos identidades reales (listener != líder), el listener SÍ
      // forma parte de los destinatarios de notifySprintFinalizationStarted
      // (notifications.service.ts:239-247 — ACTIVO, distinto del autor), así
      // que esta conexión puede recibir genuinamente el evento con un
      // fixture válido (proyecto con Sprint ACTIVO, líder real, listener con
      // ParticipacionProyecto ACTIVO). Un fallo aquí con las dos identidades
      // correctamente configuradas indica fixture inválido (listener sin
      // participación ACTIVO) o timeout — nunca se convierte en éxito.
      check(state, {
        'socket.io trigger: SPRINT_FINALIZATION_STARTED recibido por el LISTENER (identidad distinta del líder)': (s) => s.sprintFinalizationReceived === true,
      });

      if (state.sprintFinalizationReceived) {
        check(state.sprintFinalizationPayload, {
          'socket.io trigger: payload SPRINT_FINALIZATION_STARTED tiene projectId/sprintId esperados': (p) =>
            !!p && p.projectId === data.projectId && p.sprintId === data.sprintId,
        });
      }
    }
  } else {
    console.log(
      'socket-io scenario: trigger deshabilitado (K6_TRIGGER_SPRINT_FINALIZATION!=="true") — ' +
        'este run solo valida conexión/namespace/auth con la identidad estándar. La recepción de ' +
        'SPRINT_FINALIZATION_STARTED requiere el fixture de dos identidades + trigger explícito ' +
        '(K6_SOCKET_LISTENER_EMAIL/PASSWORD, K6_PROJECT_ID, K6_SPRINT_ID).',
    );
  }
}
