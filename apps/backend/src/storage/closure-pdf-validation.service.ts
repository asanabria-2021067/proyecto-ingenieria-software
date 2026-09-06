import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

/**
 * C115 (06 v2 §27/§51): validación de que un documento subido es un PDF REAL.
 *
 * El nombre del archivo, su extensión y el `Content-Type` que declara el
 * cliente no prueban nada: se comprueba la firma y se PARSEA el documento
 * completo. El parseo ocurre en un worker con techo de memoria y tiempo
 * porque un PDF hostil puede hacer trabajar al parser indefinidamente, y ese
 * trabajo no puede bloquear el proceso que atiende al resto del producto.
 *
 * Esto verifica FORMATO. No promete análisis antimalware, y el archivo
 * original nunca se reescribe: se valida una copia en memoria y se sube
 * exactamente lo que el usuario envió.
 */

export const PDF_SIGNATURE = '%PDF-';
/** §51: presupuesto por parseo. */
export const PDF_PARSE_TIMEOUT_MS = 10_000;
export const PDF_PARSE_MEMORY_MB = 128;
/** §51: como mucho dos parseos simultáneos por proceso. */
export const PDF_PARSE_MAX_CONCURRENCY = 2;

export const PDF_INVALIDO = 'El documento no es un PDF válido o no pudo leerse';

/**
 * Fuente del worker. Va como texto para que el mismo código funcione al
 * ejecutar desde TypeScript y desde el build compilado, sin depender de que
 * un archivo hermano exista con una u otra extensión.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument } = require('pdf-lib');
(async () => {
  try {
    // ignoreEncryption en false: un PDF cifrado por el usuario es un rechazo,
    // no algo que se intente abrir de todos modos.
    const documento = await PDFDocument.load(workerData, { ignoreEncryption: false, updateMetadata: false });
    parentPort.postMessage({ ok: documento.getPageCount() >= 1, paginas: documento.getPageCount() });
  } catch (error) {
    parentPort.postMessage({ ok: false, motivo: String((error && error.message) || error).slice(0, 200) });
  }
})();
`;

export interface PdfValidationResult {
  paginas: number;
}

@Injectable()
export class ClosurePdfValidationService {
  private enCurso = 0;
  private readonly cola: Array<() => void> = [];
  /** Máximo observado de parseos simultáneos; solo para verificación. */
  maxSimultaneos = 0;

  constructor(
    private readonly timeoutMs: number = PDF_PARSE_TIMEOUT_MS,
    private readonly maxConcurrency: number = PDF_PARSE_MAX_CONCURRENCY,
  ) {}

  /** Semáforo de dos plazas: el tercer parseo ESPERA, nunca se salta. */
  private async acquire(): Promise<void> {
    if (this.enCurso >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.cola.push(resolve));
    }
    this.enCurso += 1;
    this.maxSimultaneos = Math.max(this.maxSimultaneos, this.enCurso);
  }

  private release(): void {
    this.enCurso -= 1;
    const siguiente = this.cola.shift();
    if (siguiente) {
      siguiente();
    }
  }

  /**
   * Valida el buffer recibido. Lanza 422 ante cualquier fallo controlado: un
   * archivo ilegible es un problema del contenido, no una indisponibilidad
   * del servicio, y confundirlos haría creer al cliente que puede reintentar.
   */
  async assertValidPdf(bytes: Buffer): Promise<PdfValidationResult> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new UnprocessableEntityException(PDF_INVALIDO);
    }
    if (bytes.subarray(0, PDF_SIGNATURE.length).toString('latin1') !== PDF_SIGNATURE) {
      throw new UnprocessableEntityException(PDF_INVALIDO);
    }

    await this.acquire();
    try {
      const resultado = await this.parseInWorker(bytes);
      if (!resultado.ok || (resultado.paginas ?? 0) < 1) {
        throw new UnprocessableEntityException(PDF_INVALIDO);
      }
      return { paginas: resultado.paginas ?? 0 };
    } finally {
      this.release();
    }
  }

  private parseInWorker(bytes: Buffer): Promise<{ ok: boolean; paginas?: number; motivo?: string }> {
    return new Promise((resolve) => {
      // Copia: el worker recibe sus propios bytes y el original no se toca.
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: Uint8Array.from(bytes),
        resourceLimits: { maxOldGenerationSizeMb: PDF_PARSE_MEMORY_MB },
      });
      let resuelto = false;
      const terminar = (resultado: { ok: boolean; paginas?: number; motivo?: string }) => {
        if (resuelto) {
          return;
        }
        resuelto = true;
        clearTimeout(temporizador);
        void worker.terminate();
        resolve(resultado);
      };
      // Un parseo que se pasa del presupuesto se corta: el worker muere y el
      // proceso principal sigue atendiendo.
      const temporizador = setTimeout(
        () => terminar({ ok: false, motivo: 'timeout' }),
        this.timeoutMs,
      );
      worker.on('message', (mensaje) => terminar(mensaje as { ok: boolean; paginas?: number }));
      worker.on('error', () => terminar({ ok: false, motivo: 'error' }));
      worker.on('exit', () => terminar({ ok: false, motivo: 'exit' }));
    });
  }
}
