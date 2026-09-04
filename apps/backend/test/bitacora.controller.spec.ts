import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { BitacoraConsultaService } from '../src/bitacora/bitacora-consulta.service';
import { BitacoraController } from '../src/bitacora/bitacora.controller';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

function makeConsulta() {
  return { listEventos: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }) } as unknown as BitacoraConsultaService & {
    listEventos: ReturnType<typeof vi.fn>;
  };
}

describe('BitacoraController (GET /proyectos/:projectId/bitacora)', () => {
  it('está protegido por JwtAuthGuard, exclusivo del líder vía BitacoraConsultaService.listEventos', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BitacoraController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('está registrado como GET en la ruta raíz del controller anidado', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BitacoraController.prototype.findAll)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, BitacoraController.prototype.findAll)).toBe(0); // GET
  });

  it('delega en BitacoraConsultaService.listEventos con projectId, userId y defaults de paginación', async () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    await controller.findAll(5, { userId: 9 });

    expect(consulta.listEventos).toHaveBeenCalledWith(5, 9, {
      idSprint: undefined,
      idActor: undefined,
      tipoEvento: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('parsea y acota page/limit (limit tope 50, page mínimo 1)', async () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    await controller.findAll(5, { userId: 9 }, undefined, undefined, undefined, '0', '999');

    expect(consulta.listEventos).toHaveBeenCalledWith(
      5,
      9,
      expect.objectContaining({ page: 1, limit: 50 }),
    );
  });

  it('parsea idSprint/idActor a número cuando se envían', async () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    await controller.findAll(5, { userId: 9 }, '3', '7');

    expect(consulta.listEventos).toHaveBeenCalledWith(
      5,
      9,
      expect.objectContaining({ idSprint: 3, idActor: 7 }),
    );
  });

  it('rechaza idSprint/idActor no enteros positivos con BadRequestException', async () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    expect(() => controller.findAll(5, { userId: 9 }, '-1')).toThrow(BadRequestException);
    expect(() => controller.findAll(5, { userId: 9 }, 'abc')).toThrow(BadRequestException);
  });

  it('acepta un tipoEvento válido del enum', async () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    await controller.findAll(5, { userId: 9 }, undefined, undefined, TipoEventoBitacora.SPRINT_STARTED);

    expect(consulta.listEventos).toHaveBeenCalledWith(
      5,
      9,
      expect.objectContaining({ tipoEvento: TipoEventoBitacora.SPRINT_STARTED }),
    );
  });

  it('rechaza un tipoEvento fuera del catálogo con BadRequestException', () => {
    const consulta = makeConsulta();
    const controller = new BitacoraController(consulta);

    expect(() => controller.findAll(5, { userId: 9 }, undefined, undefined, 'NO_EXISTE')).toThrow(
      BadRequestException,
    );
  });

  it('retorna exactamente lo que resuelve BitacoraConsultaService.listEventos, sin transformarlo', async () => {
    const consulta = makeConsulta();
    const paginado = { data: [{ idAuditoria: 1 }], total: 1, page: 1, totalPages: 1 };
    consulta.listEventos.mockResolvedValue(paginado);
    const controller = new BitacoraController(consulta);

    const result = await controller.findAll(5, { userId: 9 });

    expect(result).toBe(paginado);
  });

  it('propaga los errores de autorización/negocio que lance BitacoraConsultaService.listEventos', async () => {
    const consulta = makeConsulta();
    const error = new Error('no autorizado');
    consulta.listEventos.mockRejectedValue(error);
    const controller = new BitacoraController(consulta);

    await expect(controller.findAll(5, { userId: 9 })).rejects.toBe(error);
  });
});
