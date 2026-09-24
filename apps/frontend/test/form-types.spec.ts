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

  it('newRol/newRequisito no truenan cuando crypto.randomUUID no existe (HTTP sin TLS)', () => {
    vi.stubGlobal('crypto', {});
    expect(() => newRol()).not.toThrow();
    expect(() => newRequisito()).not.toThrow();
    expect(typeof newRol().id).toBe('string');
  });

  it('step1Schema acepta fechas en cualquier orden igual que el backend', () => {
    const result = step1Schema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'VIRTUAL',
      objetivosProyecto: '',
      ubicacionProyecto: '',
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '2026-12-10',
      fechaFinEstimada: '2026-12-01',
      roles: [],
    });
    expect(result.success).toBe(true);
  });

  it('step1Schema aplica los límites del DTO del backend', () => {
    const result = step1Schema.safeParse({
      tituloProyecto: 'x'.repeat(201),
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'REMOTO',
      objetivosProyecto: '',
      ubicacionProyecto: 'x'.repeat(256),
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '',
      fechaFinEstimada: '',
      roles: [],
    });
    expect(result.success).toBe(false);
    const errors = zodToFieldErrors(result as any);
    expect(errors.tituloProyecto).toBeTruthy();
    expect(errors.ubicacionProyecto).toBeTruthy();
    expect(errors.modalidadProyecto).toBeTruthy();
  });

  it('formSchema valida rol', () => {
    const result = formSchema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'VIRTUAL',
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

  it('formSchema valida habilidades incompletas junto a su campo', () => {
    const result = formSchema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'VIRTUAL',
      objetivosProyecto: '',
      ubicacionProyecto: '',
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '',
      fechaFinEstimada: '',
      roles: [
        {
          id: 'x',
          nombreRol: 'Desarrollador',
          descripcionRolProyecto: '',
          idCarreraRequerida: null,
          cupos: 1,
          horasSemanalesEstimadas: '',
          requisitos: [{ id: 'r', idHabilidad: null, nivelMinimo: '', obligatorio: false }],
        },
      ],
    });
    expect(result.success).toBe(false);
    const errors = zodToFieldErrors(result as any);
    expect(errors['roles.0.requisitos.0.idHabilidad']).toBeTruthy();
    expect(errors['roles.0.requisitos.0.nivelMinimo']).toBeTruthy();
  });

  it('step1Schema rechaza fechas inexistentes', () => {
    const result = step1Schema.safeParse({
      tituloProyecto: 'Proyecto test',
      descripcionProyecto: 'Descripcion suficientemente larga para pasar',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'VIRTUAL',
      objetivosProyecto: '',
      ubicacionProyecto: '',
      contextoAcademico: '',
      urlRecursoExterno: '',
      fechaInicio: '2026-02-30',
      fechaFinEstimada: '',
      roles: [],
    });
    expect(result.success).toBe(false);
    expect(zodToFieldErrors(result as any).fechaInicio).toBeTruthy();
  });

  it('isProfileIncomplete detecta perfil incompleto', () => {
    expect(isProfileIncomplete({ perfil: { biografia: null }, habilidades: [] } as any)).toBe(true);
    expect(isProfileIncomplete({ perfil: { biografia: 'ok' }, habilidades: [{ idUsuarioHabilidad: 1 }] } as any)).toBe(false);
  });
});
