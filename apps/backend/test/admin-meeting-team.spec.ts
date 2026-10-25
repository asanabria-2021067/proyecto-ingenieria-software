import { describe, expect, it, vi } from 'vitest';
import { equiposDeProyectos, proyectoDeCadaUsuario, unionDeEquipos } from '../src/events/admin-meeting-team';

const LIDER_A = 1;
const LIDER_B = 2;
const ANA = 10;
const BETO = 11;
const COMUN = 12;

function makeDb(participaciones: { idUsuario: number; estadoParticipacion: string; idProyecto: number }[], lideresActivos: number[]) {
  return {
    participacionProyecto: {
      findMany: vi.fn().mockResolvedValue(
        participaciones.map(({ idProyecto, ...p }) => ({ ...p, rolProyecto: { idProyecto } })),
      ),
    },
    usuario: { findMany: vi.fn().mockResolvedValue(lideresActivos.map((idUsuario) => ({ idUsuario }))) },
  };
}

describe('HU-195 · equiposDeProyectos', () => {
  it('incluye al líder aunque no tenga participación, y no lo duplica si también participa', async () => {
    const db = makeDb([{ idUsuario: LIDER_A, estadoParticipacion: 'ACTIVO', idProyecto: 100 }, { idUsuario: ANA, estadoParticipacion: 'ACTIVO', idProyecto: 100 }], [LIDER_A]);
    const equipos = await equiposDeProyectos(db as never, [{ idProyecto: 100, creadoPor: LIDER_A, estadoProyecto: 'EN_PROGRESO' }]);
    expect(equipos.get(100)).toEqual([LIDER_A, ANA]);
  });

  it('un líder con cuenta inactiva no se convoca', async () => {
    const db = makeDb([{ idUsuario: ANA, estadoParticipacion: 'ACTIVO', idProyecto: 100 }], []);
    const equipos = await equiposDeProyectos(db as never, [{ idProyecto: 100, creadoPor: LIDER_A, estadoProyecto: 'PUBLICADO' }]);
    expect(equipos.get(100)).toEqual([ANA]);
  });

  it('proyecto activo: solo ACTIVO; COMPLETADO no es su equipo vigente', async () => {
    const db = makeDb([
      { idUsuario: ANA, estadoParticipacion: 'ACTIVO', idProyecto: 100 },
      { idUsuario: BETO, estadoParticipacion: 'COMPLETADO', idProyecto: 100 },
    ], [LIDER_A]);
    const equipos = await equiposDeProyectos(db as never, [{ idProyecto: 100, creadoPor: LIDER_A, estadoProyecto: 'EN_PROGRESO' }]);
    expect(equipos.get(100)).toEqual([LIDER_A, ANA]);
  });

  it('proyecto CERRADO: el equipo histórico (COMPLETADO) más el líder', async () => {
    const db = makeDb([{ idUsuario: BETO, estadoParticipacion: 'COMPLETADO', idProyecto: 200 }], [LIDER_B]);
    const equipos = await equiposDeProyectos(db as never, [{ idProyecto: 200, creadoPor: LIDER_B, estadoProyecto: 'CERRADO' }]);
    expect(equipos.get(200)).toEqual([LIDER_B, BETO]);
  });

  it('la consulta excluye RETIRADO y cuentas no ACTIVO desde la base, no en memoria', async () => {
    const db = makeDb([], []);
    await equiposDeProyectos(db as never, [{ idProyecto: 100, creadoPor: LIDER_A, estadoProyecto: 'EN_PROGRESO' }]);
    expect(db.participacionProyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { rolProyecto: { idProyecto: { in: [100] } }, estadoParticipacion: { in: ['ACTIVO', 'COMPLETADO'] }, usuario: { estado: 'ACTIVO' } },
    }));
    expect(db.usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { idUsuario: { in: [LIDER_A] }, estado: 'ACTIVO' } }));
  });

  it('sin proyectos no consulta', async () => {
    const db = makeDb([], []);
    expect(await equiposDeProyectos(db as never, [])).toEqual(new Map());
    expect(db.participacionProyecto.findMany).not.toHaveBeenCalled();
  });
});

describe('HU-195 · unión de destinatarios y proyecto por usuario', () => {
  const equipos = new Map([[100, [LIDER_A, ANA, COMUN]], [200, [LIDER_B, COMUN, BETO]]]);

  it('quien está en dos proyectos convocados cuenta una sola vez', () => {
    expect(unionDeEquipos(equipos)).toEqual(new Set([LIDER_A, ANA, COMUN, LIDER_B, BETO]));
    expect(unionDeEquipos(equipos, [200])).toEqual(new Set([LIDER_B, COMUN, BETO]));
  });

  it('cada usuario queda asociado a un único proyecto, el primero del orden en que aparece', () => {
    const asignado = proyectoDeCadaUsuario(equipos, [100, 200]);
    expect(asignado.get(COMUN)).toBe(100);
    expect(asignado.get(BETO)).toBe(200);
    expect(asignado.size).toBe(5);
  });
});
