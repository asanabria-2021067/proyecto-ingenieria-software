import 'reflect-metadata';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { SprintObjetivoService } from '../src/sprints/sprint-objetivo.service';
import { OBJETIVO_SPRINT_MAX, UpdateSprintObjetivoDto } from '../src/sprints/dto/sprint-objetivo.dto';

function armar(estado = 'ACTIVO', permitido = true) {
  const prisma = { sprint: { update: vi.fn().mockResolvedValue({ idSprint: 5, objetivo: 'Meta' }) } };
  const authorization = {
    assertCanFinalizeSprint: vi.fn(async () => {
      if (!permitido) throw new ForbiddenException('No eres el líder de este proyecto');
      return { estado };
    }),
  };
  const service = new SprintObjetivoService(prisma as never, authorization as never);
  return { service, prisma, authorization };
}

describe('SprintObjetivoService', () => {
  it('el líder guarda el objetivo de un Sprint abierto', async () => {
    const { service, prisma } = armar();
    await service.update(1, 5, 9, 'Meta');
    expect(prisma.sprint.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idSprint: 5 }, data: { objetivo: 'Meta' } }),
    );
  });

  it('null borra el objetivo', async () => {
    const { service, prisma } = armar('EN_FINALIZACION');
    await service.update(1, 5, 9, null);
    expect(prisma.sprint.update).toHaveBeenCalledWith(expect.objectContaining({ data: { objetivo: null } }));
  });

  it('quien no es líder no escribe nada', async () => {
    const { service, prisma } = armar('ACTIVO', false);
    await expect(service.update(1, 5, 2, 'Meta')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sprint.update).not.toHaveBeenCalled();
  });

  it('un Sprint cerrado no se edita', async () => {
    const { service, prisma } = armar('CERRADO');
    await expect(service.update(1, 5, 9, 'Meta')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.sprint.update).not.toHaveBeenCalled();
  });
});

describe('UpdateSprintObjetivoDto', () => {
  const validar = (objetivo: unknown) => {
    const dto = plainToInstance(UpdateSprintObjetivoDto, { objetivo });
    return { dto, errores: validateSync(dto) };
  };

  it('limpia espacios y caracteres de control', () => {
    const { dto, errores } = validar('  Cerrar\u0000 el   módulo \n de pagos ');
    expect(errores).toHaveLength(0);
    expect(dto.objetivo).toBe('Cerrar el módulo de pagos');
  });

  it('un texto vacío equivale a sin objetivo', () => {
    expect(validar('   ').dto.objetivo).toBeNull();
  });

  it('rechaza más del límite de caracteres', () => {
    expect(validar('a'.repeat(OBJETIVO_SPRINT_MAX + 1)).errores).not.toHaveLength(0);
    expect(validar('a'.repeat(OBJETIVO_SPRINT_MAX)).errores).toHaveLength(0);
  });
});
