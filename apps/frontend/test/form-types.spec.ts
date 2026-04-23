import { describe, expect, it, vi } from 'vitest';
import { formSchema, newRequisito, newRol, step1Schema, zodToFieldErrors } from '../app/dashboard/projects/mine/form/types';
import { isProfileIncomplete } from '../hooks/use-current-user';

describe('form helpers', () => {
  it('newRol/newRequisito generan items', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('uuid-1') });
    const rol = newRol();
    const req = newRequisito();
    expect(rol.id).toBe('uuid-1');
    expect(req.id).toBe('uuid-1');
  });

  it('step1Schema detecta fechas inválidas', () => {
    const result = step1Schema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'REMOTO',
      objetivosProyecto: '',
      ubicacionProyecto: '',
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '2026-12-10',
      fechaFinEstimada: '2026-12-01',
      roles: [],
    });
    expect(result.success).toBe(false);
    expect(zodToFieldErrors(result as any).fechaFinEstimada).toBeTruthy();
  });

  it('formSchema valida rol', () => {
    const result = formSchema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'REMOTO',
      objetivosProyecto: '',
      ubicacionProyecto: '',
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '2026-01-01',
      fechaFinEstimada: '2026-01-10',
      roles: [
        {
          id: 'x',
          nombreRol: '',
          descripcionRolProyecto: '',
          idCarreraRequerida: null,
          cupos: '',
          horasSemanalesEstimadas: '',
          requisitos: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('isProfileIncomplete detecta perfil incompleto', () => {
    expect(isProfileIncomplete({ perfil: { biografia: null }, habilidades: [] } as any)).toBe(true);
    expect(isProfileIncomplete({ perfil: { biografia: 'ok' }, habilidades: [{ idUsuarioHabilidad: 1 }] } as any)).toBe(false);
  });
});
