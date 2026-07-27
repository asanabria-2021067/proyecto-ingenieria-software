import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabelsService } from '../src/labels/labels.service';

function makePrisma() {
  const tx = {
    tareaEtiqueta: { deleteMany: vi.fn() },
    etiqueta: { delete: vi.fn() },
  };
  return {
    proyecto: { findFirst: vi.fn() },
    participacionProyecto: { findFirst: vi.fn() },
    etiqueta: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    tareaEtiqueta: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    __tx: tx,
  } as any;
}

const LEADER_ID = 1;
const PARTICIPANT_ID = 2;
const OTHER_PARTICIPANT_ID = 3;
const EXTERNO_ID = 99;
const PROJECT_ID = 5;
const LABEL_ID = 10;

function proyectoActivo(overrides: Record<string, unknown> = {}) {
  return { idProyecto: PROJECT_ID, creadoPor: LEADER_ID, ...overrides };
}

describe('LabelsService — listado (GET, Tarea 31)', () => {
  it('el líder puede listar', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findMany.mockResolvedValue([]);
    const service = new LabelsService(prisma);

    await service.findAllForProject(PROJECT_ID, LEADER_ID);

    expect(prisma.participacionProyecto.findFirst).not.toHaveBeenCalled();
  });

  it('un participante activo puede listar', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue({ idParticipacion: 1 });
    prisma.etiqueta.findMany.mockResolvedValue([]);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, PARTICIPANT_ID)).resolves.toEqual([]);
  });

  it('un participante inactivo recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, PARTICIPANT_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un usuario externo recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, EXTERNO_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('un participante activo únicamente de otro proyecto recibe 403 (la consulta filtra por rolProyecto.idProyecto)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.participacionProyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.findAllForProject(PROJECT_ID, OTHER_PARTICIPANT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.participacionProyecto.findFirst).toHaveBeenCalledWith({
      where: {
        idUsuario: OTHER_PARTICIPANT_ID,
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { idProyecto: PROJECT_ID },
      },
      select: { idParticipacion: true },
    });
  });

  it('proyecto inexistente produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(999, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('proyecto eliminado produce 404 (findFirst con eliminadoEn: null no lo encuentra)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.proyecto.findFirst).toHaveBeenCalledWith({
      where: { idProyecto: PROJECT_ID, eliminadoEn: null },
      select: { idProyecto: true, creadoPor: true },
    });
  });

  it('un proyecto válido sin etiquetas devuelve [] (nunca 404)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findMany.mockResolvedValue([]);
    const service = new LabelsService(prisma);

    await expect(service.findAllForProject(PROJECT_ID, LEADER_ID)).resolves.toEqual([]);
  });

  it('filtra exactamente por idProyecto y usa orden determinista (nombreNormalizado, idEtiqueta)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findMany.mockResolvedValue([]);
    const service = new LabelsService(prisma);

    await service.findAllForProject(PROJECT_ID, LEADER_ID);

    expect(prisma.etiqueta.findMany).toHaveBeenCalledWith({
      where: { idProyecto: PROJECT_ID },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
      orderBy: [{ nombreNormalizado: 'asc' }, { idEtiqueta: 'asc' }],
    });
  });

  it('el contrato público no expone campos internos (idProyecto, nombreNormalizado)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findMany.mockResolvedValue([
      { idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' },
    ]);
    const service = new LabelsService(prisma);

    const resultado = await service.findAllForProject(PROJECT_ID, LEADER_ID);

    expect(resultado).toEqual([{ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' }]);
    expect(Object.keys(resultado[0]).sort()).toEqual(['color', 'idEtiqueta', 'nombreEtiqueta']);
  });
});

