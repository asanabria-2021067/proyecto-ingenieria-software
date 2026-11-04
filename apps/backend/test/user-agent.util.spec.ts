import { describe, expect, it } from 'vitest';
import { huellaDispositivo, parseUserAgent } from '../src/auth/user-agent.util';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/126.0.0.0`;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('parseUserAgent', () => {
  it.each([
    [CHROME_WIN, 'Chrome', 'Windows'],
    [EDGE_WIN, 'Edge', 'Windows'],
    [FIREFOX_LINUX, 'Firefox', 'Linux'],
    [SAFARI_IOS, 'Safari', 'iOS'],
    [CHROME_ANDROID, 'Chrome', 'Android'],
    [SAFARI_MAC, 'Safari', 'macOS'],
  ])('%s', (ua, navegador, sistema) => {
    expect(parseUserAgent(ua)).toEqual({ navegador, sistema });
  });

  it('sin user-agent devuelve valores desconocidos', () => {
    expect(parseUserAgent(undefined)).toEqual({ navegador: 'Navegador desconocido', sistema: 'Sistema desconocido' });
  });
});

describe('huellaDispositivo', () => {
  const info = parseUserAgent(CHROME_WIN);

  it('es estable para el mismo navegador y no cambia con la versión', () => {
    const otraVersion = parseUserAgent(CHROME_WIN.replace('126', '127'));
    expect(huellaDispositivo('d1', info)).toBe(huellaDispositivo('d1', otraVersion));
    expect(huellaDispositivo('d1', info)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia con el identificador de dispositivo o con el navegador', () => {
    expect(huellaDispositivo('d1', info)).not.toBe(huellaDispositivo('d2', info));
    expect(huellaDispositivo('d1', info)).not.toBe(huellaDispositivo('d1', parseUserAgent(EDGE_WIN)));
  });
});
