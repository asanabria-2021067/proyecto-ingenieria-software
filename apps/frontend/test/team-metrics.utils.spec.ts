import { describe, expect, it } from 'vitest';
import { contarIntegrantesActivos, sumarHorasAcumuladas } from '../components/projects/team-metrics.utils';
import type { ParticipacionActivaDTO } from '../lib/dto/member.dto';

function miembro(overrides: Partial<ParticipacionActivaDTO> = {}): ParticipacionActivaDTO {
  return {
    idParticipacion: 1,
    estadoParticipacion: 'ACTIVO',
    fechaIngreso: '2026-01-01T00:00:00.000Z',
    tareasActivas: 0,
    horasRegistradas: 0,
    usuario: { idUsuario: 1, nombre: 'Ana', apellido: 'Lopez', correo: 'ana@uvg.edu.gt', fotoUrl: null },
    rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend', descripcionRolProyecto: null },
    ...overrides,
  };
}

describe('contarIntegrantesActivos', () => {
  it('un proyecto sin integrantes cuenta 0, no produce error', () => {
    expect(contarIntegrantesActivos([])).toBe(0);
  });

  it('cuenta cada usuario distinto una vez', () => {
    const equipo = [
      miembro({ idParticipacion: 1, usuario: { ...miembro().usuario, idUsuario: 1 } }),
      miembro({ idParticipacion: 2, usuario: { ...miembro().usuario, idUsuario: 2 } }),
    ];
    expect(contarIntegrantesActivos(equipo)).toBe(2);
  });

  it('un usuario con dos participaciones activas (dos roles) cuenta como un solo integrante', () => {
    // Mismo usuario (idUsuario: 1, valor por defecto del fixture), dos filas
    // porque tiene dos roles activos distintos en el proyecto.
    const equipo = [
      miembro({ idParticipacion: 10, rolProyecto: { idRolProyecto: 1, nombreRol: 'Backend', descripcionRolProyecto: null } }),
      miembro({ idParticipacion: 11, rolProyecto: { idRolProyecto: 2, nombreRol: 'QA', descripcionRolProyecto: null } }),
    ];
    expect(contarIntegrantesActivos(equipo)).toBe(1);
  });
});

describe('sumarHorasAcumuladas', () => {
  it('un proyecto sin integrantes suma 0, no produce error', () => {
    expect(sumarHorasAcumuladas([])).toBe(0);
  });

  it('suma las horas de usuarios distintos', () => {
    const equipo = [
      miembro({ idParticipacion: 1, usuario: { ...miembro().usuario, idUsuario: 1 }, horasRegistradas: 4 }),
      miembro({ idParticipacion: 2, usuario: { ...miembro().usuario, idUsuario: 2 }, horasRegistradas: 6.5 }),
    ];
    expect(sumarHorasAcumuladas(equipo)).toBe(10.5);
  });

  it('un usuario con dos roles activos NO duplica sus horas (findTeam repite el mismo total en cada fila)', () => {
    const equipo = [
      miembro({ idParticipacion: 10, horasRegistradas: 8 }),
      miembro({ idParticipacion: 11, horasRegistradas: 8 }),
    ];
    // Ambas filas son el mismo usuario (idUsuario: 1 por defecto en el fixture)
    // con el mismo total agregado — sumar debe dar 8, no 16.
    expect(sumarHorasAcumuladas(equipo)).toBe(8);
  });
});
