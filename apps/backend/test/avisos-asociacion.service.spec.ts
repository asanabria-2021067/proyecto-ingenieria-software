import { BadRequestException, ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AVISO_ACCION,
  AVISO_MAX_DESTINATARIOS,
  AVISO_MAX_POR_DIA,
  AvisosAsociacionService,
} from '../src/associations/avisos-asociacion.service';

type Junta = { cargo: string; nivelPermiso: string; archivada?: boolean } | null;

const filas = (...ids: number[]) => ids.map((idUsuario) => ({ idUsuario }));

function build(junta: Junta, estudiantes = filas(1, 2, 3), avisosHoy = 0) {
  const prisma: Record<string, any> = {
    juntaAsociacion: {
      findUnique: vi.fn().mockResolvedValue(junta && { ...junta, asociacion: { idAsociacion: 7, nombre: 'AEC', archivada: junta.archivada ?? false } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ nombre: 'AEC' }]),
    bitacoraAuditoria: { count: vi.fn().mockResolvedValue(avisosHoy), create: vi.fn().mockResolvedValue({}) },
    anuncio: { create: vi.fn().mockResolvedValue({ idAnuncio: 55 }) },
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
  const horas = { recorrerTodas: vi.fn().mockResolvedValue({ semestre: {}, filas: estudiantes }) };
  const notifications = { persistTemplateTx: vi.fn().mockResolvedValue({ count: estudiantes.length }), publishEffects: vi.fn().mockResolvedValue(undefined) };
  return { prisma, horas, notifications, service: new AvisosAsociacionService(prisma as never, horas as never, notifications as never) };
}

const DTO = { mensaje: 'Recuerden registrar sus horas', filtros: { enRiesgo: true, tipo: 'BECA' as const }, cantidadEsperada: 3 };
const PRESIDENTE = { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' };

describe('AvisosAsociacionService (MEJ-161)', () => {
  it.each([
    ['Presidente', PRESIDENTE],
    ['Vicepresidente con nivel Editor', { cargo: 'VICEPRESIDENTE', nivelPermiso: 'EDITOR' }],
    ['Tesorero con nivel Editor', { cargo: 'TESORERO', nivelPermiso: 'EDITOR' }],
  ])('%s envía el aviso: anuncio dirigido, notificación y bitácora', async (_n, junta) => {
    const { prisma, notifications, service } = build(junta);
    await expect(service.enviar(9, 7, DTO)).resolves.toEqual({ idAnuncio: 55, destinatarios: 3 });

    const anuncio = prisma.anuncio.create.mock.calls[0][0].data;
    expect(anuncio).toMatchObject({ idAsociacion: 7, creadoPor: 9, nivel: 'INFO', mensaje: DTO.mensaje });
    expect(anuncio.destinatarios.createMany.data).toEqual([{ idUsuario: 1 }, { idUsuario: 2 }, { idUsuario: 3 }]);
    expect(notifications.persistTemplateTx).toHaveBeenCalledWith(
      prisma,
      [1, 2, 3],
      'AVISO_ASOCIACION',
      { idAsociacion: 7, nombreAsociacion: 'AEC', mensaje: DTO.mensaje },
      expect.anything(),
    );
    expect(notifications.publishEffects).toHaveBeenCalled();
    const bitacora = prisma.bitacoraAuditoria.create.mock.calls[0][0].data;
    expect(bitacora).toMatchObject({ idUsuario: 9, accion: AVISO_ACCION, tipoObjeto: 'ASOCIACION', idObjeto: '7' });
    expect(bitacora.detalleJson).toMatchObject({ idAnuncio: 55, destinatarios: 3, filtros: { enRiesgo: true, tipo: 'BECA' } });
  });

  it.each([
    ['Vocal (solo lectura)', { cargo: 'VOCAL', nivelPermiso: 'LECTURA' }],
    ['Secretario con nivel Lectura', { cargo: 'SECRETARIO', nivelPermiso: 'LECTURA' }],
    ['quien no es de la junta', null],
    ['Presidente de una asociación archivada', { ...PRESIDENTE, archivada: true }],
  ])('%s recibe 403 y no se resuelve ni se envía nada', async (_n, junta) => {
    const { prisma, horas, notifications, service } = build(junta);
    await expect(service.enviar(9, 7, DTO)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.contar(9, 7, DTO.filtros)).rejects.toBeInstanceOf(ForbiddenException);
    expect(horas.recorrerTodas).not.toHaveBeenCalled();
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
    expect(notifications.persistTemplateTx).not.toHaveBeenCalled();
  });

  it('la junta se consulta por el usuario del token y la asociación de la ruta', async () => {
    const { prisma, service } = build(PRESIDENTE);
    await service.enviar(9, 7, DTO);
    expect(prisma.juntaAsociacion.findUnique.mock.calls[0][0].where).toEqual({ idAsociacion_idUsuario: { idAsociacion: 7, idUsuario: 9 } });
  });

  it('los destinatarios salen del servidor: la asociación de la ruta manda sobre cualquier dato del cliente', async () => {
    const { horas, service } = build(PRESIDENTE);
    const filtros = { enRiesgo: true, tipo: 'BECA', idAsociacion: 99, carreraIds: [1, 2], idUsuarios: [500, 501] } as never;
    await service.enviar(9, 7, { ...DTO, filtros });
    expect(horas.recorrerTodas).toHaveBeenCalledWith({
      anio: undefined,
      periodo: undefined,
      tipo: 'BECA',
      enRiesgo: true,
      busqueda: undefined,
      idAsociacion: 7,
    });
  });

  it('contar devuelve la cantidad que verá la confirmación y el máximo', async () => {
    const { service } = build(PRESIDENTE, filas(4, 5));
    await expect(service.contar(9, 7, DTO.filtros)).resolves.toEqual({ cantidad: 2, maximo: AVISO_MAX_DESTINATARIOS });
  });

  it('sin estudiantes que coincidan responde 400 y no envía', async () => {
    const { prisma, service } = build(PRESIDENTE, []);
    await expect(service.enviar(9, 7, { ...DTO, cantidadEsperada: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
  });

  it('más de 500 destinatarios responde 400', async () => {
    const muchos = filas(...Array.from({ length: AVISO_MAX_DESTINATARIOS + 1 }, (_, i) => i + 1));
    const { prisma, service } = build(PRESIDENTE, muchos);
    await expect(service.enviar(9, 7, { ...DTO, cantidadEsperada: muchos.length })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
  });

  it('si la lista cambió desde la confirmación responde 409 y no envía', async () => {
    const { prisma, service } = build(PRESIDENTE, filas(1, 2));
    await expect(service.enviar(9, 7, { ...DTO, cantidadEsperada: 3 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
  });

  it('frecuencia limitada: tras el máximo diario responde 429 sin crear nada', async () => {
    const { prisma, notifications, service } = build(PRESIDENTE, filas(1, 2, 3), AVISO_MAX_POR_DIA);
    const error = await service.enviar(9, 7, DTO).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.anuncio.create).not.toHaveBeenCalled();
    expect(notifications.persistTemplateTx).not.toHaveBeenCalled();
    expect(prisma.bitacoraAuditoria.count.mock.calls[0][0].where).toMatchObject({ accion: AVISO_ACCION, idObjeto: '7' });
  });

  it('el límite se cuenta con la asociación bloqueada dentro de la transacción', async () => {
    const { prisma, service } = build(PRESIDENTE);
    await service.enviar(9, 7, DTO);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(String(prisma.$queryRaw.mock.calls[0][0].join(''))).toContain('FOR UPDATE');
  });
});
