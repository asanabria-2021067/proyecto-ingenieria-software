import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPolicyService } from '../src/common/project-policy/project-policy.service';
import { HistoricalProjectReadService } from '../src/project-closure/historical-project-read.service';

/**
 * `GET /admin/proyectos?grupo=cierres`: la bandeja de cierres entrega cada
 * solicitud con su situación y el conteo por situación de TODO el grupo.
 */

const FECHA = new Date('2026-10-01T15:00:00.000Z');

function proyecto(idProyecto: number) {
  return {
    idProyecto,
    tituloProyecto: `Proyecto ${idProyecto}`,
    estadoProyecto: 'EN_SOLICITUD_CIERRE',
    creador: { idUsuario: 7, nombre: 'Ana', apellido: 'López' },
    sprints: [],
    roles: [],
  };
}

function revision(idProyecto: number, numeroRevision: number, estadoRevision: string) {
  return {
    idProyecto,
    idRevisionCierre: idProyecto * 100 + numeroRevision,
    numeroRevision,
    estadoRevision,
    enviadaEn: estadoRevision === 'BORRADOR' ? null : FECHA,
    resueltaEn: ['BORRADOR', 'ENVIADA'].includes(estadoRevision) ? null : FECHA,
  };
}

/** Una solicitud por situación, más un legacy repetido y un dato inconsistente. */
const PROYECTOS = [1, 2, 3, 4, 5, 6].map(proyecto);
const REVISIONES = [
  revision(1, 1, 'ENVIADA'),
  revision(2, 1, 'CORRECCION_DOCUMENTAL'),
  revision(2, 2, 'ENVIADA'),
  revision(3, 1, 'CORRECCION_DOCUMENTAL'),
  revision(3, 2, 'BORRADOR'),
  // 4 y 5: legacy, sin revisiones.
  revision(6, 1, 'DEVUELTA_A_EJECUCION'),
];

