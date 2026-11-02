import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EvidenceService } from '../src/evidence/evidence.service';
import { fakeProjectTx } from './helpers/fake-project-tx';

describe('MEJ-49: evidencias (EvidenceService)', () => {
  function crear(opts: { revisiones?: number; cargador?: number; lider?: number; autoriza?: boolean } = {}) {
    const { revisiones = 0, cargador = 9, lider = 1, autoriza = true } = opts;
    const tx = {
      evidencia: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ idEvidencia: 1, ...data, tamanoBytes: null })),
        findFirst: vi.fn(async () => ({ idUsuarioCargador: cargador, _count: { revisiones } })),
        delete: vi.fn(async () => ({})),
      },
    };
    const auth = {
      assertCanChangeTaskState: vi.fn(async () => {
        if (!autoriza) throw new ForbiddenException('no');
        return { idSprint: 3 };
      }),
      assertCanReadTask: vi.fn(),
    };
    const context = {
      getTaskInProjectOrThrow: vi.fn(async () => ({ idSprint: 3 })),
      getProjectOrThrow: vi.fn(async () => ({ creadoPor: lider })),
    };
    const policy = { assertWriteTx: vi.fn(async () => undefined) };
    const service = new EvidenceService({} as never, fakeProjectTx(tx) as never, policy as never, auth as never, context as never, {} as never);
    return { service, tx };
  }

  it('sube un enlace https y rechaza http, basura y archivos fuera de Cloudinary', async () => {
    const { service, tx } = crear();
    await service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com/doc' });
    expect(tx.evidencia.create).toHaveBeenCalledTimes(1);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'http://example.com' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'no es url' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ARCHIVO', urlRecurso: 'https://example.com/a.pdf' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.evidencia.create).toHaveBeenCalledTimes(1);
  });

  it('solo el lider o el asignado suben evidencia', async () => {
    const { service, tx } = crear({ autoriza: false });
    await expect(service.create(1, 5, 9, { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.evidencia.create).not.toHaveBeenCalled();
  });

  it('borra quien la subio o el lider, nadie mas, y nunca una ya revisada', async () => {
    const propia = crear({ cargador: 9, lider: 1 });
    await propia.service.remove(1, 5, 1, 9);
    expect(propia.tx.evidencia.delete).toHaveBeenCalled();

    const lider = crear({ cargador: 9, lider: 1 });
    await lider.service.remove(1, 5, 1, 1);
    expect(lider.tx.evidencia.delete).toHaveBeenCalled();

    const ajena = crear({ cargador: 9, lider: 1 });
    await expect(ajena.service.remove(1, 5, 1, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(ajena.tx.evidencia.delete).not.toHaveBeenCalled();

    const revisada = crear({ revisiones: 1 });
    await expect(revisada.service.remove(1, 5, 1, 9)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MEJ-49: lectura de evidencias', () => {
  it('aplica la politica de lectura con el sprint de la tarea antes de listar', async () => {
    const prisma = { evidencia: { findMany: vi.fn(async () => []) } };
    const auth = { assertCanReadTask: vi.fn(async () => ({ idSprint: 3 })) };
    const readPolicy = { assertRead: vi.fn(async () => ({})) };
    const service = new EvidenceService(prisma as never, {} as never, {} as never, auth as never, {} as never, readPolicy as never);
    await service.list(1, 5, 9);
    expect(readPolicy.assertRead).toHaveBeenCalledWith(undefined, { projectId: 1, actorId: 9, scope: 'tareas', entitySprintId: 3 });

    readPolicy.assertRead.mockRejectedValue(new ForbiddenException('no'));
    prisma.evidencia.findMany.mockClear();
    await expect(service.list(1, 5, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.evidencia.findMany).not.toHaveBeenCalled();
  });
});
