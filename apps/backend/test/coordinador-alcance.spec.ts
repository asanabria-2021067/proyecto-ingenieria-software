import { ForbiddenException } from '@nestjs/common';
import { EstadoProyecto } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  alcanceDelActor,
  carrerasCubiertas,
  carrerasDelProyecto,
  coordinadorCubreEstudiante,
  coordinadorCubreProyecto,
  cubre,
  proyectoEnAlcanceWhere,
} from '../src/coordinador/coordinador-alcance';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';

const COMPUTACION = 1;
const INDUSTRIAL = 2;
const DISENO = 3;
const CATALOGO = [
  { idCarrera: COMPUTACION, facultad: 'Ingeniería' },
  { idCarrera: INDUSTRIAL, facultad: 'Ingeniería' },
  { idCarrera: DISENO, facultad: 'Diseño' },
];

describe('carrerasDelProyecto', () => {
  it('usa la carrera propia aunque haya líder y asociación', () => {
    expect(carrerasDelProyecto({ idCarrera: DISENO, carreraLider: COMPUTACION, carrerasAsociacion: [INDUSTRIAL] })).toEqual([DISENO]);
  });

  it('sin carrera propia ni asociación usa la del líder', () => {
    expect(carrerasDelProyecto({ idCarrera: null, carreraLider: COMPUTACION, carrerasAsociacion: [] })).toEqual([COMPUTACION]);
  });

  it('sin carrera propia, la asociación dueña manda sobre el líder y aporta todas sus carreras', () => {
    expect(carrerasDelProyecto({ idCarrera: null, carreraLider: DISENO, carrerasAsociacion: [COMPUTACION, INDUSTRIAL] })).toEqual([
      COMPUTACION,
      INDUSTRIAL,
    ]);
  });

  it('sin ninguna carrera no pertenece a nadie', () => {
    expect(carrerasDelProyecto({ idCarrera: null, carreraLider: null, carrerasAsociacion: [] })).toEqual([]);
  });
});

describe('carrerasCubiertas y cubre', () => {
  it('una facultad cubre todas sus carreras y ninguna de otra facultad', () => {
    const cubiertas = carrerasCubiertas([{ idCarrera: null, facultad: 'Ingeniería' }], CATALOGO);
    expect(cubiertas.sort()).toEqual([COMPUTACION, INDUSTRIAL]);
    expect(cubre(cubiertas, [DISENO])).toBe(false);
    expect(cubre(cubiertas, [DISENO, INDUSTRIAL])).toBe(true);
  });

  it('carreras sueltas y facultad se suman sin repetir', () => {
    const cubiertas = carrerasCubiertas(
      [
        { idCarrera: DISENO, facultad: null },
        { idCarrera: null, facultad: 'Ingeniería' },
        { idCarrera: COMPUTACION, facultad: null },
      ],
      CATALOGO,
    );
    expect(cubiertas.sort()).toEqual([COMPUTACION, INDUSTRIAL, DISENO]);
  });

  it('sin alcance no cubre nada', () => {
    const cubiertas = carrerasCubiertas([], CATALOGO);
    expect(cubiertas).toEqual([]);
    expect(cubre(cubiertas, [COMPUTACION])).toBe(false);
  });

  it('un objetivo sin carreras nunca queda cubierto', () => {
    expect(cubre([COMPUTACION], [])).toBe(false);
  });
});

describe('proyectoEnAlcanceWhere', () => {
  it('replica la regla en tres ramas: propia, asociación y líder', () => {
    const where = proyectoEnAlcanceWhere([COMPUTACION]);
    expect(where.OR).toHaveLength(3);
  });
});

function fakeDb(opts: {
  roles: string[];
  alcance?: { idCarrera: number | null; facultad: string | null }[];
  proyecto?: unknown;
  perfil?: { idCarrera: number | null } | null;
  participa?: boolean;
}) {
  return {
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { rolAcceso: { nombrePerfil: string } } }) =>
        opts.roles.includes(where.rolAcceso.nombrePerfil) ? { idUsuarioRolAcceso: 1 } : null),
    },
    alcanceCoordinador: { findMany: vi.fn(async () => opts.alcance ?? []) },
    carrera: {
      findMany: vi.fn(async ({ where }: { where: { facultad: { in: string[] } } }) =>
        CATALOGO.filter((c) => where.facultad.in.includes(c.facultad))),
    },
    proyecto: { findUnique: vi.fn(async () => opts.proyecto ?? null) },
    perfilEstudiante: { findUnique: vi.fn(async () => opts.perfil ?? null) },
    participacionProyecto: { findFirst: vi.fn(async () => (opts.participa ? { idParticipacion: 1 } : null)) },
  } as never;
}

const proyectoDeLider = (carreraLider: number | null, idCarrera: number | null = null, carreras: number[] = [], creadoPor = 99) => ({
  creadoPor,
  idCarrera,
  creador: { perfil: carreraLider === null ? null : { idCarrera: carreraLider } },
  asociacion: carreras.length ? { carreras: carreras.map((c) => ({ idCarrera: c })) } : null,
});

