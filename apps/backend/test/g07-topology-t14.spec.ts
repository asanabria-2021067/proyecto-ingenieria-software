import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
// Script sin dependencias del arnés (infra/staging), el mismo que corre run-harness.sh.
import {
  FORBIDDEN_BUNDLE_PATTERNS,
  bundleFindings,
  connectPacket,
  handshakeOutcome,
  parsePacket,
  realtimeChecks,
} from '../../../infra/staging/realtime.mjs';

/**
 * G07-C12 · T14 (P2 + OWASP25-C025). El arnés prueba el tiempo real
 * same-origin a través de nginx: el frontend se construye con la variante
 * same-origin y los clientes Socket.IO de realtime.mjs verifican la política
 * del handshake, notificaciones, chat y la desconexión al bloquear/inactivar.
 * La corrida real (docker) la hace run-harness.sh; aquí se fijan el protocolo,
 * los veredictos y la estructura, con fixtures negativos.
 */

describe('G07-C12: T14 en el arnés de topología', () => {
  it('el CONNECT lleva el token en auth (la primera fuente de la política); sin token, auth vacío', () => {
    expect(connectPacket('/chat', 'abc')).toBe('40/chat,{"token":"abc"}');
    expect(connectPacket('/notifications', undefined)).toBe('40/notifications,{}');
  });

  it('interpreta los paquetes de Engine.IO v4 / Socket.IO del namespace', () => {
    expect(parsePacket('/chat', '2')).toEqual({ type: 'ping' });
    expect(parsePacket('/chat', '0{"sid":"x","pingInterval":25000}')).toEqual({ type: 'open' });
    expect(parsePacket('/chat', '40/chat,{"sid":"y"}')).toEqual({ type: 'connected' });
    expect(parsePacket('/chat', '41/chat,')).toEqual({ type: 'closed' });
    expect(parsePacket('/chat', '44/chat,{"message":"no"}')).toEqual({ type: 'closed' });
    expect(parsePacket('/chat', '42/chat,["newMessage",{"idConversacion":3}]')).toEqual({
      type: 'event',
      event: 'newMessage',
      payload: { idConversacion: 3 },
    });
    expect(parsePacket('/chat', '43/chat,7[{"joined":false}]')).toEqual({ type: 'ack', id: 7, value: { joined: false } });
    // Un paquete de otro namespace no se confunde con el propio.
    expect(parsePacket('/chat', '41/notifications,')).toEqual({ type: 'other' });
  });

  it('aceptado solo con `connected` del MISMO usuario y el namespace abierto; rechazado si se cierra sin `connected`', () => {
    const connected = { events: [{ event: 'connected', payload: { userId: 5 } }], closed: false };
    expect(handshakeOutcome(connected, 5)).toBe('aceptado');
    expect(handshakeOutcome(connected, 6)).toBe('sin respuesta');
    expect(handshakeOutcome({ events: [], closed: true }, 5)).toBe('rechazado');
    expect(handshakeOutcome({ events: [], closed: false }, 5)).toBe('sin respuesta');
  });

  it('fixture negativo: la política previa (solo firma) aceptaba un token de reset; T14 lo marca como fallo', () => {
    // El servidor anterior a G07 respondía `connected` a un token de reset firmado con el secreto de acceso.
    const legacyReset = { events: [{ event: 'connected', payload: { userId: 5 } }], closed: false };
    expect(handshakeOutcome(legacyReset, 5)).not.toBe('rechazado');
  });

  it('el bundle same-origin no debe contener :3001 ni la IP de la API', () => {
    expect(FORBIDDEN_BUNDLE_PATTERNS).toEqual([':3001', '158.23.57.118']);
    expect(bundleFindings([])).toEqual([]);
    expect(bundleFindings([':3001'])).toEqual(['bundle contiene :3001']);
  });

  it('rechaza cualquier host que no sea local antes de tocar la red', async () => {
    await expect(realtimeChecks({ host: '158.23.57.118', httpsPort: 443, project: 'x', carreraId: '1' })).rejects.toThrow(/Host no local/);
  });

  it('el arnés construye el frontend con la variante same-origin y corre T14 tras la caracterización', () => {
    const compose = readRepoFile('infra/staging/docker-compose.yml');
    expect(compose).toMatch(/NEXT_PUBLIC_API_URL: ''/);
    expect(compose).not.toContain('NEXT_PUBLIC_API_URL: http://localhost:3001');
    const script = readRepoFile('infra/staging/run-harness.sh');
    expect(script.indexOf('node characterize.mjs')).toBeLessThan(script.indexOf('node realtime.mjs'));
    expect(script).toContain('down -v --remove-orphans --rmi local');
  });

  it('el tramo de navegador es opcional, usa su propia config y nunca la suite E2E normal', () => {
    const script = readRepoFile('infra/staging/run-harness.sh');
    expect(script).toContain('HARNESS_BROWSER');
    expect(script).toContain('playwright.harness.config.ts');
    const config = readRepoFile('apps/frontend/playwright.harness.config.ts');
    expect(config).toContain("testDir: './e2e-harness'");
    expect(config).not.toContain('webServer');
    expect(readRepoFile('apps/frontend/playwright.config.ts')).toContain("testDir: './e2e'");
  });

  it('el README documenta T14', () => {
    const readme = readRepoFile('infra/staging/README.md');
    for (const id of ['T14-01', 'T14-06', 'T14-09', 'T14-10']) {
      expect(readme).toContain(id);
    }
  });
});
