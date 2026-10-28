import { describe, expect, it, vi } from 'vitest';
import { PoliticaEdicionReunion } from '@prisma/client';
import {
  administradoresActivos,
  evaluarGestion,
  puedeCambiarPolitica,
} from '../src/events/admin-meeting-access';

const CREADOR = 1;
const AJENO = 2;
const EDITOR = 3;
const ESTUDIANTE = 9;
const reunion = (politicaEdicion: PoliticaEdicionReunion, editores: number[] = []) => ({ idCreador: CREADOR, politicaEdicion, editores });
const activos = (...ids: number[]) => new Set(ids);

describe('HU-195 · evaluarGestion', () => {
  it('quien no es administrador activo nunca gestiona, sea cual sea la política (estudiante, líder, revocado)', () => {
    for (const politica of Object.values(PoliticaEdicionReunion)) {
      expect(evaluarGestion(reunion(politica, [ESTUDIANTE]), ESTUDIANTE, activos(CREADOR))).toEqual({ puede: false });
      // El creador que perdió el rol tampoco gestiona su propia reunión.
      expect(evaluarGestion(reunion(politica), CREADOR, activos(AJENO))).toEqual({ puede: false });
    }
  });

  it('TODOS_ADMINISTRADORES: cualquier administrador activo, aunque no la haya creado', () => {
    expect(evaluarGestion(reunion('TODOS_ADMINISTRADORES'), AJENO, activos(CREADOR, AJENO))).toEqual({ puede: true, motivo: 'POLITICA' });
  });

  it('SOLO_CREADOR: el creador sí; otro administrador, no', () => {
    expect(evaluarGestion(reunion('SOLO_CREADOR'), CREADOR, activos(CREADOR, AJENO))).toEqual({ puede: true, motivo: 'POLITICA' });
    expect(evaluarGestion(reunion('SOLO_CREADOR'), AJENO, activos(CREADOR, AJENO))).toEqual({ puede: false });
  });

  it('ADMINISTRADORES_SELECCIONADOS: creador y editores; un administrador no seleccionado, no', () => {
    const r = reunion('ADMINISTRADORES_SELECCIONADOS', [EDITOR]);
    expect(evaluarGestion(r, CREADOR, activos(CREADOR, EDITOR, AJENO))).toEqual({ puede: true, motivo: 'POLITICA' });
    expect(evaluarGestion(r, EDITOR, activos(CREADOR, EDITOR, AJENO))).toEqual({ puede: true, motivo: 'POLITICA' });
    expect(evaluarGestion(r, AJENO, activos(CREADOR, EDITOR, AJENO))).toEqual({ puede: false });
  });

  it('un editor seleccionado que perdió el rol deja de gestionar', () => {
    expect(evaluarGestion(reunion('ADMINISTRADORES_SELECCIONADOS', [EDITOR]), EDITOR, activos(CREADOR))).toEqual({ puede: false });
  });

  describe('QC-01: respaldo cuando el creador ya no es administrador activo', () => {
    it('SOLO_CREADOR: cualquier administrador activo gestiona por respaldo', () => {
      expect(evaluarGestion(reunion('SOLO_CREADOR'), AJENO, activos(AJENO))).toEqual({ puede: true, motivo: 'RESPALDO_CREADOR_SIN_AUTORIZACION' });
    });

    it('SELECCIONADOS con un editor aún autorizado: solo ese editor; nadie más amplía acceso', () => {
      const r = reunion('ADMINISTRADORES_SELECCIONADOS', [EDITOR]);
      expect(evaluarGestion(r, EDITOR, activos(EDITOR, AJENO))).toEqual({ puede: true, motivo: 'POLITICA' });
      expect(evaluarGestion(r, AJENO, activos(EDITOR, AJENO))).toEqual({ puede: false });
    });

    it('SELECCIONADOS sin ningún editor autorizado: respaldo para cualquier administrador activo', () => {
      expect(evaluarGestion(reunion('ADMINISTRADORES_SELECCIONADOS', [EDITOR]), AJENO, activos(AJENO))).toEqual({ puede: true, motivo: 'RESPALDO_CREADOR_SIN_AUTORIZACION' });
    });
  });
});

describe('HU-195 · puedeCambiarPolitica', () => {
  it('solo el creador vigente; ni un administrador ajeno, ni un editor, ni el respaldo', () => {
    expect(puedeCambiarPolitica({ idCreador: CREADOR }, CREADOR, activos(CREADOR))).toBe(true);
    expect(puedeCambiarPolitica({ idCreador: CREADOR }, AJENO, activos(CREADOR, AJENO))).toBe(false);
    expect(puedeCambiarPolitica({ idCreador: CREADOR }, CREADOR, activos(AJENO))).toBe(false);
  });
});

describe('HU-195 · administradoresActivos', () => {
  it('consulta rol administrador y cuenta ACTIVO con el tx recibido, deduplicando ids', async () => {
    const findMany = vi.fn().mockResolvedValue([{ idUsuario: 1 }]);
    const tx = { usuarioRolAcceso: { findMany } } as never;
    expect(await administradoresActivos(tx, [1, 1, 2])).toEqual(new Set([1]));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { idUsuario: { in: [1, 2] }, rolAcceso: { nombrePerfil: 'administrador' }, usuario: { estado: 'ACTIVO' } },
    }));
  });

  it('sin ids no consulta', async () => {
    const findMany = vi.fn();
    expect(await administradoresActivos({ usuarioRolAcceso: { findMany } } as never, [])).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });
});
