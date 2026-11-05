/* eslint-disable @typescript-eslint/no-explicit-any -- dobles de Prisma sin tipar, igual que projects-discovery.service.spec */
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ArgumentMetadata, BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { SocialService } from '../src/social/social.service';
import { ProjectsService } from '../src/projects/projects.service';
import { ProjectsAffinityService } from '../src/projects/projects-affinity.service';
import { RolesService } from '../src/roles/roles.service';
import { cierraPronto } from '../src/projects/projects.read-model';
import { CreateProjectFullDto } from '../src/projects/dto/create-project-full.dto';
import { UpdateProjectDto } from '../src/projects/dto/update-project.dto';
import { CreateRoleDto } from '../src/roles/dto/create-role.dto';
import { UpdateRoleDto } from '../src/roles/dto/update-role.dto';
import { CreatePostulacionDto } from '../src/applications/dto/create-postulacion.dto';
import { makeTimeRecordsDouble } from './helpers/time-records.fixture';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const parse = <T>(metatype: new () => T, plain: unknown) =>
  pipe.transform(plain, { type: 'body', metatype } as ArgumentMetadata) as Promise<T>;

const pregunta = (over: Record<string, unknown> = {}) => ({ enunciado: '¿Tienes experiencia?', tipo: 'CORTA', obligatoria: true, ...over });
const rol = (over: Record<string, unknown> = {}) => ({ nombreRol: 'Backend', cupos: 1, ...over });

