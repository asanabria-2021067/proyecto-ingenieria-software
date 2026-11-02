import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AssociationsService,
  ASOCIACION_ARCHIVADA_JUNTA_MESSAGE,
  CARGO_OCUPADO_MESSAGE,
  CARRERAS_INVALIDAS_MESSAGE,
  USUARIO_NO_ELEGIBLE_MESSAGE,
  USUARIO_YA_EN_JUNTA_MESSAGE,
} from '../src/associations/associations.service';
import { NIVEL_POR_CARGO, puedePublicarComoAsociacion } from '../src/associations/associations.rules';
import { assertPuedePublicarComoAsociacion } from '../src/associations/junta-access';
import { JuntaGuard } from '../src/associations/junta.guard';

function p2002(target: string) {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target } });
}

function montar(overrides: { asociacion?: unknown; usuario?: unknown; carreras?: number; crear?: unknown } = {}) {
  const tx = {
    asociacion: { create: vi.fn().mockResolvedValue({ idAsociacion: 1, nombre: 'AEC' }), update: vi.fn() },
    asociacionCarrera: { deleteMany: vi.fn(), createMany: vi.fn() },
    juntaAsociacion: {
      create: vi.fn().mockImplementation(async () => {
        if (overrides.crear) throw overrides.crear;
        return { idJuntaAsociacion: 1 };
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    bitacoraAuditoria: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    asociacion: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.asociacion === undefined ? { idAsociacion: 1, nombre: 'AEC', archivada: false, junta: [] } : overrides.asociacion,
      ),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue(overrides.usuario === undefined ? { estado: 'ACTIVO' } : overrides.usuario),
    },
    carrera: { count: vi.fn().mockResolvedValue(overrides.carreras ?? 1) },
    juntaAsociacion: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const notifications = {
    persistTemplateTx: vi.fn().mockResolvedValue({ count: 1 }),
    publishEffects: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AssociationsService(prisma as never, notifications as never);
  return { service, prisma, tx, notifications };
}

describe('reglas de la junta', () => {
  it('nivel por defecto 1:1 segun cargo', () => {
    expect(NIVEL_POR_CARGO).toEqual({
      PRESIDENTE: 'ADMINISTRADOR',
      VICEPRESIDENTE: 'EDITOR',
      SECRETARIO: 'EDITOR',
      TESORERO: 'EDITOR',
      VOCAL: 'LECTURA',
    });
  });

  it('publica a nombre de la asociacion el Presidente y quien tenga nivel Editor o mas', () => {
    expect(puedePublicarComoAsociacion('PRESIDENTE', 'LECTURA')).toBe(true);
    expect(puedePublicarComoAsociacion('TESORERO', 'EDITOR')).toBe(true);
    expect(puedePublicarComoAsociacion('VOCAL', 'ADMINISTRADOR')).toBe(true);
    expect(puedePublicarComoAsociacion('VOCAL', 'LECTURA')).toBe(false);
    expect(puedePublicarComoAsociacion('SECRETARIO', 'LECTURA')).toBe(false);
  });
});

describe('AssociationsService.create', () => {
  const dto = { nombre: 'AEC', idsCarreras: [1, 2] };

  it('rechaza carreras inexistentes sin escribir', async () => {
    const { service, prisma } = montar({ carreras: 1 });
    await expect(service.create(dto, 9)).rejects.toThrow(new BadRequestException(CARRERAS_INVALIDAS_MESSAGE));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('crea con carreras y deja bitacora', async () => {
    const { service, tx } = montar({ carreras: 2 });
    await service.create(dto, 9);
    expect(tx.asociacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ carreras: { create: [{ idCarrera: 1 }, { idCarrera: 2 }] } }) }),
    );
    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idUsuario: 9, accion: 'ASOCIACION_CREADA', tipoObjeto: 'ASOCIACION', idObjeto: '1' }),
    });
  });
});

