import { describe, expect, it } from 'vitest';
import { postulacionSchema } from '../app/dashboard/proyectos/[id]/postular/[rolId]/page';

describe('postulacionSchema', () => {
  it('acepta exactamente los límites del backend', () => {
    expect(postulacionSchema.safeParse({ justificacion: 'x'.repeat(40) }).success).toBe(true);
    expect(postulacionSchema.safeParse({ justificacion: 'x'.repeat(1000) }).success).toBe(true);
  });

  it('rechaza longitudes fuera del contrato', () => {
    expect(postulacionSchema.safeParse({ justificacion: 'x'.repeat(39) }).success).toBe(false);
    expect(postulacionSchema.safeParse({ justificacion: 'x'.repeat(1001) }).success).toBe(false);
  });
});