describe('MEJ-97: DTO de preguntas por rol', () => {
  it('acepta hasta 5 preguntas cortas o largas, obligatorias u opcionales, y recorta el enunciado', async () => {
    const preguntas = [
      pregunta({ enunciado: '  Con espacios  ' }),
      pregunta({ tipo: 'LARGA', obligatoria: false }),
      pregunta(),
      pregunta(),
      pregunta(),
    ];
    const dto = await parse(CreateRoleDto, rol({ preguntas }));
    expect(dto.preguntas).toHaveLength(5);
    expect(dto.preguntas?.[0].enunciado).toBe('Con espacios');
  });

  it.each([
    ['más de 5 preguntas', { preguntas: Array.from({ length: 6 }, () => pregunta()) }],
    ['tipo desconocido', { preguntas: [pregunta({ tipo: 'MEDIA' })] }],
    ['enunciado vacío', { preguntas: [pregunta({ enunciado: '   ' })] }],
    ['enunciado de más de 200 caracteres', { preguntas: [pregunta({ enunciado: 'a'.repeat(201) })] }],
    ['obligatoria que no es booleano', { preguntas: [pregunta({ obligatoria: 'si' })] }],
    ['campo extra', { preguntas: [pregunta({ extra: 1 })] }],
  ])('rechaza %s en crear y en editar un rol', async (_caso, extra) => {
    await expect(parse(CreateRoleDto, rol(extra))).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(UpdateRoleDto, extra)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('las preguntas se aceptan en el paso de roles al crear y al editar el proyecto', async () => {
    const full = await parse(CreateProjectFullDto, {
      tituloProyecto: 'Proyecto de prueba',
      descripcionProyecto: 'Descripción de al menos veinte caracteres',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      modalidadProyecto: 'MIXTA',
      accion: 'BORRADOR',
      fechaLimitePostulacion: '2026-12-01',
      roles: [rol({ preguntas: [pregunta()] })],
    });
    expect(full.roles?.[0].preguntas).toHaveLength(1);
    const upd = await parse(UpdateProjectDto, { fechaLimitePostulacion: '2026-12-01', roles: [rol({ preguntas: [pregunta()] })] });
    expect(upd.roles?.[0].preguntas).toHaveLength(1);
    await expect(
      parse(CreateProjectFullDto, {
        tituloProyecto: 'Proyecto de prueba',
        descripcionProyecto: 'Descripción de al menos veinte caracteres',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        modalidadProyecto: 'MIXTA',
        accion: 'BORRADOR',
        roles: [rol({ preguntas: Array.from({ length: 6 }, () => pregunta()) })],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la postulación acepta respuestas (máximo 5) y la justificación sigue pidiendo 40 caracteres', async () => {
    const base = { idRolProyecto: 1, justificacion: 'x'.repeat(40) };
    await expect(parse(CreatePostulacionDto, { ...base, respuestas: [{ idPregunta: 1, respuesta: 'ok' }] })).resolves.toBeDefined();
    await expect(parse(CreatePostulacionDto, { ...base, justificacion: 'corta' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      parse(CreatePostulacionDto, { ...base, respuestas: Array.from({ length: 6 }, () => ({ idPregunta: 1, respuesta: 'a' })) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      parse(CreatePostulacionDto, { ...base, respuestas: [{ idPregunta: 1, respuesta: 'a'.repeat(2001) }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MEJ-95: «Cierra pronto»', () => {
  const hoy = '2026-11-03';
  const fecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

  it.each([
    ['2026-11-03', true],
    ['2026-11-10', true],
    ['2026-11-11', false],
    ['2026-11-02', false],
    ['2026-12-31', false],
  ])('fecha límite %s => %s', (dia, esperado) => {
    expect(cierraPronto(fecha(dia), hoy)).toBe(esperado);
  });

  it('sin fecha límite no cierra pronto', () => {
    expect(cierraPronto(null, hoy)).toBe(false);
    expect(cierraPronto(undefined, hoy)).toBe(false);
  });
});

function crearProyectos(tx: Record<string, any> = {}) {
  const prisma: Record<string, any> = {
    proyecto: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    proyectoGuardado: { findMany: vi.fn().mockResolvedValue([]) },
    rolProyecto: { create: vi.fn() },
    requisitoHabilidadRol: { createMany: vi.fn() },
    ...tx,
  };
  const service = new ProjectsService(
    prisma as unknown as PrismaService,
    { persistAdminsTx: vi.fn() } as unknown as NotificationsService,
    {} as unknown as Cache,
    makeProjectTransactionDouble({ tx: prisma, project: { creadoPor: 7, estadoProyecto: 'BORRADOR' } }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
    {} as unknown as SocialService,
  );
  return { prisma, service };
}

describe('MEJ-95: orden por fecha límite en Explorar', () => {
  it('orden=fechaLimite ordena ascendente con las fechas nulas al final y desempata por recencia', async () => {
    const { prisma, service } = crearProyectos();
    await service.findAllPaginated({ orden: 'fechaLimite', page: 1, limit: 12 });
    expect(prisma.proyecto.findMany.mock.calls[0][0].orderBy).toEqual([
      { fechaLimitePostulacion: { sort: 'asc', nulls: 'last' } },
      { fechaCreacion: 'desc' },
    ]);
  });

  it('sin orden o con un valor desconocido se conserva la recencia', async () => {
    for (const orden of [undefined, 'otro']) {
      const { prisma, service } = crearProyectos();
      await service.findAllPaginated({ orden, page: 1, limit: 12 });
      expect(prisma.proyecto.findMany.mock.calls[0][0].orderBy).toEqual({ fechaCreacion: 'desc' });
    }
  });

  it('el listado trae la fecha límite y la marca cierraPronto', async () => {
    const { prisma, service } = crearProyectos();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const lejos = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    prisma.proyecto.findMany.mockResolvedValue([
      { idProyecto: 1, fechaLimitePostulacion: manana, roles: [] },
      { idProyecto: 2, fechaLimitePostulacion: lejos, roles: [] },
      { idProyecto: 3, fechaLimitePostulacion: null, roles: [] },
    ]);
    const { data } = await service.findAllPaginated({ page: 1, limit: 12 });
    expect(data.map((p) => p.cierraPronto)).toEqual([true, false, false]);
    expect(prisma.proyecto.findMany.mock.calls[0][0].select.fechaLimitePostulacion).toBe(true);
  });
});

describe('MEJ-97/95: crear y editar el proyecto guarda preguntas y fecha límite', () => {
  it('createFull anida las preguntas de cada rol en orden y guarda la fecha límite', async () => {
    const { prisma, service } = crearProyectos();
    prisma.proyecto.create.mockResolvedValue({ idProyecto: 1, estadoProyecto: 'BORRADOR', tituloProyecto: 'T', roles: [] });
    await service.createFull(
      {
        tituloProyecto: 'Proyecto de prueba',
        descripcionProyecto: 'Descripción de al menos veinte caracteres',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        modalidadProyecto: 'MIXTA',
        accion: 'BORRADOR',
        fechaLimitePostulacion: '2026-12-01',
        roles: [
          { nombreRol: 'Backend', cupos: 1, preguntas: [{ enunciado: 'A', tipo: 'CORTA', obligatoria: true }, { enunciado: 'B', tipo: 'LARGA', obligatoria: false }] },
          { nombreRol: 'Diseño', cupos: 1 },
        ],
      } as never,
      7,
    );
    const data = prisma.proyecto.create.mock.calls[0][0].data;
    expect(data.fechaLimitePostulacion).toEqual(new Date('2026-12-01'));
    expect(data.roles.create[0].preguntas).toEqual({
      create: [
        { enunciado: 'A', tipo: 'CORTA', obligatoria: true, orden: 0 },
        { enunciado: 'B', tipo: 'LARGA', obligatoria: false, orden: 1 },
      ],
    });
    expect(data.roles.create[1].preguntas).toBeUndefined();
  });

  it('update de un proyecto en borrador reemplaza los roles con sus preguntas y guarda la fecha límite', async () => {
    const tx = {
      participacionProyecto: { count: vi.fn().mockResolvedValue(0) },
      rolProyecto: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), create: vi.fn().mockResolvedValue({ idRolProyecto: 5 }) },
    };
    const { prisma, service } = crearProyectos(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, estadoProyecto: 'BORRADOR', creadoPor: 7, tituloProyecto: 'T' });
    prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: 3 });
    await service.update(
      3,
      { fechaLimitePostulacion: '2026-12-01', roles: [{ nombreRol: 'Backend', cupos: 1, preguntas: [{ enunciado: 'A', tipo: 'CORTA', obligatoria: true }] }] } as never,
      7,
    );
    expect(prisma.proyecto.update.mock.calls[0][0].data.fechaLimitePostulacion).toEqual(new Date('2026-12-01'));
    expect(tx.rolProyecto.create.mock.calls[0][0].data.preguntas).toEqual({
      create: [{ enunciado: 'A', tipo: 'CORTA', obligatoria: true, orden: 0 }],
    });
  });

  it('fechaLimitePostulacion null la quita (no new Date(null)) en edición completa y parcial', async () => {
    const { prisma, service } = crearProyectos();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, estadoProyecto: 'PUBLICADO', creadoPor: 7, tituloProyecto: 'T' });
    prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: 3 });
    await service.update(3, { fechaLimitePostulacion: null }, 7);
    expect(prisma.proyecto.update.mock.calls[0][0].data.fechaLimitePostulacion).toBeNull();

    const borrador = crearProyectos();
    borrador.prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, estadoProyecto: 'BORRADOR', creadoPor: 7, tituloProyecto: 'T' });
    borrador.prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: 3 });
    await borrador.service.update(3, { fechaLimitePostulacion: null } as never, 7);
    expect(borrador.prisma.proyecto.update.mock.calls[0][0].data.fechaLimitePostulacion).toBeNull();
  });

  it('el DTO acepta null en fechaLimitePostulacion', async () => {
    const upd = await parse(UpdateProjectDto, { fechaLimitePostulacion: null });
    expect(upd.fechaLimitePostulacion).toBeNull();
  });

  it('el detalle (público y del dueño) calcula cierraPronto', async () => {
    const { prisma, service } = crearProyectos();
    const manana = new Date(Date.now() + 86_400_000);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, creadoPor: 7, fechaLimitePostulacion: manana });
    expect((await service.findOne(3, true)).cierraPronto).toBe(true);
    expect((await service.findOneOwner(3, 7)).cierraPronto).toBe(true);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, creadoPor: 7, fechaLimitePostulacion: null });
    expect((await service.findOne(3, true)).cierraPronto).toBe(false);
  });

  it('un proyecto publicado permite mover la fecha límite de postulación', async () => {
    const { prisma, service } = crearProyectos();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 3, estadoProyecto: 'PUBLICADO', creadoPor: 7, tituloProyecto: 'T' });
    prisma.proyecto.findUnique.mockResolvedValue({ idProyecto: 3 });
    await service.update(3, { fechaLimitePostulacion: '2026-12-15' }, 7);
    expect(prisma.proyecto.update.mock.calls[0][0].data.fechaLimitePostulacion).toEqual(new Date('2026-12-15'));
  });
});

