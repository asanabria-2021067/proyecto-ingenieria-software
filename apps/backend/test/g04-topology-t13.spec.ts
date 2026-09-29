import { describe, expect, it } from 'vitest';
import { readRepoFile } from './helpers/workflow-yaml';
// Script sin dependencias del arnés (infra/staging), el mismo que corre run-harness.sh.
import {
  CHECKS,
  SOCKET_POLLING_PATH,
  characterizeSocket,
  verifyPolling,
  verifyUpgrade,
} from '../../../infra/staging/characterize.mjs';

/**
 * G04-C12 · P1/T13. El arnés prueba que Socket.IO atraviesa nginx: polling
 * 200 con `sid` y upgrade 101 con ese `sid`. La corrida real (docker) la hace
 * run-harness.sh; aquí se fija la lógica de verificación y el fixture
 * negativo: sin la ruta /socket.io/ (comportamiento previo a P1) T13 falla.
 */

const OPEN_PACKET = '0{"sid":"abcDEF123_-","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}';

describe('G04-C12: T13 en el arnés de topología', () => {
  it('con P1: polling 200 con paquete OPEN aporta el sid y el upgrade 101 pasa', () => {
    const polling = verifyPolling({ status: 200, body: OPEN_PACKET });
    expect(polling).toEqual({ sid: 'abcDEF123_-', failures: [] });
    expect(verifyUpgrade(101)).toEqual([]);
  });

  it('fixture negativo: sin la ruta /socket.io/ (el frontend responde 308) T13 falla', () => {
    const polling = verifyPolling({ status: 308, body: '/socket.io?EIO=4&transport=polling' });
    expect(polling.sid).toBeNull();
    expect(polling.failures).toEqual(['status 308 != 200', 'sin paquete OPEN con sid (no llegó a Engine.IO)']);
    expect(verifyUpgrade(308)).toEqual(['upgrade 308 != 101']);
  });

  it('un 200 que no viene de Engine.IO (p. ej. una página HTML) no cuenta como polling válido', () => {
    expect(verifyPolling({ status: 200, body: '<!DOCTYPE html><html></html>' }).failures).toEqual([
      'sin paquete OPEN con sid (no llegó a Engine.IO)',
    ]);
  });

  it('las rutas existentes siguen caracterizadas (/, /api y HTTP plano) y la sonda usa Engine.IO v4', () => {
    expect(CHECKS.map((check: { id: string }) => check.id)).toEqual(['HARN-01', 'HARN-02', 'HARN-03', 'HARN-04', 'HARN-05']);
    expect(SOCKET_POLLING_PATH).toBe('/socket.io/?EIO=4&transport=polling');
  });

  it('la sonda de T13 rechaza hosts no locales antes de conectar', async () => {
    await expect(characterizeSocket({ host: '158.23.57.118', httpsPort: 443 })).rejects.toThrow(/Host no local/);
  });

  it('run-harness.sh valida la configuración con nginx -t antes de caracterizar', () => {
    const script = readRepoFile('infra/staging/run-harness.sh');
    expect(script).toContain('exec -T nginx nginx -t');
    expect(script.indexOf('nginx -t')).toBeLessThan(script.indexOf('node characterize.mjs'));
  });
});
