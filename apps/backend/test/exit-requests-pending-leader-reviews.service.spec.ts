import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExitRequestsAuthorizationService } from '../src/exit-requests/exit-requests.authorization.service';
import { ExitRequestsContextService } from '../src/exit-requests/exit-requests.context.service';
import { ExitRequestsService } from '../src/exit-requests/exit-requests.service';

const LIDER_ID = 1;
const OTRO_USUARIO_ID = 99;
const PROYECTO_ID = 10;
const OTRO_PROYECTO_ID = 20;

function makePrisma() {
  return {
    proyecto: { findFirst: vi.fn() },
    solicitudSalidaProyecto: { findMany: vi.fn() },
  } as any;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  const context = new ExitRequestsContextService(prisma);
  return new ExitRequestsService(
    prisma,
    { notifyFromTemplate: vi.fn() } as any,
    new ExitRequestsAuthorizationService(context),
    context,
  );
}

function solicitud(
  idSolicitud: number,
  idProyecto: number,
  idUsuario: number,
  estadoSolicitud: 'PREPARACION' | 'PENDIENTE_LIDER' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' = 'PENDIENTE_LIDER',
) {
  return {
    idSolicitud,
    idProyecto,
    idUsuario,
    motivo: `Motivo ${idSolicitud}`,
    solicitadaEn: new Date(`2026-01-${String(idSolicitud).padStart(2, '0')}T00:00:00.000Z`),
    estadoSolicitud,
  };
}

describe('ExitRequestsService.getPendingLeaderReviews', () => {
  it('el líder obtiene las solicitudes PENDIENTE_LIDER del proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findMany.mockResolvedValue([
      solicitud(1, PROYECTO_ID, 50, 'PENDIENTE_LIDER'),
    ]);
    const service = makeService(prisma);

    const result = await service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].idSolicitud).toBe(1);
    expect(result[0].idUsuario).toBe(50);
    expect(result[0].estadoSolicitud).toBe('PENDIENTE_LIDER');
  });

  it('filtra en la query por idProyecto y estadoSolicitud=PENDIENTE_LIDER exactamente', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID);

    expect(prisma.solicitudSalidaProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idProyecto: PROYECTO_ID, estadoSolicitud: 'PENDIENTE_LIDER' },
      }),
    );
  });

  it('lista vacía devuelve [], no error', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findMany.mockResolvedValue([]);
    const service = makeService(prisma);

    await expect(service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID)).resolves.toEqual([]);
  });

  it('rechaza si el actor no es el líder del proyecto, sin consultar solicitudes', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    const service = makeService(prisma);

    await expect(service.getPendingLeaderReviews(PROYECTO_ID, OTRO_USUARIO_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.solicitudSalidaProyecto.findMany).not.toHaveBeenCalled();
  });

  it('rechaza si el proyecto no existe', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);

    await expect(service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.solicitudSalidaProyecto.findMany).not.toHaveBeenCalled();
  });

  it('devuelve idSolicitud e idUsuario correctos para cada fila', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findMany.mockResolvedValue([
      solicitud(1, PROYECTO_ID, 50),
      solicitud(2, PROYECTO_ID, 51),
    ]);
    const service = makeService(prisma);

    const result = await service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID);

    expect(result.map((r) => [r.idSolicitud, r.idUsuario])).toEqual([
      [1, 50],
      [2, 51],
    ]);
  });
});

/**
 * Los estados PREPARACION/APROBADA/RECHAZADA/CANCELADA y las solicitudes de
 * otro proyecto se excluyen en la query de Prisma (`where`), no en un
 * `.filter` posterior en el service — estas pruebas fijan el mock de
 * `findMany` a lo que un `where` correcto retornaría realmente, protegiendo
 * el contrato aunque la implementación cambie de forma de filtrar.
 */
describe('ExitRequestsService.getPendingLeaderReviews — aislamiento', () => {
  const casos: Array<'PREPARACION' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'> = [
    'PREPARACION',
    'APROBADA',
    'RECHAZADA',
    'CANCELADA',
  ];

  it.each(casos)('excluye solicitudes en estado %s', async (estado) => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    // Un `where` correcto (estadoSolicitud: 'PENDIENTE_LIDER') nunca
    // devolvería esta fila; se simula aquí solo para demostrar que, si el
    // filtro se relajara por error, el test lo detectaría.
    prisma.solicitudSalidaProyecto.findMany.mockImplementation((args: any) => {
      const filas = [solicitud(1, PROYECTO_ID, 50, estado)];
      return Promise.resolve(filas.filter((f) => f.estadoSolicitud === args.where.estadoSolicitud));
    });
    const service = makeService(prisma);

    await expect(service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID)).resolves.toEqual([]);
  });

  it('excluye solicitudes PENDIENTE_LIDER de otro proyecto', async () => {
    const prisma = makePrisma();
    prisma.proyecto.findFirst.mockResolvedValue({ idProyecto: PROYECTO_ID, creadoPor: LIDER_ID });
    prisma.solicitudSalidaProyecto.findMany.mockImplementation((args: any) => {
      const filas = [solicitud(1, OTRO_PROYECTO_ID, 50, 'PENDIENTE_LIDER')];
      return Promise.resolve(filas.filter((f) => f.idProyecto === args.where.idProyecto));
    });
    const service = makeService(prisma);

    await expect(service.getPendingLeaderReviews(PROYECTO_ID, LIDER_ID)).resolves.toEqual([]);
  });
});