describe('MEJ-97: preguntas desde el módulo de roles', () => {
  function crearRoles() {
    const prisma: Record<string, any> = {
      proyecto: { findFirst: vi.fn().mockResolvedValue({ idProyecto: 10, creadoPor: 1, tituloProyecto: 'P' }) },
      rolProyecto: {
        findFirst: vi.fn().mockResolvedValue({ idRolProyecto: 100, idProyecto: 10, nombreRol: 'R', descripcionRolProyecto: null, idCarreraRequerida: null, cupos: 2, horasSemanalesEstimadas: null }),
        create: vi.fn().mockResolvedValue({ idRolProyecto: 100, nombreRol: 'R', requisitos: [], participaciones: [], preguntas: [], carreraRequerida: null }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ idRolProyecto: 100, nombreRol: 'R', requisitos: [], participaciones: [], preguntas: [{ idPregunta: 9 }], carreraRequerida: null }),
        update: vi.fn(),
      },
      preguntaRol: { deleteMany: vi.fn(), createMany: vi.fn() },
      participacionProyecto: { count: vi.fn().mockResolvedValue(0) },
    };
    const service = new RolesService(
      prisma as unknown as PrismaService,
      { notifyRoleMembers: vi.fn() } as unknown as NotificationsService,
      makeProjectTransactionDouble({ tx: prisma }),
      makeProjectPolicyDouble(),
      makeTimeRecordsDouble(),
    );
    return { prisma, service };
  }

  it('createRole guarda las preguntas del rol', async () => {
    const { prisma, service } = crearRoles();
    await service.createRole(10, { nombreRol: 'R', cupos: 1, preguntas: [{ enunciado: 'A', tipo: 'LARGA', obligatoria: true }] } as never, 1);
    expect(prisma.rolProyecto.create.mock.calls[0][0].data.preguntas).toEqual({
      create: [{ enunciado: 'A', tipo: 'LARGA', obligatoria: true, orden: 0 }],
    });
  });

  it('updateRole reemplaza las preguntas solo si se envían y las devuelve; las respuestas viejas conservan su copia', async () => {
    const { prisma, service } = crearRoles();
    const sin = await service.updateRole(10, 100, { nombreRol: 'R2' }, 1);
    expect(prisma.preguntaRol.deleteMany).not.toHaveBeenCalled();
    expect(sin).toBeDefined();

    const resultado = await service.updateRole(10, 100, { preguntas: [{ enunciado: 'B', tipo: 'CORTA', obligatoria: false }] }, 1);
    expect(prisma.preguntaRol.deleteMany).toHaveBeenCalledWith({ where: { idRolProyecto: 100 } });
    expect(prisma.preguntaRol.createMany).toHaveBeenCalledWith({
      data: [{ idRolProyecto: 100, enunciado: 'B', tipo: 'CORTA', obligatoria: false, orden: 0 }],
    });
    expect(resultado.preguntas).toEqual([{ idPregunta: 9 }]);
  });

  it('updateRole con una lista vacía borra las preguntas', async () => {
    const { prisma, service } = crearRoles();
    await service.updateRole(10, 100, { preguntas: [] }, 1);
    expect(prisma.preguntaRol.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.preguntaRol.createMany).toHaveBeenCalledWith({ data: [] });
  });
});

