import { describe, expect, it } from 'vitest';
import { EstadoProyecto } from '@prisma/client';
import { ProjectsController } from '../src/projects/projects.controller';
import { ProjectsService } from '../src/projects/projects.service';

// Integration test for HU-59 (T-234): GET /proyectos/destacados
// Real ProjectsController + real ProjectsService wired together, against an
// in-memory Prisma double and an in-memory cache double. Follows the same
// pattern as password-recovery-admin.e2e.spec.ts (see that file's note on why
// a real Nest TestingModule + supertest is avoided under Vitest).

function proyecto(overrides: Partial<any> = {}) {
  return {
    idProyecto: 1,
    tituloProyecto: 'Proyecto',
    descripcionProyecto: 'Descripcion',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: EstadoProyecto.PUBLICADO,
    modalidadProyecto: 'VIRTUAL',
    fechaPublicacion: new Date(),
    organizaciones: [],
    intereses: [],
    eliminadoEn: null,
    roles: [],
    ...overrides,
  };
}

function rolesConPostulaciones(...cantidades: number[]) {
  return cantidades.map((n) => ({ _count: { postulaciones: n } }));
}

function makeFakePrisma(dataset: any[]) {
  return {
    proyecto: {
      findMany: async ({ where }: any) => {
        const estadosPermitidos: EstadoProyecto[] = where.estadoProyecto.in;
        return dataset.filter(
          (p) => estadosPermitidos.includes(p.estadoProyecto) && p.eliminadoEn === where.eliminadoEn,
        );
      },
    },
  } as any;
}

function makeFakeCache() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as any;
}

function makeController(dataset: any[]) {
  const service = new ProjectsService(makeFakePrisma(dataset), {} as any, makeFakeCache());
  return new ProjectsController(service);
}

describe('GET /proyectos/destacados (HU-59)', () => {
  it('solo incluye proyectos activos, no los archivados/cerrados/cancelados/borrador', async () => {
    const dataset = [
      proyecto({ idProyecto: 1, estadoProyecto: EstadoProyecto.PUBLICADO, roles: rolesConPostulaciones(3) }),
      proyecto({ idProyecto: 2, estadoProyecto: EstadoProyecto.EN_PROGRESO, roles: rolesConPostulaciones(2) }),
      proyecto({ idProyecto: 3, estadoProyecto: EstadoProyecto.CERRADO, roles: rolesConPostulaciones(10) }),
      proyecto({ idProyecto: 4, estadoProyecto: EstadoProyecto.CANCELADO, roles: rolesConPostulaciones(10) }),
      proyecto({ idProyecto: 5, estadoProyecto: EstadoProyecto.BORRADOR, roles: rolesConPostulaciones(10) }),
      proyecto({ idProyecto: 6, estadoProyecto: EstadoProyecto.PUBLICADO, eliminadoEn: new Date(), roles: rolesConPostulaciones(10) }),
    ];

    const result = await makeController(dataset).findFeatured();

    expect(result.map((p: any) => p.idProyecto).sort()).toEqual([1, 2]);
  });

  it('limita el resultado a un maximo de 6 proyectos destacados', async () => {
    const dataset = Array.from({ length: 9 }, (_, i) =>
      proyecto({ idProyecto: i + 1, roles: rolesConPostulaciones(i) }),
    );

    const result = await makeController(dataset).findFeatured();

    expect(result.length).toBe(6);
  });

  it('aplica el criterio de destacado: mas postulaciones primero', async () => {
    const dataset = [
      proyecto({ idProyecto: 1, roles: rolesConPostulaciones(1) }),
      proyecto({ idProyecto: 2, roles: rolesConPostulaciones(5, 5) }),
      proyecto({ idProyecto: 3, roles: rolesConPostulaciones(3) }),
    ];

    const result = await makeController(dataset).findFeatured();

    expect(result.map((p: any) => p.idProyecto)).toEqual([2, 3, 1]);
  });

  it('no expone el conteo interno de postulaciones usado para ordenar', async () => {
    const dataset = [proyecto({ idProyecto: 1, roles: rolesConPostulaciones(4) })];

    const result = await makeController(dataset).findFeatured();

    expect(result[0]).not.toHaveProperty('totalPostulaciones');
    expect(result[0]).not.toHaveProperty('roles');
  });
});
