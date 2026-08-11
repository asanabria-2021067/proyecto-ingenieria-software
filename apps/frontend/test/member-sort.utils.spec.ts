import { describe, expect, it } from 'vitest';
import { ordenarEquipo } from '../components/projects/member-sort.utils';
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

describe('ordenarEquipo', () => {
  it('ordena por nombre ascendente sin distinguir mayúsculas/minúsculas', () => {
    const equipo = [
      miembro({ idParticipacion: 1, usuario: { ...miembro().usuario, nombre: 'zoe' } }),
      miembro({ idParticipacion: 2, usuario: { ...miembro().usuario, nombre: 'Ana' } }),
      miembro({ idParticipacion: 3, usuario: { ...miembro().usuario, nombre: 'bruno' } }),
    ];

    const resultado = ordenarEquipo(equipo, 'nombre', 'asc');

    expect(resultado.map((m) => m.usuario.nombre)).toEqual(['Ana', 'bruno', 'zoe']);
  });

  it('ordena por nombre descendente', () => {
    const equipo = [
      miembro({ idParticipacion: 1, usuario: { ...miembro().usuario, nombre: 'Ana' } }),
      miembro({ idParticipacion: 2, usuario: { ...miembro().usuario, nombre: 'Bruno' } }),
    ];

    const resultado = ordenarEquipo(equipo, 'nombre', 'desc');

    expect(resultado.map((m) => m.usuario.nombre)).toEqual(['Bruno', 'Ana']);
  });

  it('ordena por rol', () => {
    const equipo = [
      miembro({ idParticipacion: 1, rolProyecto: { idRolProyecto: 1, nombreRol: 'QA', descripcionRolProyecto: null } }),
      miembro({ idParticipacion: 2, rolProyecto: { idRolProyecto: 2, nombreRol: 'Backend', descripcionRolProyecto: null } }),
    ];

    const resultado = ordenarEquipo(equipo, 'rol', 'asc');

    expect(resultado.map((m) => m.rolProyecto.nombreRol)).toEqual(['Backend', 'QA']);
  });

  it('ordena numéricamente por tareasActivas, no alfabéticamente (10 después de 2)', () => {
    const equipo = [
      miembro({ idParticipacion: 1, tareasActivas: 10 }),
      miembro({ idParticipacion: 2, tareasActivas: 2 }),
      miembro({ idParticipacion: 3, tareasActivas: 1 }),
    ];

    const resultado = ordenarEquipo(equipo, 'tareasActivas', 'asc');

    expect(resultado.map((m) => m.tareasActivas)).toEqual([1, 2, 10]);
  });

  it('ordena numéricamente por horasRegistradas', () => {
    const equipo = [
      miembro({ idParticipacion: 1, horasRegistradas: 3.5 }),
      miembro({ idParticipacion: 2, horasRegistradas: 12 }),
      miembro({ idParticipacion: 3, horasRegistradas: 0 }),
    ];

    const resultado = ordenarEquipo(equipo, 'horasRegistradas', 'desc');

    expect(resultado.map((m) => m.horasRegistradas)).toEqual([12, 3.5, 0]);
  });

  it('no muta el arreglo original', () => {
    const equipo = [
      miembro({ idParticipacion: 1, usuario: { ...miembro().usuario, nombre: 'Zoe' } }),
      miembro({ idParticipacion: 2, usuario: { ...miembro().usuario, nombre: 'Ana' } }),
    ];
    const copiaOriginal = [...equipo];

    ordenarEquipo(equipo, 'nombre', 'asc');

    expect(equipo).toEqual(copiaOriginal);
  });

  it('un equipo vacío devuelve un arreglo vacío', () => {
    expect(ordenarEquipo([], 'nombre', 'asc')).toEqual([]);
  });
});