describe('MEJ-93: proyectos parecidos', () => {
  const p = (idProyecto: number, over: Record<string, unknown> = {}) => ({
    idProyecto,
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    roles: [{ cupos: 1, idCarreraRequerida: null, requisitos: [], _count: { participaciones: 0 } }],
    ...over,
  });
  const base = {
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    roles: [{ idCarreraRequerida: 4, requisitos: [{ idHabilidad: 1 }, { idHabilidad: 2 }] }],
  };

  function crear(candidatos: unknown[], baseProyecto: unknown = base) {
    const prisma: Record<string, any> = {
      proyecto: { findFirst: vi.fn().mockResolvedValue(baseProyecto), findMany: vi.fn().mockResolvedValue(candidatos) },
      proyectoGuardado: { findMany: vi.fn().mockResolvedValue([{ idProyecto: 20 }]) },
    };
    const service = new ProjectsService(
      prisma as unknown as PrismaService,
      {} as unknown as NotificationsService,
      {} as unknown as Cache,
      makeProjectTransactionDouble({ tx: prisma }),
      makeProjectPolicyDouble(),
      makeProjectReadPolicyDouble(),
      {} as unknown as SocialService,
      undefined,
      new ProjectsAffinityService(prisma as unknown as PrismaService, {} as unknown as SocialService),
    );
    return { prisma, service };
  }

  it('si el proyecto base no es visible responde 404 y no busca candidatos', async () => {
    const { prisma, service } = crear([], null);
    await expect(service.similares(5, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
    const where = prisma.proyecto.findFirst.mock.calls[0][0].where;
    expect(where.estadoProyecto.in).toContain('PUBLICADO');
    expect(where.estadoProyecto.in).not.toContain('BORRADOR');
    expect(where.eliminadoEn).toBeNull();
  });

  it('solo busca entre lo visible en Explorar (publicado o en progreso, no eliminado) y excluye al propio proyecto', async () => {
    const { prisma, service } = crear([]);
    await service.similares(5, 1);
    const and = prisma.proyecto.findMany.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ estadoProyecto: { in: ['PUBLICADO', 'EN_PROGRESO'] } });
    expect(and).toContainEqual({ eliminadoEn: null });
    expect(and).toContainEqual({ idProyecto: { not: 5 } });
  });

  it('puntúa por tipo, carrera y habilidades; descarta los de 0 puntos y limita a 6', async () => {
    const candidatos = [
      p(10, { tipoProyecto: 'EXTRACURRICULAR_EXTENSION' }), // 0 puntos
      p(11, { tipoProyecto: 'ACADEMICO_HORAS_BECA' }), // 20
      p(12, { roles: [{ cupos: 1, idCarreraRequerida: 4, requisitos: [], _count: { participaciones: 0 } }] }), // 30
      p(13, { roles: [{ cupos: 1, idCarreraRequerida: null, requisitos: [{ idHabilidad: 1, nivelMinimo: 'AVANZADO', obligatorio: true }, { idHabilidad: 9, nivelMinimo: 'BASICO', obligatorio: true }], _count: { participaciones: 0 } }] }), // 50
      p(14, { tipoProyecto: 'ACADEMICO_HORAS_BECA', roles: [{ cupos: 1, idCarreraRequerida: 4, requisitos: [{ idHabilidad: 2, nivelMinimo: 'BASICO', obligatorio: true }], _count: { participaciones: 0 } }] }), // 150
      ...[15, 16, 17, 18].map((id) => p(id, { tipoProyecto: 'ACADEMICO_HORAS_BECA' })), // 20 c/u
      p(20, { tipoProyecto: 'ACADEMICO_HORAS_BECA' }),
    ];
    const { service } = crear(candidatos);
    const resultado = await service.similares(5, 1);
    expect(resultado).toHaveLength(6);
    expect(resultado.map((x) => x.idProyecto)).toEqual([14, 13, 12, 11, 15, 16]);
    expect(resultado[0].similitud).toEqual({ mismoTipo: true, mismaCarrera: true, habilidadesPorcentaje: 100 });
    expect(resultado[1].similitud).toEqual({ mismoTipo: false, mismaCarrera: false, habilidadesPorcentaje: 50 });
    expect(resultado.find((x) => x.idProyecto === 10)).toBeUndefined();
  });

  it('marca cuáles tiene guardados quien mira', async () => {
    const { service } = crear([p(20, { tipoProyecto: 'ACADEMICO_HORAS_BECA' }), p(21, { tipoProyecto: 'ACADEMICO_HORAS_BECA' })]);
    const resultado = await service.similares(5, 1);
    expect(resultado.map((x) => [x.idProyecto, x.guardado])).toEqual([[20, true], [21, false]]);
  });
});
