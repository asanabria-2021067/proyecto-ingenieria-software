import { describe, expect, it } from 'vitest';
import {
  sumarTareasActivas,
  sumarTareasCompletadas,
  sumarHorasReconocidas,
} from '../components/projects/team-metrics.utils';
import type { MiembroProyectoResumenDTO } from '../lib/dto/member.dto';

function miembro(overrides: Partial<MiembroProyectoResumenDTO> = {}): MiembroProyectoResumenDTO {
  return {
    idUsuario: 1,
    nombre: 'Ana',
    apellido: 'Lopez',
    correo: 'ana@uvg.edu.gt',
    fotoUrl: null,
    roles: [{ idRolProyecto: 1, nombreRol: 'Backend' }],
    estadoParticipacion: 'ACTIVO',
    grupo: 'ACTIVOS',
    tareasActivas: 0,
    tareasCompletadas: 0,
    horasReconocidas: 0,
    ...overrides,
  };
}

describe('sumarTareasActivas', () => {
  it('un proyecto sin integrantes suma 0, no produce error', () => {
    expect(sumarTareasActivas([])).toBe(0);
  });

  it('suma tareasActivas ya agregadas por integrante desde T-106', () => {
    const miembros = [
      miembro({ idUsuario: 1, tareasActivas: 2 }),
      miembro({ idUsuario: 2, tareasActivas: 3 }),
    ];
    expect(sumarTareasActivas(miembros)).toBe(5);
  });
});

describe('sumarTareasCompletadas', () => {
  it('un proyecto sin integrantes suma 0, no produce error', () => {
    expect(sumarTareasCompletadas([])).toBe(0);
  });

  it('suma tareasCompletadas ya agregadas por integrante desde T-106', () => {
    const miembros = [
      miembro({ idUsuario: 1, tareasCompletadas: 4 }),
      miembro({ idUsuario: 2, tareasCompletadas: 1 }),
    ];
    expect(sumarTareasCompletadas(miembros)).toBe(5);
  });
});

describe('sumarHorasReconocidas', () => {
  it('un proyecto sin integrantes suma 0, no produce error', () => {
    expect(sumarHorasReconocidas([])).toBe(0);
  });

  it('suma horasReconocidas (HorasParticipacion.horasAprobadas, APROBADA) por integrante', () => {
    const miembros = [
      miembro({ idUsuario: 1, horasReconocidas: 5 }),
      miembro({ idUsuario: 2, horasReconocidas: 7 }),
    ];
    expect(sumarHorasReconocidas(miembros)).toBe(12);
  });

  it('un integrante con múltiples roles no duplica horas: T-106 ya entrega un único total por persona', () => {
    // Person-centric: no hay una fila por rol que sumar dos veces, solo un
    // MiembroProyectoResumenDTO con roles[] de longitud 2.
    const miembros = [
      miembro({
        idUsuario: 1,
        roles: [
          { idRolProyecto: 1, nombreRol: 'Backend' },
          { idRolProyecto: 2, nombreRol: 'QA' },
        ],
        horasReconocidas: 8,
      }),
    ];
    expect(sumarHorasReconocidas(miembros)).toBe(8);
  });
});
