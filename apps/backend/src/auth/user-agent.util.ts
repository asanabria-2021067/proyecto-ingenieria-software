import { createHash } from 'crypto';

export interface DispositivoInfo {
  navegador: string;
  sistema: string;
}

/** Navegador y sistema del user-agent, sin versiones ni IP: la huella no cambia con una actualización. */
export function parseUserAgent(userAgent?: string | null): DispositivoInfo {
  const ua = userAgent ?? '';
  const navegador = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador desconocido';
  const sistema = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Sistema desconocido';
  return { navegador, sistema };
}

export function huellaDispositivo(idDispositivo: string, { navegador, sistema }: DispositivoInfo): string {
  return createHash('sha256').update(`${idDispositivo}|${navegador}|${sistema}`).digest('hex');
}
