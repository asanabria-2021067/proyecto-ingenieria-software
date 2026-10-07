#!/usr/bin/env node
/**
 * T14 (G07-C12 · P2 + OWASP25-C025): tiempo real same-origin a traves del
 * nginx del arnes. El frontend del arnes se construye con la variante
 * same-origin (NEXT_PUBLIC_API_URL vacia, la que hornea
 * PUBLIC_API_URL=same-origin en deploy.yml) y los sockets entran por
 * https://<host>/socket.io/ (P1), nunca por :3001.
 *
 * Con clientes Socket.IO minimos (Engine.IO v4 sobre el WebSocket de Node 22 y
 * sobre polling HTTPS con la cookie de sesion) comprueba:
 * - el bundle del navegador no contiene :3001 ni la IP de la API;
 * - un access token de una cuenta ACTIVO conecta a /notifications y /chat;
 * - un token de reset (flujo real del admin) o de refresh no conecta;
 * - la notificacion y el chat funcionan en vivo y la participacion se respeta;
 * - al BLOQUEAR o INACTIVAR una cuenta sus sockets abiertos se cierran (C04),
 *   una conexion nueva se rechaza y los sockets de otras cuentas siguen vivos.
 *
 * Solo hosts locales y datos SINTETICOS de la base efimera. Nunca imprime
 * tokens, cookies ni correos: solo codigos, eventos y resultados.
 * Uso (lo invoca run-harness.sh): node realtime.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalHost } from './characterize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVENT_TIMEOUT_MS = 8000;

/** Patrones que un bundle same-origin nunca debe contener. */
export const FORBIDDEN_BUNDLE_PATTERNS = [':3001', '158.23.57.118'];

// ─── Protocolo (funciones puras, probadas sin docker en g07-topology-t14) ────

/** Paquete CONNECT de Socket.IO a un namespace, con `auth.token` (misma fuente que extractWsToken). */
export function connectPacket(namespace, token) {
  return `40${namespace},${JSON.stringify(token === undefined ? {} : { token })}`;
}

/** Interpreta un paquete Engine.IO/Socket.IO recibido para un namespace. */
export function parsePacket(namespace, packet) {
  if (packet === '2') {
    return { type: 'ping' };
  }
  if (packet.startsWith('0')) {
    return { type: 'open' };
  }
  if (packet.startsWith(`40${namespace},`)) {
    return { type: 'connected' };
  }
  if (packet === `41${namespace},` || packet === `41${namespace}` || packet.startsWith(`44${namespace},`)) {
    return { type: 'closed' };
  }
  if (packet.startsWith(`42${namespace},`)) {
    const [event, payload] = JSON.parse(packet.slice(`42${namespace},`.length));
    return { type: 'event', event, payload };
  }
  if (packet.startsWith(`43${namespace},`)) {
    const rest = packet.slice(`43${namespace},`.length);
    const id = /^\d+/.exec(rest)?.[0];
    return id === undefined ? { type: 'other' } : { type: 'ack', id: Number(id), value: JSON.parse(rest.slice(id.length))[0] };
  }
  return { type: 'other' };
}

/** 'aceptado' = recibio `connected` con SU userId y el namespace sigue abierto; 'rechazado' = el servidor lo cerro sin `connected`. */
export function handshakeOutcome(state, expectedUserId) {
  const connected = state.events.some((e) => e.event === 'connected' && e.payload?.userId === expectedUserId);
  if (connected && !state.closed) {
    return 'aceptado';
  }
  if (state.closed && !state.events.some((e) => e.event === 'connected')) {
    return 'rechazado';
  }
  return 'sin respuesta';
}

export function bundleFindings(matchedPatterns) {
  return matchedPatterns.map((pattern) => `bundle contiene ${pattern}`);
}

// ─── Red ─────────────────────────────────────────────────────────────────────

