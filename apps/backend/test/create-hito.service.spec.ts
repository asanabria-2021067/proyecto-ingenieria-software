import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../src/projects/projects.service';
import { CreateHitoDto } from '../src/projects/dto/create-hito.dto';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

type HitoTxOverrides = Partial<{
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}>;

type TareaTxOverrides = Partial<{
  findMany: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}>;

function makeTx(overrides: HitoTxOverrides = {}, tareaOverrides: TareaTxOverrides = {}) {
  return {
    hito: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      ...overrides,
    },
    // T-186: solo se usan cuando el test envía idsTareas; el resto de los
    // tests de este archivo (creación simple) nunca los toca.
    tarea: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      ...tareaOverrides,
    },
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  // C031: el runner entrega como `tx` el doble de hitos junto con las consultas de autorización.
  const tx = { ...prisma.tx, proyecto: prisma.proyecto, participacionProyecto: prisma.participacionProyecto };
  return new ProjectsService(
    prisma as unknown as ConstructorParameters<typeof ProjectsService>[0],
    {} as ConstructorParameters<typeof ProjectsService>[1],
    {} as ConstructorParameters<typeof ProjectsService>[2],
    makeProjectTransactionDouble({ tx }),
    makeProjectPolicyDouble(),
    makeProjectReadPolicyDouble(),
  );
}

const BASE_DTO = { tituloHito: 'Entrega de MVP' } satisfies CreateHitoDto;

function hitoRow(overrides: Record<string, unknown> = {}) {
  return {
    idHito: 10,
    tituloHito: 'Entrega de MVP',
    descripcionHito: null,
    fechaLimite: null,
    estadoHito: 'PENDIENTE',
    orden: 1,
    ...overrides,
  };
}

