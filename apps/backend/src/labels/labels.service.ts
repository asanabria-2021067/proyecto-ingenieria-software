import { Injectable } from '@nestjs/common';

@Injectable()
export class LabelsService {
  /**
   * Fuente única del cálculo de `Etiqueta.nombreNormalizado` (Tarea 30).
   * Orden obligatorio: Unicode NFKC → trim → lowercase. No colapsa espacios
   * internos, no elimina acentos y no usa `toLocaleLowerCase` (evita
   * variar por configuración regional).
   */
  normalizeName(name: string): string {
    return name.normalize('NFKC').trim().toLowerCase();
  }
}