describe('coordinadorCubreProyecto y coordinadorCubreEstudiante', () => {
  it('cubre el proyecto cuya carrera de líder está en su alcance', async () => {
    const db = fakeDb({ roles: ['coordinador_academico'], alcance: [{ idCarrera: COMPUTACION, facultad: null }], proyecto: proyectoDeLider(COMPUTACION) });
    expect(await coordinadorCubreProyecto(db, 7, 10)).toBe(true);
  });

  it('no cubre el proyecto de otra carrera', async () => {
    const db = fakeDb({ roles: ['coordinador_academico'], alcance: [{ idCarrera: COMPUTACION, facultad: null }], proyecto: proyectoDeLider(INDUSTRIAL) });
    expect(await coordinadorCubreProyecto(db, 7, 10)).toBe(false);
  });

  it('una facultad cubre el proyecto de una asociación con carreras de ella', async () => {
    const db = fakeDb({
      roles: ['coordinador_academico'],
      alcance: [{ idCarrera: null, facultad: 'Ingeniería' }],
      proyecto: proyectoDeLider(DISENO, null, [INDUSTRIAL, DISENO]),
    });
    expect(await coordinadorCubreProyecto(db, 7, 10)).toBe(true);
  });

  it('no cubre el proyecto que lidera ni uno en el que participa, aunque sea de su carrera', async () => {
    const base = { roles: ['coordinador_academico'], alcance: [{ idCarrera: COMPUTACION, facultad: null }] };
    expect(await coordinadorCubreProyecto(fakeDb({ ...base, proyecto: proyectoDeLider(COMPUTACION, null, [], 7) }), 7, 10)).toBe(false);
    expect(await coordinadorCubreProyecto(fakeDb({ ...base, proyecto: proyectoDeLider(COMPUTACION), participa: true }), 7, 10)).toBe(false);
  });

  it('sin el rol, aunque tenga filas de alcance, no cubre nada', async () => {
    const db = fakeDb({ roles: ['estudiante'], alcance: [{ idCarrera: COMPUTACION, facultad: null }], proyecto: proyectoDeLider(COMPUTACION) });
    expect(await coordinadorCubreProyecto(db, 7, 10)).toBe(false);
    expect(await coordinadorCubreEstudiante(db, 7, 20)).toBe(false);
  });

  it('sin alcance asignado no cubre nada', async () => {
    const db = fakeDb({ roles: ['coordinador_academico'], proyecto: proyectoDeLider(COMPUTACION) });
    expect(await coordinadorCubreProyecto(db, 7, 10)).toBe(false);
  });

  it('cubre al estudiante por la carrera de su perfil y no a uno sin carrera', async () => {
    const base = { roles: ['coordinador_academico'], alcance: [{ idCarrera: null, facultad: 'Ingeniería' }] };
    expect(await coordinadorCubreEstudiante(fakeDb({ ...base, perfil: { idCarrera: INDUSTRIAL } }), 7, 20)).toBe(true);
    expect(await coordinadorCubreEstudiante(fakeDb({ ...base, perfil: { idCarrera: DISENO } }), 7, 20)).toBe(false);
    expect(await coordinadorCubreEstudiante(fakeDb({ ...base, perfil: { idCarrera: null } }), 7, 20)).toBe(false);
  });
});

describe('alcanceDelActor', () => {
  it('el administrador no tiene restricción', async () => {
    expect(await alcanceDelActor(fakeDb({ roles: ['administrador'] }), 1)).toBeUndefined();
  });

  it('el coordinador recibe sus carreras', async () => {
    const db = fakeDb({ roles: ['coordinador_academico'], alcance: [{ idCarrera: null, facultad: 'Diseño' }] });
    expect(await alcanceDelActor(db, 1)).toEqual([DISENO]);
  });

  it('cualquier otro rol recibe 403', async () => {
    await expect(alcanceDelActor(fakeDb({ roles: ['estudiante'] }), 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProjectPolicyService - ADMIN_O_COORDINADOR', () => {
  const policy = new ProjectPolicyService({} as never);
  const proyecto = { idProyecto: 10, creadoPor: 1, estadoProyecto: EstadoProyecto.EN_REVISION, eliminadoEn: null };
  const actuar = (db: unknown, actor: number) => policy.assertActorTx(db as never, proyecto, 'ADMIN_O_COORDINADOR', actor);

  it('el administrador pasa en cualquier proyecto', async () => {
    await expect(actuar(fakeDb({ roles: ['administrador'] }), 3)).resolves.toBeUndefined();
  });

  it('el coordinador pasa solo dentro de su alcance', async () => {
    const alcance = [{ idCarrera: COMPUTACION, facultad: null }];
    const propio = fakeDb({ roles: ['coordinador_academico'], alcance, proyecto: proyectoDeLider(COMPUTACION) });
    const ajeno = fakeDb({ roles: ['coordinador_academico'], alcance, proyecto: proyectoDeLider(INDUSTRIAL) });
    await expect(actuar(propio, 3)).resolves.toBeUndefined();
    await expect(actuar(ajeno, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el coordinador que lidera o participa en el proyecto recibe 403 (no se revisa a sí mismo), el administrador no', async () => {
    const alcance = [{ idCarrera: COMPUTACION, facultad: null }];
    const lidera = fakeDb({ roles: ['coordinador_academico'], alcance, proyecto: proyectoDeLider(COMPUTACION, null, [], 3) });
    const participa = fakeDb({ roles: ['coordinador_academico'], alcance, proyecto: proyectoDeLider(COMPUTACION), participa: true });
    const admin = fakeDb({ roles: ['administrador'], proyecto: proyectoDeLider(COMPUTACION, null, [], 3), participa: true });
    await expect(actuar(lidera, 3)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(actuar(participa, 3)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(actuar(admin, 3)).resolves.toBeUndefined();
  });

  it('un estudiante recibe 403', async () => {
    await expect(actuar(fakeDb({ roles: ['estudiante'] }), 3)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
