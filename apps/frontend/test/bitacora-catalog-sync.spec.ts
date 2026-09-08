import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TipoEventoBitacora } from '../lib/types/bitacora';

/**
 * `lib/types/bitacora.ts` se declara espejo de
 * `apps/backend/src/bitacora/tipos-evento-bitacora.ts`, pero nada lo obligaba:
 * S7 añadió 28 eventos en el backend y el frontend se quedó con los siete
 * originales. La bitácora los devolvía igual y la vista reventaba al no
 * encontrarlos en su catálogo.
 *
 * Se lee el archivo del backend como TEXTO, sin importarlo: la prueba fija el
 * contrato entre ambos paquetes sin acoplar sus compilaciones.
 */

const BACKEND_CATALOGO = join(__dirname, '..', '..', 'backend', 'src', 'bitacora', 'tipos-evento-bitacora.ts');

/** Los literales de `VALORES`, que es lo que el backend acepta y emite. */
function valoresDelBackend(): string[] {
  const fuente = readFileSync(BACKEND_CATALOGO, 'utf8');
  const bloque = /static readonly VALORES = \[([\s\S]*?)\] as const;/.exec(fuente);
  if (!bloque) throw new Error('No se encontró VALORES en el catálogo del backend');
  return [...bloque[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

describe('Catálogo de eventos de bitácora', () => {
  it('el frontend conoce exactamente los mismos eventos que el backend', () => {
    expect([...TipoEventoBitacora.VALORES]).toEqual(valoresDelBackend());
  });

  it('ninguno de los eventos de Sprint 7 falta en el frontend', () => {
    const front = new Set<string>(TipoEventoBitacora.VALORES);
    const faltantes = valoresDelBackend().filter((v) => !front.has(v));

    expect(faltantes).toEqual([]);
  });

  it('el catálogo no tiene duplicados ni literales inventados', () => {
    const valores = [...TipoEventoBitacora.VALORES];

    expect(new Set(valores).size).toBe(valores.length);
    for (const valor of valores) expect(valor).toMatch(/^[A-Z][A-Z_]+$/);
  });
});