describe('LabelsService — creación (POST, Tarea 31)', () => {
  function dto(overrides: Record<string, unknown> = {}) {
    return { nombreEtiqueta: 'Backend', color: '#10B981', ...overrides };
  }

  it('el líder puede crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.create.mockResolvedValue({ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' });
    const service = new LabelsService(prisma);

    const resultado = await service.create(PROJECT_ID, LEADER_ID, dto() as any);

    expect(resultado).toEqual({ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' });
  });

  it('un participante activo no líder recibe 403, sin llegar a crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(service.create(PROJECT_ID, PARTICIPANT_ID, dto() as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.etiqueta.create).not.toHaveBeenCalled();
  });

  it('un externo recibe 403', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(service.create(PROJECT_ID, EXTERNO_ID, dto() as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('proyecto inexistente/eliminado produce 404, sin llegar a crear', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.create(PROJECT_ID, LEADER_ID, dto() as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.etiqueta.create).not.toHaveBeenCalled();
  });

  it('persiste con el nombre visible ya recortado por el DTO (no se vuelve a transformar)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.create.mockResolvedValue({ idEtiqueta: 1, nombreEtiqueta: 'Diseño Frontend', color: '#10B981' });
    const service = new LabelsService(prisma);

    await service.create(PROJECT_ID, LEADER_ID, dto({ nombreEtiqueta: 'Diseño Frontend' }) as any);

    expect(prisma.etiqueta.create).toHaveBeenCalledWith({
      data: {
        idProyecto: PROJECT_ID,
        nombreEtiqueta: 'Diseño Frontend',
        nombreNormalizado: 'diseño frontend',
        color: '#10B981',
      },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('calcula nombreNormalizado con NFKC + trim + lowercase (fullwidth)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.create.mockResolvedValue({ idEtiqueta: 1, nombreEtiqueta: 'ＦＲＯＮＴＥＮＤ', color: '#10B981' });
    const service = new LabelsService(prisma);

    await service.create(PROJECT_ID, LEADER_ID, dto({ nombreEtiqueta: 'ＦＲＯＮＴＥＮＤ' }) as any);

    const data = prisma.etiqueta.create.mock.calls[0][0].data;
    expect(data.nombreNormalizado).toBe('frontend');
  });

  it('conserva el color exactamente tal como llega', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.create.mockResolvedValue({ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#a1B2c3' });
    const service = new LabelsService(prisma);

    await service.create(PROJECT_ID, LEADER_ID, dto({ color: '#a1B2c3' }) as any);

    expect(prisma.etiqueta.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: '#a1B2c3' }) }),
    );
  });

  it('no expone nombreNormalizado en la respuesta', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.create.mockResolvedValue({ idEtiqueta: 1, nombreEtiqueta: 'Backend', color: '#10B981' });
    const service = new LabelsService(prisma);

    const resultado = await service.create(PROJECT_ID, LEADER_ID, dto() as any);

    expect(resultado).not.toHaveProperty('nombreNormalizado');
    expect(resultado).not.toHaveProperty('idProyecto');
  });

  it('un error Prisma no relacionado con el conflicto de nombre se propaga sin cambios', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const errorGenerico = new Error('fallo de conexión');
    prisma.etiqueta.create.mockRejectedValue(errorGenerico);
    const service = new LabelsService(prisma);

    await expect(service.create(PROJECT_ID, LEADER_ID, dto() as any)).rejects.toBe(errorGenerico);
  });
});

describe('LabelsService — edición (PATCH, Tarea 31)', () => {
  function etiquetaActual(overrides: Record<string, unknown> = {}) {
    return { idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981', ...overrides };
  }

  it('el líder puede editar el nombre (recalcula nombreNormalizado)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    prisma.etiqueta.update.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Front', color: '#10B981' });
    const service = new LabelsService(prisma);

    await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Front' } as any);

    expect(prisma.etiqueta.update).toHaveBeenCalledWith({
      where: { idEtiqueta: LABEL_ID },
      data: { nombreEtiqueta: 'Front', nombreNormalizado: 'front' },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('el líder puede editar solo el color: no toca nombreEtiqueta ni nombreNormalizado', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    prisma.etiqueta.update.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#000000' });
    const service = new LabelsService(prisma);

    await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { color: '#000000' } as any);

    expect(prisma.etiqueta.update).toHaveBeenCalledWith({
      where: { idEtiqueta: LABEL_ID },
      data: { color: '#000000' },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('el líder puede editar ambos campos a la vez', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    prisma.etiqueta.update.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Front', color: '#000000' });
    const service = new LabelsService(prisma);

    await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Front', color: '#000000' } as any);

    expect(prisma.etiqueta.update).toHaveBeenCalledWith({
      where: { idEtiqueta: LABEL_ID },
      data: { nombreEtiqueta: 'Front', nombreNormalizado: 'front', color: '#000000' },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('{} no ejecuta escritura y devuelve el valor actual con el contrato público', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    const service = new LabelsService(prisma);

    const resultado = await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, {} as any);

    expect(prisma.etiqueta.update).not.toHaveBeenCalled();
    expect(resultado).toEqual(etiquetaActual());
  });

  it('cambiar el nombre visible manteniendo el mismo normalizado (frontend -> Frontend) se permite', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual({ nombreEtiqueta: 'frontend' }));
    prisma.etiqueta.update.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Frontend', color: '#10B981' });
    const service = new LabelsService(prisma);

    const resultado = await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Frontend' } as any);

    expect(resultado.nombreEtiqueta).toBe('Frontend');
  });

  it('mismo normalizado que otra etiqueta del proyecto produce 409', async () => {
    const prisma = makePrisma();
    const { Prisma } = await import('@prisma/client');
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    prisma.etiqueta.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.2',
        meta: { modelName: 'Etiqueta', target: ['id_proyecto', 'nombre_normalizado'] },
      }),
    );
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Urgente' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('etiqueta inexistente produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, 999999, LEADER_ID, { color: '#000000' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('etiqueta de otro proyecto produce 404 (consulta única idEtiqueta+idProyecto)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { color: '#000000' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.etiqueta.findFirst).toHaveBeenCalledWith({
      where: { idEtiqueta: LABEL_ID, idProyecto: PROJECT_ID },
      select: { idEtiqueta: true, nombreEtiqueta: true, color: true },
    });
  });

  it('actor no líder recibe 403 sin llegar a consultar la etiqueta', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, PARTICIPANT_ID, { color: '#000000' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.etiqueta.findFirst).not.toHaveBeenCalled();
  });

  it('proyecto inexistente/eliminado produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { color: '#000000' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un error Prisma no relacionado se propaga sin cambios', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    const errorGenerico = new Error('fallo inesperado');
    prisma.etiqueta.update.mockRejectedValue(errorGenerico);
    const service = new LabelsService(prisma);

    await expect(
      service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { color: '#000000' } as any),
    ).rejects.toBe(errorGenerico);
  });

  it('el contrato público no expone campos internos', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(etiquetaActual());
    prisma.etiqueta.update.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Front', color: '#10B981' });
    const service = new LabelsService(prisma);

    const resultado = await service.update(PROJECT_ID, LABEL_ID, LEADER_ID, { nombreEtiqueta: 'Front' } as any);

    expect(Object.keys(resultado).sort()).toEqual(['color', 'idEtiqueta', 'nombreEtiqueta']);
  });
});