describe('AssociationsService junta', () => {
  it('usa el nivel por defecto del cargo, audita y notifica', async () => {
    const { service, tx, notifications } = montar();
    await service.asignarJunta(1, { idUsuario: 5, cargo: 'VOCAL' }, 9);
    expect(tx.juntaAsociacion.create).toHaveBeenCalledWith({
      data: { idAsociacion: 1, idUsuario: 5, cargo: 'VOCAL', nivelPermiso: 'LECTURA', asignadoPor: 9 },
    });
    expect(tx.bitacoraAuditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accion: 'JUNTA_ASIGNADA' }) });
    expect(notifications.persistTemplateTx).toHaveBeenCalledWith(
      tx,
      [5],
      'JUNTA_ASOCIACION',
      expect.objectContaining({ accion: 'ASIGNADA', cargo: 'Vocal', nivelPermiso: 'LECTURA' }),
      expect.anything(),
    );
    expect(notifications.publishEffects).toHaveBeenCalled();
  });

  it('el admin puede fijar un nivel distinto al del cargo', async () => {
    const { service, tx } = montar();
    await service.asignarJunta(1, { idUsuario: 5, cargo: 'VOCAL', nivelPermiso: 'EDITOR' }, 9);
    expect(tx.juntaAsociacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ nivelPermiso: 'EDITOR' }) });
  });

  it('solo nombra usuarios activos', async () => {
    const { service } = montar({ usuario: { estado: 'BLOQUEADO' } });
    await expect(service.asignarJunta(1, { idUsuario: 5, cargo: 'VOCAL' }, 9)).rejects.toThrow(
      new BadRequestException(USUARIO_NO_ELEGIBLE_MESSAGE),
    );
  });

  it('no modifica la junta de una asociacion archivada', async () => {
    const { service } = montar({ asociacion: { idAsociacion: 1, nombre: 'AEC', archivada: true, junta: [] } });
    await expect(service.asignarJunta(1, { idUsuario: 5, cargo: 'VOCAL' }, 9)).rejects.toThrow(
      new BadRequestException(ASOCIACION_ARCHIVADA_JUNTA_MESSAGE),
    );
  });

  it('traduce cargo ocupado y usuario repetido a 409', async () => {
    const cargo = montar({ crear: p2002('id_asociacion,cargo') });
    await expect(cargo.service.asignarJunta(1, { idUsuario: 5, cargo: 'PRESIDENTE' }, 9)).rejects.toThrow(
      new ConflictException(CARGO_OCUPADO_MESSAGE),
    );
    const usuario = montar({ crear: p2002('id_asociacion,id_usuario') });
    await expect(usuario.service.asignarJunta(1, { idUsuario: 5, cargo: 'VOCAL' }, 9)).rejects.toThrow(
      new ConflictException(USUARIO_YA_EN_JUNTA_MESSAGE),
    );
  });

  it('cambiar el cargo reinicia el nivel; cambiar solo el nivel conserva el cargo', async () => {
    const junta = [{ idUsuario: 5, cargo: 'VOCAL', nivelPermiso: 'LECTURA' }];
    const a = montar({ asociacion: { idAsociacion: 1, nombre: 'AEC', archivada: false, junta } });
    await a.service.actualizarJunta(1, 5, { cargo: 'TESORERO' }, 9);
    expect(a.tx.juntaAsociacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cargo: 'TESORERO', nivelPermiso: 'EDITOR' }) }),
    );
    const b = montar({ asociacion: { idAsociacion: 1, nombre: 'AEC', archivada: false, junta } });
    await b.service.actualizarJunta(1, 5, { nivelPermiso: 'ADMINISTRADOR' }, 9);
    expect(b.tx.juntaAsociacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cargo: 'VOCAL', nivelPermiso: 'ADMINISTRADOR' }) }),
    );
  });

  it('quitar a quien no es de la junta da 404; quitar audita y notifica', async () => {
    const vacio = montar();
    await expect(vacio.service.quitarJunta(1, 5, 9)).rejects.toBeInstanceOf(NotFoundException);
    const junta = [{ idUsuario: 5, cargo: 'VOCAL', nivelPermiso: 'LECTURA' }];
    const ok = montar({ asociacion: { idAsociacion: 1, nombre: 'AEC', archivada: false, junta } });
    await ok.service.quitarJunta(1, 5, 9);
    expect(ok.tx.bitacoraAuditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ accion: 'JUNTA_REMOVIDA' }) });
    expect(ok.notifications.persistTemplateTx).toHaveBeenCalledWith(
      ok.tx,
      [5],
      'JUNTA_ASOCIACION',
      expect.objectContaining({ accion: 'REMOVIDA', nivelPermiso: null }),
      expect.anything(),
    );
  });
});

