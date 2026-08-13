import { describe, expect, it } from 'vitest';
import { ordenarMiembros } from '../components/projects/member-sort.utils';
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
    tareasActivas: 0,
    tareasCompletadas: 0,
    horasReconocidas: 0,
    ...overrides,
  };
}

describe('ordenarMiembros', () => {
  it('ordena por nombre ascendente sin distinguir mayúsculas/minúsculas', () => {
    const miembros = [
      miembro({ idUsuario: 1, nombre: 'zoe' }),
      miembro({ idUsuario: 2, nombre: 'Ana' }),
      miembro({ idUsuario: 3, nombre: 'bruno' }),
    ];

    const resultado = ordenarMiembros(miembros, 'nombre', 'asc');

    expect(resultado.map((m) => m.nombre)).toEqual(['Ana', 'bruno', 'zoe']);
  });

  it('ordena por nombre descendente', () => {
    const miembros = [
      miembro({ idUsuario: 1, nombre: 'Ana' }),
      miembro({ idUsuario: 2, nombre: 'Bruno' }),
    ];

    const resultado = ordenarMiembros(miembros, 'nombre', 'desc');

    expect(resultado.map((m) => m.nombre)).toEqual(['Bruno', 'Ana']);
  });

  it('ordena por roles usando el primer rol para desempatar alfabéticamente', () => {
    const miembros = [
      miembro({ idUsuario: 1, roles: [{ idRolProyecto: 1, nombreRol: 'QA' }] }),
      miembro({ idUsuario: 2, roles: [{ idRolProyecto: 2, nombreRol: 'Backend' }] }),
    ];

    const resultado = ordenarMiembros(miembros, 'roles', 'asc');

    expect(resultado.map((m) => m.roles[0].nombreRol)).toEqual(['Backend', 'QA']);
  });

  it('ordena numéricamente por tareasActivas, no alfabéticamente (10 después de 2)', () => {
    const miembros = [
      miembro({ idUsuario: 1, tareasActivas: 10 }),
      miembro({ idUsuario: 2, tareasActivas: 2 }),
      miembro({ idUsuario: 3, tareasActivas: 1 }),
    ];

    const resultado = ordenarMiembros(miembros, 'tareasActivas', 'asc');

    expect(resultado.map((m) => m.tareasActivas)).toEqual([1, 2, 10]);
  });

  it('ordena numéricamente por horasReconocidas', () => {
    const miembros = [
      miembro({ idUsuario: 1, horasReconocidas: 3.5 }),
      miembro({ idUsuario: 2, horasReconocidas: 12 }),
      miembro({ idUsuario: 3, horasReconocidas: 0 }),
    ];

    const resultado = ordenarMiembros(miembros, 'horasReconocidas', 'desc');

    expect(resultado.map((m) => m.horasReconocidas)).toEqual([12, 3.5, 0]);
  });

  it('no muta el arreglo original', () => {
    const miembros = [
      miembro({ idUsuario: 1, nombre: 'Zoe' }),
      miembro({ idUsuario: 2, nombre: 'Ana' }),
    ];
    const copiaOriginal = [...miembros];

    ordenarMiembros(miembros, 'nombre', 'asc');

    expect(miembros).toEqual(copiaOriginal);
  });

  it('un equipo vacío devuelve un arreglo vacío', () => {
    expect(ordenarMiembros([], 'nombre', 'asc')).toEqual([]);
  });
});