describe('LabelsService — eliminación (DELETE, Tarea 31)', () => {
  it('el líder elimina una etiqueta: borra TareaEtiqueta y Etiqueta dentro de la misma transacción', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' });
    const service = new LabelsService(prisma);

    await service.remove(PROJECT_ID, LABEL_ID, LEADER_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.tareaEtiqueta.deleteMany).toHaveBeenCalledWith({ where: { idEtiqueta: LABEL_ID } });
    expect(prisma.__tx.etiqueta.delete).toHaveBeenCalledWith({ where: { idEtiqueta: LABEL_ID } });
  });

  it('nunca llama a tarea.delete, deleteMany, update ni updateMany', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' });
    const service = new LabelsService(prisma);

    await service.remove(PROJECT_ID, LABEL_ID, LEADER_ID);

    expect((prisma as any).tarea).toBeUndefined();
    expect((prisma.__tx as any).tarea).toBeUndefined();
  });

  it('etiqueta de otro proyecto produce 404, sin transacción', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.remove(PROJECT_ID, LABEL_ID, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('etiqueta inexistente produce 404', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue(null);
    const service = new LabelsService(prisma);

    await expect(service.remove(PROJECT_ID, 999999, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('segunda eliminación produce 404 (no es idempotente)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst
      .mockResolvedValueOnce({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' })
      .mockResolvedValueOnce(null);
    const service = new LabelsService(prisma);

    await service.remove(PROJECT_ID, LABEL_ID, LEADER_ID);
    await expect(service.remove(PROJECT_ID, LABEL_ID, LEADER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('un participante activo no líder recibe 403, sin transacción', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    const service = new LabelsService(prisma);

    await expect(service.remove(PROJECT_ID, LABEL_ID, PARTICIPANT_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.etiqueta.findFirst).not.toHaveBeenCalled();
  });

  it('si falla la eliminación de Etiqueta después de borrar TareaEtiqueta, el error se propaga (rollback real vía $transaction de Prisma)', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(proyectoActivo());
    prisma.etiqueta.findFirst.mockResolvedValue({ idEtiqueta: LABEL_ID, nombreEtiqueta: 'Backend', color: '#10B981' });
    const errorFallo = new Error('fallo al eliminar etiqueta');
    prisma.$transaction = vi.fn(async (fn: any) => {
      const tx = { tareaEtiqueta: { deleteMany: vi.fn() }, etiqueta: { delete: vi.fn().mockRejectedValue(errorFallo) } };
      return fn(tx);
    });
    const service = new LabelsService(prisma);

    await expect(service.remove(PROJECT_ID, LABEL_ID, LEADER_ID)).rejects.toBe(errorFallo);
  });

  it('ninguna notificación: LabelsService no depende de NotificationsService', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../src/labels/labels.service.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/Notifications/);
  });
});