function makePrisma(proyectos = PROYECTOS, revisiones = REVISIONES) {
  return {
    proyecto: {
      count: vi.fn().mockResolvedValue(proyectos.length),
      findMany: vi.fn().mockResolvedValue(proyectos),
    },
    revisionCierreProyecto: { findMany: vi.fn().mockResolvedValue(revisiones) },
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, policy: unknown = { assertAdminTx: vi.fn().mockResolvedValue(undefined) }) {
  // Orden real del constructor: prisma, readPolicy, hours, policy.
  const service = new HistoricalProjectReadService(prisma as never, {} as never, {} as never, policy as never);
  const warn = vi.fn();
  (service as unknown as { logger: { warn: typeof warn } }).logger = { warn };
  return { service, warn };
}

type Item = { idProyecto: number; cierre?: { situacion: string; puedeResolver: boolean; numeroRevision: number | null } };

describe('Bandeja administrativa — grupo cierres', () => {
  it('cada proyecto recibe la situación de su solicitud de cierre', async () => {
    const { service } = makeService(makePrisma());
    const pagina = await service.adminList(1, { grupo: 'cierres' } as never);
    const situacion = Object.fromEntries((pagina.items as Item[]).map((i) => [i.idProyecto, i.cierre?.situacion]));

    expect(situacion).toEqual({
      1: 'PENDIENTE_DE_EVALUACION',
      2: 'REENVIADA_PARA_REVISION',
      3: 'EN_ESPERA_DE_CORRECCIONES',
      4: 'SIN_ENTREGA_FORMAL',
      5: 'SIN_ENTREGA_FORMAL',
      6: 'SIN_CLASIFICACION',
    });
  });

  it('los contadores cubren todo el grupo, suman el total y no duplican proyectos', async () => {
    const { service } = makeService(makePrisma());
    const pagina = await service.adminList(1, { grupo: 'cierres' } as never);

    expect(pagina.resumenCierre).toEqual({
      PENDIENTE_DE_EVALUACION: 1,
      REENVIADA_PARA_REVISION: 1,
      EN_ESPERA_DE_CORRECCIONES: 1,
      SIN_ENTREGA_FORMAL: 2,
      SIN_CLASIFICACION: 1,
    });
    expect(Object.values(pagina.resumenCierre!).reduce((a, b) => a + b, 0)).toBe(pagina.total);
    const ids = (pagina.items as Item[]).map((i) => i.idProyecto);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no pagina el grupo: page y limit no recortan la población ni alteran los conteos', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const pagina = await service.adminList(1, { grupo: 'cierres', page: 3, limit: 2 } as never);

    const args = prisma.proyecto.findMany.mock.calls[0][0];
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('take');
    expect(pagina.items).toHaveLength(6);
    expect(pagina.page).toBe(1);
    expect(pagina.total).toBe(6);
  });

  it('lee las revisiones de todo el grupo en UNA consulta, no una por proyecto', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    await service.adminList(1, { grupo: 'cierres' } as never);

    expect(prisma.proyecto.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.revisionCierreProyecto.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.revisionCierreProyecto.findMany.mock.calls[0][0].where).toEqual({ idProyecto: { in: [1, 2, 3, 4, 5, 6] } });
  });

  it('no expone la huella de la entrega, el comentario del revisor ni documentos', async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma);
    const pagina = await service.adminList(1, { grupo: 'cierres' } as never);

    const select = prisma.revisionCierreProyecto.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['enviadaEn', 'estadoRevision', 'idProyecto', 'idRevisionCierre', 'numeroRevision', 'resueltaEn'],
    );
    const cierre = (pagina.items as Array<{ cierre: Record<string, unknown> }>)[0].cierre;
    expect(Object.keys(cierre).sort()).toEqual(
      ['correccionSolicitadaEn', 'enviadaEn', 'numeroRevision', 'origen', 'puedeResolver', 'revisionId', 'situacion'],
    );
  });

  it('los legacy siguen visibles, sin número de envío ni veredicto posible', async () => {
    const { service } = makeService(makePrisma());
    const pagina = await service.adminList(1, { grupo: 'cierres' } as never);
    const legacy = (pagina.items as Item[]).filter((i) => i.cierre?.situacion === 'SIN_ENTREGA_FORMAL');

    expect(legacy.map((i) => i.idProyecto)).toEqual([4, 5]);
    for (const item of legacy) expect(item.cierre).toMatchObject({ numeroRevision: null, puedeResolver: false });
  });

  it('un dato inconsistente deja rastro en el log con el id del proyecto y nada más', async () => {
    const { service, warn } = makeService(makePrisma());
    await service.adminList(1, { grupo: 'cierres' } as never);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Solicitud de cierre sin clasificación: proyecto 6');
  });

  it('un grupo vacío responde con todos los contadores en cero y sin consultar revisiones', async () => {
    const prisma = makePrisma([], []);
    const { service } = makeService(prisma);
    const pagina = await service.adminList(1, { grupo: 'cierres' } as never);

    expect(pagina.items).toEqual([]);
    expect(Object.values(pagina.resumenCierre!)).toEqual([0, 0, 0, 0, 0]);
    expect(prisma.revisionCierreProyecto.findMany).not.toHaveBeenCalled();
  });

  it.each(['activos', 'cerrados', 'revision'])('el grupo «%s» conserva su contrato: paginado, sin bloque cierre ni resumen', async (grupo) => {
    const prisma = makePrisma([proyecto(9)], []);
    const { service } = makeService(prisma);
    const pagina = await service.adminList(1, { grupo, page: 2, limit: 5 } as never);

    expect(prisma.proyecto.findMany.mock.calls[0][0]).toMatchObject({ skip: 5, take: 5 });
    expect(prisma.revisionCierreProyecto.findMany).not.toHaveBeenCalled();
    expect(pagina).toMatchObject({ page: 2, limit: 5 });
    expect(pagina).not.toHaveProperty('resumenCierre');
    expect(pagina.items[0]).not.toHaveProperty('cierre');
    expect(Object.keys(pagina.items[0]).sort()).toEqual(
      ['accion', 'estadoProyecto', 'idProyecto', 'lider', 'sprintAmbiente', 'tituloProyecto', 'usuariosActivos'],
    );
  });

  it('quien no es administrador (líder o estudiante) recibe 403 antes de leer ningún proyecto', async () => {
    const prisma = makePrisma();
    // Política real: sin perfil `administrador` no hay bandeja, sea quien sea.
    const policy = new ProjectPolicyService({} as never);
    const { service } = makeService(prisma, policy);

    await expect(service.adminList(42, { grupo: 'cierres' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarioRolAcceso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuario: 42, rolAcceso: { nombrePerfil: 'administrador' } } }),
    );
    expect(prisma.proyecto.findMany).not.toHaveBeenCalled();
    expect(prisma.revisionCierreProyecto.findMany).not.toHaveBeenCalled();
  });
});
