import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../src/projects/projects.service';
import { CreateHitoDto } from '../src/projects/dto/create-hito.dto';

type HitoTxOverrides = Partial<{
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}>;

function makeTx(overrides: HitoTxOverrides = {}) {
  return {
    hito: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      ...overrides,
    },
  };
}

function makePrisma(tx = makeTx()) {
  return {
    tx,
    proyecto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new ProjectsService(
    prisma as unknown as ConstructorParameters<typeof ProjectsService>[0],
    {} as ConstructorParameters<typeof ProjectsService>[1],
    {} as ConstructorParameters<typeof ProjectsService>[2],
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

  it('un no-líder recibe ForbiddenException y no se crea el hito', async () => {
    const tx = makeTx();
    const prisma = makePrisma(tx);
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: 5, creadoPor: 99 });
    const service = makeService(prisma);

    await expect(service.createHito(5, 1, BASE_DTO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.hito.create).not.toHaveBeenCalled();
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
});