describe('verificacion de membresia', () => {
  const ctx = (userId: unknown, idAsociacion: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { userId }, params: { idAsociacion } }) }) }) as never;

  it('JuntaGuard: 403 si no es de la junta, deja la membresia si lo es', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ cargo: 'VOCAL', asociacion: { archivada: false } })
      .mockResolvedValueOnce({ cargo: 'VOCAL', asociacion: { archivada: true } });
    const guard = new JuntaGuard({ juntaAsociacion: { findUnique } } as never);
    await expect(guard.canActivate(ctx(5, '1'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(5, '1'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(5, '1'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctx(5, 'abc'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publicar a nombre de la asociacion exige cargo con permiso y asociacion no archivada', async () => {
    const db = (m: unknown) => ({ juntaAsociacion: { findUnique: vi.fn().mockResolvedValue(m) } }) as never;
    const base = { asociacion: { archivada: false } };
    await expect(assertPuedePublicarComoAsociacion(db(null), 1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertPuedePublicarComoAsociacion(db({ ...base, cargo: 'VOCAL', nivelPermiso: 'LECTURA' }), 1, 5),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertPuedePublicarComoAsociacion(db({ cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR', asociacion: { archivada: true } }), 1, 5),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertPuedePublicarComoAsociacion(db({ ...base, cargo: 'TESORERO', nivelPermiso: 'EDITOR' }), 1, 5),
    ).resolves.toBeUndefined();
  });
});

describe('candidatos a participante de un proyecto de asociacion', () => {
  const montarCandidatos = (membresia: unknown) => {
    const { service, prisma } = montar();
    (prisma.juntaAsociacion as Record<string, unknown>).findUnique = vi.fn().mockResolvedValue(membresia);
    const findMany = vi.fn().mockResolvedValue([
      { idUsuario: 7, nombre: 'Ana', apellido: 'Ruiz', perfil: { carne: '21001' }, juntasAsociacion: [{ cargo: 'VOCAL' }] },
      { idUsuario: 8, nombre: 'Beto', apellido: 'Paz', perfil: null, juntasAsociacion: [] },
    ]);
    (prisma.usuario as Record<string, unknown>).findMany = findMany;
    return { service, findMany };
  };

  it('Presidente o Editor ven junta y estudiantes de sus carreras, sin contacto ni a si mismos', async () => {
    const { service, findMany } = montarCandidatos({ cargo: 'TESORERO', nivelPermiso: 'EDITOR', asociacion: { archivada: false } });
    await expect(service.candidatosParticipantes(1, 5)).resolves.toEqual([
      { idUsuario: 7, nombre: 'Ana', apellido: 'Ruiz', carne: '21001', cargo: 'VOCAL' },
      { idUsuario: 8, nombre: 'Beto', apellido: 'Paz', carne: null, cargo: null },
    ]);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      estado: 'ACTIVO',
      idUsuario: { not: 5 },
      OR: [
        { juntasAsociacion: { some: { idAsociacion: 1 } } },
        { perfil: { is: { carrera: { asociaciones: { some: { idAsociacion: 1 } } } } } },
      ],
    });
  });

  it('un Vocal (Lectura) o quien no es de la junta recibe 403 sin consultar usuarios', async () => {
    for (const membresia of [{ cargo: 'VOCAL', nivelPermiso: 'LECTURA', asociacion: { archivada: false } }, null]) {
      const { service, findMany } = montarCandidatos(membresia);
      await expect(service.candidatosParticipantes(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
      expect(findMany).not.toHaveBeenCalled();
    }
  });
});
