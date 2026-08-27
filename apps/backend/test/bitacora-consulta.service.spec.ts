import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { BitacoraContextService } from '../src/bitacora/bitacora-context.service';
import { BitacoraConsultaService } from '../src/bitacora/bitacora-consulta.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';

function eventoRow(overrides: Record<string, unknown> = {}) {
  return {
    idAuditoria: 1,
    idUsuario: 9,
    accion: TipoEventoBitacora.TASK_CREATED,
    tipoObjeto: 'TAREA',
    idObjeto: '100',
    detalleJson: { idProyecto: 5, idSprint: 3, valorAnterior: null, valorNuevo: { tituloTarea: 'X' } },
    ipOrigen: null,
    fechaEvento: new Date('2026-01-01T00:00:00.000Z'),
    usuario: { idUsuario: 9, nombre: 'Ana', apellido: 'Lider', fotoUrl: null },
    ...overrides,
  };
}

function makePrisma(rows: unknown[] = [eventoRow()], total = rows.length) {
  return {
    bitacoraAuditoria: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaService & {
    bitacoraAuditoria: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  };
}

function makeContext(shouldThrow = false) {
  return {
    assertProjectLeader: shouldThrow
      ? vi.fn().mockRejectedValue(new ForbiddenException('No eres el líder de este proyecto'))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as BitacoraContextService;
}

describe('BitacoraConsultaService.listEventos', () => {
  it('rechaza con ForbiddenException cuando el actor no es el líder, sin llegar a consultar bitacora_auditoria', async () => {
    const prisma = makePrisma();
    const context = makeContext(true);
    const service = new BitacoraConsultaService(prisma, context);

    await expect(
      service.listEventos(5, 3, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bitacoraAuditoria.findMany).not.toHaveBeenCalled();
  });

  it('filtra por accion IN (eventos funcionales) y detalleJson.idProyecto — nunca por idProyecto directo (no existe la columna)', async () => {
    const prisma = makePrisma();
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    await service.listEventos(5, 9, { page: 1, limit: 20 });

    const llamada = prisma.bitacoraAuditoria.findMany.mock.calls[0][0];
    expect(llamada.where.AND).toContainEqual({ accion: { in: Object.values(TipoEventoBitacora) } });
    expect(llamada.where.AND).toContainEqual({ detalleJson: { path: ['idProyecto'], equals: 5 } });
  });

  it('aplica el filtro idSprint sobre detalleJson cuando se envía', async () => {
    const prisma = makePrisma();
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    await service.listEventos(5, 9, { page: 1, limit: 20, idSprint: 3 });

    const llamada = prisma.bitacoraAuditoria.findMany.mock.calls[0][0];
    expect(llamada.where.AND).toContainEqual({ detalleJson: { path: ['idSprint'], equals: 3 } });
  });

  it('aplica el filtro idActor sobre la columna real idUsuario', async () => {
    const prisma = makePrisma();
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    await service.listEventos(5, 9, { page: 1, limit: 20, idActor: 7 });

    const llamada = prisma.bitacoraAuditoria.findMany.mock.calls[0][0];
    expect(llamada.where.AND).toContainEqual({ idUsuario: 7 });
  });

  it('filtra por un tipoEvento específico cuando se envía (en vez del IN completo)', async () => {
    const prisma = makePrisma();
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    await service.listEventos(5, 9, { page: 1, limit: 20, tipoEvento: TipoEventoBitacora.SPRINT_STARTED });

    const llamada = prisma.bitacoraAuditoria.findMany.mock.calls[0][0];
    expect(llamada.where.AND).toContainEqual({ accion: TipoEventoBitacora.SPRINT_STARTED });
  });

  it('pagina con skip/take y devuelve total/totalPages', async () => {
    const prisma = makePrisma([eventoRow()], 45);
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    const resultado = await service.listEventos(5, 9, { page: 2, limit: 20 });

    const llamada = prisma.bitacoraAuditoria.findMany.mock.calls[0][0];
    expect(llamada.skip).toBe(20);
    expect(llamada.take).toBe(20);
    expect(resultado.total).toBe(45);
    expect(resultado.page).toBe(2);
    expect(resultado.totalPages).toBe(3);
  });

  it('mapea la fila cruda de BitacoraAuditoria a EventoBitacoraDto, incluyendo el actor', async () => {
    const prisma = makePrisma([eventoRow()]);
    const context = makeContext();
    const service = new BitacoraConsultaService(prisma, context);

    const resultado = await service.listEventos(5, 9, { page: 1, limit: 20 });

    expect(resultado.data[0]).toEqual({
      idAuditoria: 1,
      tipoEvento: TipoEventoBitacora.TASK_CREATED,
      tipoEntidad: 'TAREA',
      idEntidad: 100,
      idProyecto: 5,
      idSprint: 3,
      valorAnterior: null,
      valorNuevo: { tituloTarea: 'X' },
      fechaEvento: new Date('2026-01-01T00:00:00.000Z'),
      actor: { idUsuario: 9, nombre: 'Ana', apellido: 'Lider', fotoUrl: null },
    });
  });

  it('nunca expone filas de AuditInterceptor: el filtro accion IN excluye "METHOD /url" técnico', async () => {
    // AuditInterceptor escribe accion = `${method} ${url}` (p. ej. "POST
    // /api/proyectos/5/tareas"), un valor que nunca pertenece al enum
    // TipoEventoBitacora — este test documenta esa garantía de aislamiento
    // técnico/funcional a nivel de contrato del filtro, no de datos reales.
    expect(Object.values(TipoEventoBitacora)).not.toContain('POST /api/proyectos/5/tareas');
  });
});