describe('ProjectsService.createHito', () => {
  it('el líder del proyecto puede crear un hito', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    const result = await service.createHito(5, 1, BASE_DTO);

    expect(prisma.proyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idProyecto: 5, eliminadoEn: null } }),
    );
    expect(tx.hito.create).toHaveBeenCalledTimes(1);
    expect(result.idHito).toBe(10);
  });

  it('un usuario sin participación activa recibe ForbiddenException y no se crea el hito', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 99 });
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.createHito(5, 1, BASE_DTO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.hito.create).not.toHaveBeenCalled();
  });

  it('un participante activo (no líder) también puede crear un hito', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 99 });
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    const result = await service.createHito(5, 1, BASE_DTO);

    expect(tx.hito.create).toHaveBeenCalledTimes(1);
    expect(result.idHito).toBe(10);
  });

  it('un proyecto inexistente lanza NotFoundException', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.createHito(999, 1, BASE_DTO)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('orden se calcula como (máximo orden existente) + 1, no viene del cliente', async () => {
    const tx = makeTx({ findFirst: vi.fn().mockResolvedValue({ orden: 4 }) });
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow({ orden: 5 }));
    const service = makeService(prisma);

    await service.createHito(5, 1, { ...BASE_DTO, orden: 999 } as CreateHitoDto & { orden: number });

    expect(tx.hito.create.mock.calls[0][0].data.orden).toBe(5);
  });

  it('sin hitos previos, orden empieza en 1', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow({ orden: 1 }));
    const service = makeService(prisma);

    await service.createHito(5, 1, BASE_DTO);

    expect(tx.hito.create.mock.calls[0][0].data.orden).toBe(1);
  });

  it('estadoHito siempre se crea como PENDIENTE, no es configurable por el cliente', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    await service.createHito(
      5,
      1,
      { ...BASE_DTO, estadoHito: 'COMPLETADO' } as CreateHitoDto & { estadoHito: string },
    );

    expect(tx.hito.create.mock.calls[0][0].data.estadoHito).toBe('PENDIENTE');
  });

  it('descripcionHito omitida se convierte en null', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    await service.createHito(5, 1, BASE_DTO);

    expect(tx.hito.create.mock.calls[0][0].data.descripcionHito).toBeNull();
  });

  it('fechaLimite se ancla a medianoche UTC del día calendario enviado', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(
      hitoRow({ fechaLimite: new Date('2026-12-25T00:00:00.000Z') }),
    );
    const service = makeService(prisma);

    const result = await service.createHito(5, 1, { ...BASE_DTO, fechaLimite: '2026-12-25' });

    const fechaEnviada: Date = tx.hito.create.mock.calls[0][0].data.fechaLimite;
    expect(fechaEnviada.toISOString()).toBe('2026-12-25T00:00:00.000Z');
    expect(result.fechaLimite).toBe('2026-12-25');
  });

  it('fechaLimite omitida se envía como null y la respuesta la expone como null', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow({ fechaLimite: null }));
    const service = makeService(prisma);

    const result = await service.createHito(5, 1, BASE_DTO);

    expect(tx.hito.create.mock.calls[0][0].data.fechaLimite).toBeNull();
    expect(result.fechaLimite).toBeNull();
  });

  it('la respuesta tiene la misma forma que HitoDTO del frontend', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    const result = await service.createHito(5, 1, BASE_DTO);

    expect(Object.keys(result).sort()).toEqual(
      ['idHito', 'tituloHito', 'descripcionHito', 'fechaLimite', 'estadoHito', 'orden'].sort(),
    );
  });

  it('busca el máximo orden filtrando por el proyecto correcto', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
    tx.hito.create.mockResolvedValue(hitoRow());
    const service = makeService(prisma);

    await service.createHito(5, 1, BASE_DTO);

    expect(tx.hito.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProyecto: 5 },
        orderBy: { orden: 'desc' },
      }),
    );
  });

  describe('T-186 — asignación masiva de tareas (idsTareas)', () => {
    function setupBulk(overrides: {
      tareasEncontradas?: { idTarea: number }[];
      tareasParaEstado?: { estadoTarea: string }[];
    } = {}) {
      const tx = makeTx(
        {},
        {
          findMany: vi.fn().mockResolvedValue(overrides.tareasEncontradas ?? [{ idTarea: 1 }, { idTarea: 2 }]),
        },
      );
      const prisma = makePrisma(tx);
      prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 1 });
      tx.hito.create.mockResolvedValue(hitoRow());
      const service = makeService(prisma);
      return { tx, prisma, service };
    }

    it('idsTareas omitida: no consulta ni actualiza tareas, respuesta sin idsTareasAsignadas', async () => {
      const { tx, service } = setupBulk();

      const result = await service.createHito(5, 1, BASE_DTO);

      expect(tx.tarea.findMany).not.toHaveBeenCalled();
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('idsTareasAsignadas');
    });

    it('idsTareas: [] no consulta ni actualiza tareas, respuesta con idsTareasAsignadas: []', async () => {
      const { tx, service } = setupBulk();

      const result = await service.createHito(5, 1, { ...BASE_DTO, idsTareas: [] });

      expect(tx.tarea.findMany).not.toHaveBeenCalled();
      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ idsTareasAsignadas: [] });
    });

    it('asigna idHito a todas las tareas válidas del proyecto en una sola updateMany', async () => {
      const { tx, service } = setupBulk({ tareasEncontradas: [{ idTarea: 1 }, { idTarea: 2 }] });

      const result = await service.createHito(5, 1, { ...BASE_DTO, idsTareas: [1, 2] });

      expect(tx.tarea.findMany).toHaveBeenCalledWith({
        where: { idTarea: { in: [1, 2] }, idProyecto: 5, eliminadoEn: null },
        select: { idTarea: true },
      });
      expect(tx.tarea.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.tarea.updateMany).toHaveBeenCalledWith({
        where: { idTarea: { in: [1, 2] }, idProyecto: 5 },
        data: { idHito: 10 },
      });
      expect(result).toMatchObject({ idsTareasAsignadas: [1, 2] });
    });

    it('tarea inexistente o de otro proyecto: NotFoundException, no actualiza ninguna tarea ni el hito', async () => {
      const { tx, service } = setupBulk({ tareasEncontradas: [{ idTarea: 1 }] });

      await expect(
        service.createHito(5, 1, { ...BASE_DTO, idsTareas: [1, 999] }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(tx.tarea.updateMany).not.toHaveBeenCalled();
      expect(tx.hito.update).not.toHaveBeenCalled();
    });

    it('todas las tareas inexistentes: NotFoundException nombra los ids inválidos', async () => {
      const { service } = setupBulk({ tareasEncontradas: [] });

      await expect(
        service.createHito(5, 1, { ...BASE_DTO, idsTareas: [777, 888] }),
      ).rejects.toThrow('777, 888');
    });

    it('sincroniza estadoHito del hito recién creado según las tareas ya asignadas (A12)', async () => {
      const { tx, service } = setupBulk({ tareasEncontradas: [{ idTarea: 1 }, { idTarea: 2 }] });
      tx.tarea.findMany.mockImplementation(
        async (args: { where: { idHito?: number; idTarea?: unknown } }) =>
          args.where.idHito === 10
            ? [{ estadoTarea: 'HECHO' }, { estadoTarea: 'POR_HACER' }]
            : [{ idTarea: 1 }, { idTarea: 2 }],
      );

      await service.createHito(5, 1, { ...BASE_DTO, idsTareas: [1, 2] });

      expect(tx.hito.update).toHaveBeenCalledWith({
        where: { idHito: 10 },
        data: { estadoHito: 'EN_PROGRESO' },
      });
    });

    it('no permite asignar tareas de OTRO proyecto (aislamiento entre proyectos)', async () => {
      // La consulta de validación ya filtra por idProyecto: una tarea de
      // otro proyecto simplemente no aparece entre las "válidas", así que
      // cae en la misma rama de NotFoundException que un id inexistente.
      const { tx, service } = setupBulk({ tareasEncontradas: [] });

      await expect(
        service.createHito(5, 1, { ...BASE_DTO, idsTareas: [42] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.tarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ idProyecto: 5 }) }),
      );
    });
  });
});
