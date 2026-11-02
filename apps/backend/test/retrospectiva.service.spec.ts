import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RetrospectivaService } from '../src/seguimiento/retrospectiva.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { GuardarRetrospectivaDto } from '../src/seguimiento/dto/seguimiento.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SprintsContextService } from '../src/sprints/sprints-context.service';
import type { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';

const LIDER = 1;
const AUTOR = 2;

function buildRetro(estadoSprint = 'EN_FINALIZACION', estadoProyecto = 'EN_PROGRESO') {
  const tx = {
    retrospectivaSprint: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: { create: object }) => Promise.resolve(create)),
    },
  };
  const prisma = {
    retrospectivaSprint: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const sprintsContext = {
    assertActiveProjectParticipant: vi.fn().mockResolvedValue(undefined),
    assertProjectLeader: vi.fn().mockResolvedValue(undefined),
    getProjectOrThrow: vi.fn().mockResolvedValue({ estadoProyecto }),
    getSprintInProjectOrThrow: vi.fn().mockResolvedValue({ idSprint: 8, numero: 2, estado: estadoSprint }),
  };
  const bitacora = { registrarEvento: vi.fn().mockResolvedValue(undefined) };
  const service = new RetrospectivaService(
    prisma as unknown as PrismaService,
    sprintsContext as unknown as SprintsContextService,
    bitacora as unknown as BitacoraEventosService,
  );
  return { prisma, tx, sprintsContext, bitacora, service };
}

const RETRO = { quePaso: 'Se entregó la demo', quePodriaMejorar: 'Estimar mejor', acuerdos: 'Revisión diaria' };

describe('RetrospectivaService (MEJ-24)', () => {
  it('guarda la retrospectiva y deja el evento en la bitácora con el mismo tx', async () => {
    const { tx, bitacora, service } = buildRetro();
    await service.guardar(5, 8, LIDER, RETRO);
    expect(tx.retrospectivaSprint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { idSprint: 8, idProyecto: 5, creadaPor: LIDER, ...RETRO } }),
    );
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        tipoEvento: TipoEventoBitacora.SPRINT_RETROSPECTIVE_SAVED,
        idActor: LIDER,
        idProyecto: 5,
        idSprint: 8,
        tipoEntidad: 'SPRINT',
        idEntidad: 8,
        valorAnterior: null,
      }),
    );
  });

  it('al editar una existente lo marca como edición', async () => {
    const { tx, bitacora, service } = buildRetro('CERRADO');
    tx.retrospectivaSprint.findUnique.mockResolvedValue({ ...RETRO });
    await service.guardar(5, 8, LIDER, RETRO);
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ valorAnterior: { editada: true } }));
  });

  it('solo el líder escribe', async () => {
    const { tx, sprintsContext, service } = buildRetro();
    sprintsContext.assertProjectLeader.mockRejectedValue(new ForbiddenException('No eres el líder'));
    await expect(service.guardar(5, 8, AUTOR, RETRO)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.retrospectivaSprint.upsert).not.toHaveBeenCalled();
  });

  it('no se escribe mientras el sprint sigue activo ni con el proyecto cerrado', async () => {
    await expect(buildRetro('ACTIVO').service.guardar(5, 8, LIDER, RETRO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(buildRetro('CERRADO', 'CERRADO').service.guardar(5, 8, LIDER, RETRO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cualquier integrante activo la lee y es null mientras no exista', async () => {
    const { prisma, sprintsContext, service } = buildRetro();
    await expect(service.obtener(5, 8, AUTOR)).resolves.toBeNull();
    prisma.retrospectivaSprint.findUnique.mockResolvedValue(RETRO);
    await expect(service.obtener(5, 8, AUTOR)).resolves.toEqual(RETRO);
    sprintsContext.assertActiveProjectParticipant.mockRejectedValue(new ForbiddenException('No participas'));
    await expect(service.obtener(5, 8, 55)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el DTO exige los tres campos de 3 a 1000 caracteres', async () => {
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, RETRO))).toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { ...RETRO, acuerdos: '' }))).not.toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { ...RETRO, quePaso: 'a'.repeat(1001) }))).not.toEqual([]);
    expect(await validate(plainToInstance(GuardarRetrospectivaDto, { quePaso: 'abc' }))).not.toEqual([]);
  });
});
