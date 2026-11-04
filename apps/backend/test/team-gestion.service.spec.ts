import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BajaIntegranteDto } from '../src/team/dto/baja-integrante.dto';
import { TeamGestionService } from '../src/team/team-gestion.service';

const LIDER = 1;
const ADMIN = 2;
const ESTUDIANTE = 3;

function makeService() {
  const prisma = {
    proyecto: { findUnique: vi.fn().mockResolvedValue({ creadoPor: LIDER, tituloProyecto: 'P' }) },
    usuarioRolAcceso: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number; rolAcceso: { nombrePerfil: string } } }) =>
        where.idUsuario === ADMIN && where.rolAcceso.nombrePerfil === 'administrador' ? { idUsuarioRolAcceso: 1 } : null,
      ),
    },
    $transaction: vi.fn(),
  };
  const service = new TeamGestionService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

describe('TeamGestionService', () => {
  it('baja: el líder y un estudiante reciben 403 antes de abrir la transacción', async () => {
    const { service, prisma } = makeService();
    for (const actor of [LIDER, ESTUDIANTE]) {
      await expect(service.darDeBaja(10, 5, actor, 'motivo suficiente')).rejects.toMatchObject({ status: 403 });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('carga: un estudiante recibe 403', async () => {
    const { service, prisma } = makeService();
    await expect(service.cargaEquipo(10, ESTUDIANTE)).rejects.toMatchObject({ status: 403 });
    expect(prisma.proyecto.findUnique).toHaveBeenCalled();
  });

  it('proyecto inexistente: 404', async () => {
    const { service, prisma } = makeService();
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.darDeBaja(10, 5, ADMIN, 'motivo suficiente')).rejects.toMatchObject({ status: 404 });
  });

  it('motivo: obligatorio, saneado y acotado', async () => {
    const errores = async (motivo: unknown) => validate(plainToInstance(BajaIntegranteDto, { motivo }));
    expect(await errores('')).not.toHaveLength(0);
    expect(await errores('   ')).not.toHaveLength(0);
    expect(await errores('corto')).not.toHaveLength(0);
    expect(await errores(undefined)).not.toHaveLength(0);
    expect(await errores('x'.repeat(501))).not.toHaveLength(0);
    const ok = plainToInstance(BajaIntegranteDto, { motivo: '  No   cumple\n\tacuerdos del equipo  ' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.motivo).toBe('No cumple acuerdos del equipo');
  });
});

describe('TeamGestionService: responsables adicionales (MEJ-109)', () => {
  it('la baja quita al usuario de todas las tareas abiertas como adicional y lo registra en la bitácora', async () => {
    const tx = {
      participacionProyecto: {
        findMany: vi.fn().mockResolvedValue([{ idParticipacion: 7, estadoParticipacion: 'ACTIVO' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      asignacionTarea: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tareaResponsable: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const bitacora = { registrarEvento: vi.fn() };
    const prisma = {
      proyecto: { findUnique: vi.fn().mockResolvedValue({ creadoPor: LIDER, tituloProyecto: 'P' }) },
      usuarioRolAcceso: {
        findFirst: vi.fn(async ({ where }: { where: { idUsuario: number; rolAcceso: { nombrePerfil: string } } }) =>
          where.idUsuario === ADMIN && where.rolAcceso.nombrePerfil === 'administrador' ? { idUsuarioRolAcceso: 1 } : null,
        ),
      },
    };
    const projectTx = { run: vi.fn((_p: number, _a: number, _n: string, fn: (c: unknown) => unknown) => fn({ tx, project: {} })) };
    const service = new TeamGestionService(
      prisma as never,
      {} as never,
      bitacora as never,
      { notifyUsers: vi.fn() } as never,
      projectTx as never,
      { assertWriteTx: vi.fn() } as never,
    );

    await service.darDeBaja(10, ESTUDIANTE, ADMIN, 'motivo suficiente');

    // Sin el filtro de Sprint ACTIVO: el adicional sale de todas las tareas abiertas del proyecto.
    expect(tx.tareaResponsable.deleteMany).toHaveBeenCalledWith({
      where: { idUsuario: ESTUDIANTE, tarea: { idProyecto: 10, eliminadoEn: null, estadoTarea: { not: 'HECHO' } } },
    });
    expect(bitacora.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ valorNuevo: expect.objectContaining({ adicionales: 2 }) }),
    );
  });

  it('la carga cuenta también las tareas abiertas donde es responsable adicional', async () => {
    const prisma = {
      proyecto: { findUnique: vi.fn().mockResolvedValue({ creadoPor: LIDER, tituloProyecto: 'P' }) },
      sprint: { findFirst: vi.fn().mockResolvedValue(null) },
      participacionProyecto: {
        findMany: vi.fn().mockResolvedValue([{ usuario: { idUsuario: ESTUDIANTE, nombre: 'E', apellido: 'S' } }]),
      },
      asignacionTarea: { groupBy: vi.fn().mockResolvedValue([{ idUsuario: ESTUDIANTE, _count: { _all: 2 } }]) },
      tareaResponsable: { groupBy: vi.fn().mockResolvedValue([{ idUsuario: ESTUDIANTE, _count: { _all: 3 } }]) },
      registroTiempoTarea: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new TeamGestionService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const carga = await service.cargaEquipo(10, LIDER);
    expect(carga.integrantes[0].tareasAbiertas).toBe(5);
    expect(prisma.tareaResponsable.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tarea: { idProyecto: 10, eliminadoEn: null, estadoTarea: { not: 'HECHO' } } }) }),
    );
  });
});