function request(ctx, method, path, { body, cookie, headers = {}, raw } = {}) {
  const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ctx.host,
        port: ctx.httpsPort,
        path,
        method,
        rejectUnauthorized: false,
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          ...(payload !== undefined
            ? { 'Content-Type': raw !== undefined ? 'text/plain;charset=UTF-8' : 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timeout ${method} ${path}`)));
    req.on('error', reject);
    req.end(payload);
  });
}

function json(response) {
  try {
    return JSON.parse(response.text);
  } catch {
    return null;
  }
}

function cookiesFrom(response) {
  const jar = {};
  for (const header of response.headers['set-cookie'] ?? []) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    jar[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1));
  }
  return jar;
}

function jwtSubject(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
}

function compose(ctx, args) {
  return execFileSync('docker', ['compose', '-p', ctx.project, '-f', join(HERE, 'docker-compose.yml'), ...args], { encoding: 'utf8' }).trim();
}

const sql = (ctx, query) => compose(ctx, ['exec', '-T', 'postgres', 'psql', '-U', 'harness', '-d', 'uvg_collab_harness', '-qtAc', query]);

async function registerUser(ctx, label) {
  const suffix = randomBytes(4).toString('hex');
  const carne = String(randomBytes(4).readUInt32BE(0));
  const correo = `pru${carne}@uvg.edu.gt`;
  const response = await request(ctx, 'POST', '/api/auth/register', {
    body: { correo, contrasena: `T14-sintetica-${suffix}`, nombre: 'Sintetico', apellido: 'Prueba', carne, idCarrera: Number(ctx.carreraId), semestre: 1 },
  });
  if (response.status !== 201) {
    throw new Error(`registro ${label}: status ${response.status}`);
  }
  const jar = cookiesFrom(response);
  return { label, correo, carne, access: jar.access_token, refresh: jar.refresh_token, id: jwtSubject(jar.access_token) };
}

const cookieOf = (user) => `access_token=${encodeURIComponent(user.access)}`;

// ─── Socket.IO sobre WebSocket ───────────────────────────────────────────────

function openSocket(ctx, namespace, token) {
  const ws = new WebSocket(`wss://${ctx.host}:${ctx.httpsPort}/socket.io/?EIO=4&transport=websocket`);
  const state = { namespace, ws, events: [], acks: new Map(), connected: false, closed: false, nextAck: 1 };
  ws.addEventListener('message', ({ data }) => {
    const packet = parsePacket(namespace, String(data));
    if (packet.type === 'ping') {
      ws.send('3');
    } else if (packet.type === 'open') {
      ws.send(connectPacket(namespace, token));
    } else if (packet.type === 'connected') {
      state.connected = true;
    } else if (packet.type === 'closed') {
      state.closed = true;
    } else if (packet.type === 'event') {
      state.events.push({ event: packet.event, payload: packet.payload });
    } else if (packet.type === 'ack') {
      state.acks.set(packet.id, packet.value);
    }
  });
  ws.addEventListener('close', () => {
    state.closed = true;
  });
  ws.addEventListener('error', () => {
    state.closed = true;
  });
  return state;
}

function until(predicate, timeoutMs = EVENT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });
}

const hasEvent = (socket, event, match = () => true) => socket.events.some((e) => e.event === event && match(e.payload));

async function handshake(ctx, namespace, token, expectedUserId) {
  const socket = openSocket(ctx, namespace, token);
  await until(() => hasEvent(socket, 'connected') || socket.closed);
  // Margen corto para que un cierre inmediato del servidor tambien se observe.
  await until(() => socket.closed, 300);
  return { socket, outcome: handshakeOutcome(socket, expectedUserId) };
}

function closeAll(sockets) {
  for (const socket of sockets) {
    try {
      socket.ws.close();
    } catch {
      // ya cerrado
    }
  }
}

async function emitWithAck(socket, event, payload) {
  const id = socket.nextAck++;
  socket.ws.send(`42${socket.namespace},${id}${JSON.stringify([event, payload])}`);
  await until(() => socket.acks.has(id));
  return socket.acks.get(id);
}

// ─── Socket.IO sobre polling con la cookie de sesion (como el navegador) ────

async function pollingHandshake(ctx, namespace, cookie) {
  const base = '/socket.io/?EIO=4&transport=polling';
  const open = await request(ctx, 'GET', base, { cookie });
  const sid = /^0\{.*"sid":"([^"]+)"/.exec(open.text)?.[1];
  if (!sid) {
    return 'sin sid';
  }
  const path = `${base}&sid=${encodeURIComponent(sid)}`;
  const connect = await request(ctx, 'POST', path, { cookie, raw: `40${namespace},` });
  if (connect.status !== 200) {
    return `connect ${connect.status}`;
  }
  let packets = '';
  for (let attempt = 0; attempt < 5 && !packets.includes(`42${namespace},["connected"`) && !packets.includes(`41${namespace}`); attempt += 1) {
    packets += (await request(ctx, 'GET', path, { cookie })).text;
  }
  return packets.includes(`42${namespace},["connected"`) ? 'aceptado' : packets.includes(`41${namespace}`) ? 'rechazado' : 'sin respuesta';
}

