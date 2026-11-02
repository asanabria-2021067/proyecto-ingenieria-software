import { describe, expect, it } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateTaskDto } from '../src/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../src/tasks/dto/update-task.dto';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from '../src/tasks/dto/checklist-item.dto';
import { CreatePlantillaTareaDto } from '../src/tasks/dto/plantilla-tarea.dto';
import { CreateEvidenceDto } from '../src/evidence/dto/create-evidence.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const parse = <T>(metatype: new () => T, plain: unknown): Promise<T> =>
  pipe.transform(plain, { type: 'body', metatype } as ArgumentMetadata);

const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const base = { tituloTarea: 'x', fechaLimite: manana, prioridad: 'MEDIA', idHito: 1 };

describe('CreateTaskDto: bloqueo, repeticion y checklist', () => {
  it('acepta los campos nuevos y los recorta', async () => {
    const dto = await parse(CreateTaskDto, {
      ...base,
      idTareaBloqueante: 4,
      repeticion: 'SEMANAL',
      checklist: ['  a  ', 'b'],
    });
    expect(dto.idTareaBloqueante).toBe(4);
    expect(dto.repeticion).toBe('SEMANAL');
    expect(dto.checklist).toEqual(['a', 'b']);
  });

  it.each([
    { repeticion: 'ANUAL' },
    { idTareaBloqueante: 0 },
    { idTareaBloqueante: null },
    { checklist: [''] },
    { checklist: ['x'.repeat(201)] },
    { checklist: Array.from({ length: 51 }, () => 'a') },
  ])('rechaza %j', async (extra) => {
    await expect(parse(CreateTaskDto, { ...base, ...extra })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UpdateTaskDto: bloqueo y repeticion admiten null para quitarlos', () => {
  it('acepta null y valores validos', async () => {
    const dto = await parse(UpdateTaskDto, { idTareaBloqueante: null, repeticion: null });
    expect(dto.idTareaBloqueante).toBeNull();
    expect(dto.repeticion).toBeNull();
    expect((await parse(UpdateTaskDto, { repeticion: 'MENSUAL', idTareaBloqueante: 3 })).repeticion).toBe('MENSUAL');
  });

  it('rechaza una repeticion desconocida', async () => {
    await expect(parse(UpdateTaskDto, { repeticion: 'HORARIA' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DTO de checklist, plantillas y evidencias', () => {
  it('checklist exige texto no vacio y completado booleano', async () => {
    await expect(parse(CreateChecklistItemDto, { texto: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(UpdateChecklistItemDto, { completado: 'si' })).rejects.toBeInstanceOf(BadRequestException);
    expect((await parse(UpdateChecklistItemDto, { completado: true })).completado).toBe(true);
  });

  it('plantilla exige nombre, titulo y prioridad validos', async () => {
    const ok = { nombre: 'Bug', tituloTarea: 'Corregir', prioridad: 'ALTA', checklist: ['a'] };
    expect((await parse(CreatePlantillaTareaDto, ok)).nombre).toBe('Bug');
    await expect(parse(CreatePlantillaTareaDto, { ...ok, prioridad: 'URGENTE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(CreatePlantillaTareaDto, { ...ok, nombre: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('evidencia solo admite ENLACE o ARCHIVO y limita el tamano', async () => {
    const ok = { tipoEvidencia: 'ENLACE', urlRecurso: 'https://example.com' };
    expect((await parse(CreateEvidenceDto, ok)).tipoEvidencia).toBe('ENLACE');
    await expect(parse(CreateEvidenceDto, { ...ok, tipoEvidencia: 'REPORTE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(CreateEvidenceDto, { ...ok, tamanoBytes: 30_000_000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(CreateEvidenceDto, { tipoEvidencia: 'ENLACE' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
