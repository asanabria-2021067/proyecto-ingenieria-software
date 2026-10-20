import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTONES_INLINE } from '@/lib/admin/button-catalog';
import { RAIZ, leer } from './helpers/admin-design';

/** El catálogo de botones no puede quedarse atrás: cada clase copiada debe seguir, literal, en su archivo. */

const muestras = Object.entries(BOTONES_INLINE).flatMap(([familia, lista]) => lista.map((m) => [familia, m.etiqueta, m] as const));

describe('Catálogo de botones: las muestras en línea siguen el código real', () => {
  it.each(muestras)('%s · %s', (_familia, _etiqueta, muestra) => {
    expect(existsSync(join(RAIZ, muestra.archivo)), muestra.archivo).toBe(true);
    const fuente = leer(muestra.archivo);
    for (const clase of muestra.clases) expect(fuente, muestra.archivo).toContain(clase);
  });
});