// ─── Casos ───────────────────────────────────────────────────────────────────

function scanBundle(ctx) {
  const count = (pattern, flags) => Number(compose(ctx, ['exec', '-T', 'frontend', 'sh', '-c', `grep -rl${flags} -- '${pattern}' .next/static | wc -l`]));
  return {
    found: FORBIDDEN_BUNDLE_PATTERNS.filter((pattern) => count(pattern, 'F') > 0),
    scanned: count('/notifications|/chat', 'E') > 0,
  };
}

export async function realtimeChecks(ctx) {
  assertLocalHost(ctx.host);
  const results = [];
  const sockets = [];
  const check = (id, title, outcomes) => results.push({ id, title, failures: outcomes.filter((outcome) => outcome !== true) });
  const connect = async (namespace, token, userId) => {
    const handshaken = await handshake(ctx, namespace, token, userId);
    sockets.push(handshaken.socket);
    return handshaken;
  };

  const bundle = scanBundle(ctx);
  check('T14-01', 'bundle same-origin sin :3001 ni IP de la API', [bundle.scanned || 'no se encontro el bundle realtime', ...bundleFindings(bundle.found)]);

  // Cuatro registros sinteticos: el limite de /auth/register es 5/min y T18 ya uso uno.
  const owner = await registerUser(ctx, 'owner');
  const member = await registerUser(ctx, 'member');
  const outsider = await registerUser(ctx, 'outsider');
  const admin = await registerUser(ctx, 'admin');
  sql(
    ctx,
    `INSERT INTO rol_acceso (nombre_perfil) VALUES ('administrador') ON CONFLICT (nombre_perfil) DO NOTHING;` +
      `INSERT INTO usuario_rol_acceso (id_usuario, id_rol_acceso) SELECT ${Number(admin.id)}, id_rol_acceso FROM rol_acceso WHERE nombre_perfil = 'administrador';`,
  );
  const idProyecto = Number(
    sql(
      ctx,
      `INSERT INTO proyecto (titulo_proyecto, descripcion_proyecto, tipo_proyecto, creado_por) VALUES ('Proyecto sintetico T14', 'Proyecto sintetico del arnes para probar el chat en vivo', 'ACADEMICO_EXPERIENCIA', ${Number(owner.id)}) RETURNING id_proyecto`,
    ),
  );
  sql(
    ctx,
    `WITH rol AS (INSERT INTO rol_proyecto (id_proyecto, nombre_rol) VALUES (${idProyecto}, 'Rol sintetico T14') RETURNING id_rol_proyecto)` +
      ` INSERT INTO participacion_proyecto (id_usuario, id_rol_proyecto) SELECT ${Number(member.id)}, id_rol_proyecto FROM rol;`,
  );

  // T14-02/03: access token de cuentas ACTIVO en ambos namespaces, por WSS via nginx.
  const ownerNotif = await connect('/notifications', owner.access, owner.id);
  const memberNotif = await connect('/notifications', member.access, member.id);
  const outsiderNotif = await connect('/notifications', outsider.access, outsider.id);
  const adminNotif = await connect('/notifications', admin.access, admin.id);
  const memberChat = await connect('/chat', member.access, member.id);
  const outsiderChat = await connect('/chat', outsider.access, outsider.id);
  check('T14-02', 'access ACTIVO conecta a /notifications por wss same-origin', [
    [ownerNotif, memberNotif, outsiderNotif, adminNotif].every((h) => h.outcome === 'aceptado') || 'algun access token ACTIVO no conecto',
  ]);
  check('T14-03', 'access ACTIVO conecta a /chat por wss same-origin', [
    [memberChat, outsiderChat].every((h) => h.outcome === 'aceptado') || 'algun access token ACTIVO no conecto',
  ]);

  // T14-04: la ruta del navegador (polling + cookie httpOnly) tambien pasa por la politica.
  const cookieAccess = await pollingHandshake(ctx, '/notifications', cookieOf(owner));
  const cookieRefresh = await pollingHandshake(ctx, '/chat', `access_token=${encodeURIComponent(owner.refresh)}`);
  check('T14-04', 'polling con la cookie access_token conecta; un refresh en esa cookie no', [
    cookieAccess === 'aceptado' || `cookie access_token: ${cookieAccess}`,
    cookieRefresh === 'rechazado' || `refresh en la cookie: ${cookieRefresh}`,
  ]);

  // T14-05: notificacion en vivo (flujo real de recuperacion: llega al admin).
  const forgot = await request(ctx, 'POST', '/api/auth/forgot-password', { body: { carne: member.carne, correo: member.correo } });
  const notified = await until(() => hasEvent(adminNotif.socket, 'notification', (p) => p?.tipoNotificacion === 'SOLICITUD_RECUPERACION_CONTRASENA'));
  check('T14-05', 'notificacion en vivo al admin via nginx', [
    (forgot.status ?? 500) < 300 || `forgot-password ${forgot.status}`,
    notified || 'el admin no recibio la notificacion',
  ]);

  // T14-06: token de reset emitido por el admin (mismo secreto que el access) → rechazado.
  const pending = json(await request(ctx, 'GET', '/api/admin/password-reset-requests', { cookie: cookieOf(admin) }));
  const solicitud = (Array.isArray(pending) ? pending : []).find((s) => s?.carneReferencia === member.carne);
  const link = solicitud
    ? json(await request(ctx, 'POST', `/api/admin/password-reset-requests/${solicitud.idSolicitud}/generate-link`, { cookie: cookieOf(admin) }))
    : null;
  const resetToken = link?.resetToken ?? null;
  const resetNotif = resetToken ? await connect('/notifications', resetToken, member.id) : { outcome: 'sin token' };
  const resetChat = resetToken ? await connect('/chat', resetToken, member.id) : { outcome: 'sin token' };
  check('T14-06', 'token de reset real no abre sockets', [
    Boolean(resetToken) || 'no se obtuvo el token de reset del flujo admin',
    resetNotif.outcome === 'rechazado' || `/notifications: ${resetNotif.outcome}`,
    resetChat.outcome === 'rechazado' || `/chat: ${resetChat.outcome}`,
  ]);

  // T14-07: refresh token → rechazado en ambos namespaces.
  const refreshNotif = await connect('/notifications', owner.refresh, owner.id);
  const refreshChat = await connect('/chat', owner.refresh, owner.id);
  check('T14-07', 'refresh token no abre sockets', [
    refreshNotif.outcome === 'rechazado' || `/notifications: ${refreshNotif.outcome}`,
    refreshChat.outcome === 'rechazado' || `/chat: ${refreshChat.outcome}`,
  ]);

  // T14-08: chat en vivo + participacion.
  const conversation = await request(ctx, 'POST', `/api/proyectos/${idProyecto}/conversaciones`, {
    cookie: cookieOf(owner),
    body: { tipo: 'INDIVIDUAL', idsParticipantes: [member.id] },
  });
  const idConversacion = json(conversation)?.idConversacion;
  const updated = await until(() => hasEvent(memberChat.socket, 'conversationUpdated', (p) => p?.idConversacion === idConversacion));
  const memberJoin = await emitWithAck(memberChat.socket, 'joinConversation', { idConversacion });
  const outsiderJoin = await emitWithAck(outsiderChat.socket, 'joinConversation', { idConversacion });
  const newMessages = () => memberChat.socket.events.filter((e) => e.event === 'newMessage' && e.payload?.idConversacion === idConversacion).length;
  const sent = await request(ctx, 'POST', `/api/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes`, {
    cookie: cookieOf(owner),
    body: { contenido: 'Mensaje sintetico T14' },
  });
  const delivered = await until(() => newMessages() >= 1);
  check('T14-08', 'chat en vivo via nginx y participacion preservada', [
    conversation.status === 201 || `crear conversacion ${conversation.status}`,
    updated || 'el miembro no recibio conversationUpdated',
    memberJoin?.joined === true || 'el participante no pudo unirse',
    outsiderJoin?.joined === false || 'un ajeno se unio a la conversacion',
    sent.status === 201 || `enviar mensaje ${sent.status}`,
    delivered || 'el participante no recibio newMessage',
    !hasEvent(outsiderChat.socket, 'newMessage') || 'un ajeno recibio el mensaje',
  ]);

  // T14-09: BLOQUEADO → sus sockets abiertos se cierran (C04), uno nuevo se rechaza, los demas siguen.
  const blocked = await request(ctx, 'PATCH', `/api/admin/usuarios/${outsider.id}/estado`, { cookie: cookieOf(admin), body: { estado: 'BLOQUEADO' } });
  const blockedClosed = await until(() => outsiderChat.socket.closed && outsiderNotif.socket.closed);
  const blockedAgain = await connect('/notifications', outsider.access, outsider.id);
  const before = newMessages();
  await request(ctx, 'POST', `/api/proyectos/${idProyecto}/conversaciones/${idConversacion}/mensajes`, {
    cookie: cookieOf(owner),
    body: { contenido: 'Mensaje sintetico T14 tras bloqueo' },
  });
  const othersAlive = await until(() => newMessages() > before);
  check('T14-09', 'BLOQUEADO: sockets abiertos cerrados, reconexion rechazada, otras cuentas intactas', [
    blocked.status === 200 || `bloquear ${blocked.status}`,
    blockedClosed || 'los sockets abiertos del bloqueado siguen vivos',
    blockedAgain.outcome === 'rechazado' || `reconexion bloqueado: ${blockedAgain.outcome}`,
    (othersAlive && !memberChat.socket.closed && !ownerNotif.socket.closed && !adminNotif.socket.closed) || 'se cerraron sockets de otras cuentas',
  ]);

  // T14-10: INACTIVO → igual (reactivar, reconectar, inactivar).
  await request(ctx, 'PATCH', `/api/admin/usuarios/${outsider.id}/estado`, { cookie: cookieOf(admin), body: { estado: 'ACTIVO' } });
  const reactivated = await connect('/chat', outsider.access, outsider.id);
  const inactive = await request(ctx, 'PATCH', `/api/admin/usuarios/${outsider.id}/estado`, { cookie: cookieOf(admin), body: { estado: 'INACTIVO' } });
  const inactiveClosed = await until(() => reactivated.socket.closed);
  const inactiveAgain = await connect('/chat', outsider.access, outsider.id);
  check('T14-10', 'INACTIVO: socket abierto cerrado y reconexion rechazada', [
    reactivated.outcome === 'aceptado' || `reactivado: ${reactivated.outcome}`,
    inactive.status === 200 || `inactivar ${inactive.status}`,
    inactiveClosed || 'el socket del inactivado sigue vivo',
    inactiveAgain.outcome === 'rechazado' || `reconexion inactivo: ${inactiveAgain.outcome}`,
  ]);

  closeAll(sockets);

  // Tramo de navegador (HARNESS_BROWSER=1): sesion SINTETICA de una cuenta
  // ACTIVO en el directorio temporal del arnes (0600), que run-harness.sh borra.
  if (ctx.browserSessionFile) {
    writeFileSync(ctx.browserSessionFile, JSON.stringify({ access: member.access, refresh: member.refresh }), { mode: 0o600 });
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ctx = {
    host: process.env.HARNESS_HOST ?? '127.0.0.1',
    httpsPort: Number(process.env.HARNESS_HTTPS_PORT ?? 8443),
    project: process.env.HARNESS_PROJECT ?? 'uvg-owasp-harness',
    carreraId: process.env.HARNESS_T18_CARRERA_ID,
    browserSessionFile: process.env.HARNESS_BROWSER_SESSION,
  };
  assertLocalHost(ctx.host);
  // Certificado autofirmado y efimero del arnes (el WebSocket de Node no admite
  // otra forma de aceptarlo); el host ya se valido como local.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const results = await realtimeChecks(ctx);
  for (const result of results) {
    console.log(`${result.failures.length === 0 ? 'PASS' : 'FAIL'} ${result.id} ${result.title}`);
    result.failures.forEach((failure) => console.log(`  - ${failure}`));
  }
  process.exit(results.every((result) => result.failures.length === 0) ? 0 : 1);
}
