import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGO_INSIGNIAS, ClaveInsignia } from '../src/insignias/insignias.catalog';
import { InsigniasService, listarInsigniasUsuario } from '../src/insignias/insignias.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

const metricas = vi.hoisted(() => ({ valores: {} as Record<string, number> }));
vi.mock('../src/insignias/insignias.metricas', () => ({
  calcularMetrica: vi.fn(async (_db: unknown, clave: string, idUsuario: number) => metricas.valores[`${idUsuario}:${clave}`] ?? 0),
}));

interface Fila {
  idUsuario: number;
  idInsignia: number;
  nivel: string | null;
  progreso: number;
  fechaBronce: Date | null;
  fechaPlata: Date | null;
  fechaOro: Date | null;
  fechaDiamante: Date | null;
}

/** Prisma en memoria: catálogo + insigniaUsuario con upsert real. */
function makePrisma(usuarios: number[] = [1]) {
  const catalogo = CATALOGO_INSIGNIAS.map((c, i) => ({
    idInsignia: i + 1,
    clave: c.clave,
    nombre: c.nombre,
    descripcion: c.descripcion,
    icono: c.icono,
    metrica: c.clave,
    umbralBronce: c.umbrales[0],
    umbralPlata: c.umbrales[1],
    umbralOro: c.umbrales[2],
    umbralDiamante: c.umbrales[3],
  }));
  const filas: Fila[] = [];
  const prisma = {
    insignia: {
      findMany: vi.fn(async ({ where, include }: { where?: { clave?: { in: string[] } }; include?: { usuarios: { where: { idUsuario: number } } } }) =>
        catalogo
          .filter((c) => !where?.clave || where.clave.in.includes(c.clave))
          .map((c) => ({
            ...c,
            usuarios: filas.filter((f) => f.idInsignia === c.idInsignia && f.idUsuario === include?.usuarios.where.idUsuario),
          })),
      ),
      upsert: vi.fn(async () => undefined),
    },
    insigniaUsuario: {
      upsert: vi.fn(async ({ where, update, create }: { where: { idUsuario_idInsignia: { idUsuario: number; idInsignia: number } }; update: object; create: object }) => {
        const { idUsuario, idInsignia } = where.idUsuario_idInsignia;
        const existente = filas.find((f) => f.idUsuario === idUsuario && f.idInsignia === idInsignia);
        if (existente) Object.assign(existente, update);
        else filas.push({ fechaBronce: null, fechaPlata: null, fechaOro: null, fechaDiamante: null, ...(create as Fila) });
      }),
    },
    usuario: {
      findMany: vi.fn(async ({ cursor, take }: { cursor?: { idUsuario: number }; take: number }) => {
        const desde = cursor ? usuarios.indexOf(cursor.idUsuario) + 1 : 0;
        return usuarios.slice(desde, desde + take).map((idUsuario) => ({ idUsuario }));
      }),
    },
  };
  return { prisma, filas };
}

const fila = (filas: Fila[], clave: ClaveInsignia, idUsuario = 1) =>
  filas.find((f) => f.idUsuario === idUsuario && f.idInsignia === CATALOGO_INSIGNIAS.findIndex((c) => c.clave === clave) + 1);

function build(usuarios?: number[]) {
  const { prisma, filas } = makePrisma(usuarios);
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new InsigniasService(prisma as never, notifications as never);
  return { service, prisma, filas, notifications };
}

beforeEach(() => {
  metricas.valores = {};
});

describe('InsigniasService.recalcular (HU-190, T-347)', () => {
  it('sin umbral alcanzado guarda el progreso sin nivel ni notificación', async () => {
    const { service, filas, notifications } = build();
    metricas.valores['1:tareas'] = 0;
    await service.recalcular(1, ['tareas']);
    expect(fila(filas, 'tareas')).toMatchObject({ progreso: 0, nivel: null });
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it.each([
    [0, null],
    [1, 'BRONCE'],
    [9, 'BRONCE'],
    [10, 'PLATA'],
    [11, 'PLATA'],
    [49, 'PLATA'],
    [50, 'ORO'],
    [99, 'ORO'],
    [100, 'DIAMANTE'],
    [101, 'DIAMANTE'],
  ])('tareas = %i da nivel %s', async (valor, nivel) => {
    const { service, filas } = build();
    metricas.valores['1:tareas'] = valor;
    await service.recalcular(1, ['tareas']);
    expect(fila(filas, 'tareas')).toMatchObject({ progreso: valor, nivel });
  });

  it('guarda la fecha de cada nivel alcanzado y no las de los no alcanzados', async () => {
    const { service, filas } = build();
    metricas.valores['1:tareas'] = 10;
    await service.recalcular(1, ['tareas']);
    const f = fila(filas, 'tareas')!;
    expect(f.fechaBronce).toBeInstanceOf(Date);
    expect(f.fechaPlata).toBeInstanceOf(Date);
    expect(f.fechaOro).toBeNull();
    expect(f.fechaDiamante).toBeNull();
  });

  it('no baja progreso ni nivel si la métrica baja', async () => {
    const { service, filas } = build();
    metricas.valores['1:comentarios'] = 25;
    await service.recalcular(1, ['comentarios']);
    metricas.valores['1:comentarios'] = 3;
    const subidas = await service.recalcular(1, ['comentarios']);
    expect(fila(filas, 'comentarios')).toMatchObject({ progreso: 25, nivel: 'PLATA' });
    expect(subidas).toEqual([]);
  });

  it('solo recalcula las claves pedidas', async () => {
    const { service, filas } = build();
    metricas.valores = { '1:tareas': 5, '1:horas': 30 };
    await service.recalcular(1, ['tareas']);
    expect(fila(filas, 'tareas')).toBeDefined();
    expect(fila(filas, 'horas')).toBeUndefined();
  });

  it('no escribe si nada cambió', async () => {
    const { service, prisma } = build();
    metricas.valores['1:tareas'] = 4;
    await service.recalcular(1, ['tareas']);
    await service.recalcular(1, ['tareas']);
    expect(prisma.insigniaUsuario.upsert).toHaveBeenCalledTimes(1);
  });

  describe('notificación', () => {
    it('una sola notificación con el nivel más alto cuando un evento sube varios niveles', async () => {
      const { service, notifications } = build();
      metricas.valores['1:tareas'] = 50; // salta Bronce, Plata y Oro
      const subidas = await service.recalcular(1, ['tareas']);
      expect(subidas).toEqual(['tareas']);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([1], 'INSIGNIA_OBTENIDA', {
        insigniaClave: 'tareas',
        insigniaNombre: 'Tareas completadas',
        nivel: 'ORO',
        nivelNombre: 'Oro',
      });
    });

    it('notifica solo cuando hay subida real de nivel', async () => {
      const { service, notifications } = build();
      metricas.valores['1:tareas'] = 1;
      await service.recalcular(1, ['tareas']);
      metricas.valores['1:tareas'] = 2; // mismo nivel, más progreso
      await service.recalcular(1, ['tareas']);
      metricas.valores['1:tareas'] = 10;
      await service.recalcular(1, ['tareas']);
      expect(notifications.notifyFromTemplate.mock.calls.map((c) => c[2].nivel)).toEqual(['BRONCE', 'PLATA']);
    });

    it('una notificación por cada insignia distinta que sube en el mismo evento', async () => {
      const { service, notifications } = build();
      metricas.valores = { '1:horas': 5, '1:cerrados': 1 };
      await service.recalcular(1, ['horas', 'cerrados', 'liderados']);
      expect(notifications.notifyFromTemplate).toHaveBeenCalledTimes(2);
    });

    it('con notificar=false no notifica pero sí actualiza', async () => {
      const { service, filas, notifications } = build();
      metricas.valores['1:tareas'] = 10;
      await service.recalcular(1, ['tareas'], false);
      expect(fila(filas, 'tareas')?.nivel).toBe('PLATA');
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('la plantilla INSIGNIA_OBTENIDA nombra la insignia y el nivel en texto', () => {
      const data = { insigniaClave: 'horas', insigniaNombre: 'Horas acreditadas', nivel: 'ORO', nivelNombre: 'Oro' };
      expect(NOTIFICATION_TEMPLATES.INSIGNIA_OBTENIDA.title).toBe('Nueva insignia');
      expect(NOTIFICATION_TEMPLATES.INSIGNIA_OBTENIDA.message(data)).toBe(
        'Obtuviste la insignia "Horas acreditadas" nivel Oro.',
      );
    });

    describe('con NotificationsService real (preferencias)', () => {
      function conNotificacionesReales(bloqueados: { idUsuario: number }[]) {
        const { prisma, filas } = makePrisma();
        const notifPrisma = {
          preferenciaNotificacion: { findMany: vi.fn().mockResolvedValue(bloqueados) },
          notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        };
        const notifications = new NotificationsService(notifPrisma as never, {} as never);
        return { service: new InsigniasService(prisma as never, notifications), notifPrisma, filas };
      }

      it('crea la Notificacion INSIGNIA_OBTENIDA si el tipo está activo', async () => {
        const { service, notifPrisma } = conNotificacionesReales([]);
        metricas.valores['1:horas'] = 25;
        await service.recalcular(1, ['horas']);
        expect(notifPrisma.notificacion.createMany).toHaveBeenCalledTimes(1);
        const [{ data }] = notifPrisma.notificacion.createMany.mock.calls[0];
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({
          idUsuario: 1,
          tipoNotificacion: 'INSIGNIA_OBTENIDA',
          tituloNotificacion: 'Nueva insignia',
          mensajeNotificacion: 'Obtuviste la insignia "Horas acreditadas" nivel Plata.',
        });
      });

      it('respeta PreferenciaNotificacion: tipo desactivado = sin notificación, pero sí otorga la insignia', async () => {
        const { service, notifPrisma, filas } = conNotificacionesReales([{ idUsuario: 1 }]);
        metricas.valores['1:horas'] = 25;
        await service.recalcular(1, ['horas']);
        expect(notifPrisma.notificacion.createMany).not.toHaveBeenCalled();
        expect(fila(filas, 'horas')?.nivel).toBe('PLATA');
      });
    });
  });
});

describe('InsigniasService.backfillTodos (HU-190, T-347)', () => {
  it('recalcula todas las claves de todos los usuarios y sincroniza el catálogo', async () => {
    const { service, prisma, filas } = build([1, 2, 3]);
    metricas.valores = { '1:tareas': 1, '2:horas': 100, '3:sprints': 20 };
    const total = await service.backfillTodos();
    expect(total).toBe(3);
    expect(prisma.insignia.upsert).toHaveBeenCalledTimes(7);
    expect(fila(filas, 'tareas', 1)?.nivel).toBe('BRONCE');
    expect(fila(filas, 'horas', 2)?.nivel).toBe('ORO');
    expect(fila(filas, 'sprints', 3)?.nivel).toBe('DIAMANTE');
  });

  it('es SILENCIOSO: no crea notificaciones aunque haya subidas de nivel', async () => {
    const { service, notifications } = build([1, 2]);
    metricas.valores = { '1:tareas': 100, '2:horas': 250 };
    await service.backfillTodos();
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });

  it('es idempotente: una segunda corrida deja el mismo estado y no escribe de nuevo', async () => {
    const { service, prisma, filas } = build([1, 2]);
    metricas.valores = { '1:tareas': 10, '2:comentarios': 5 };
    await service.backfillTodos();
    const primera = JSON.stringify(filas);
    const escrituras = prisma.insigniaUsuario.upsert.mock.calls.length;
    await service.backfillTodos();
    expect(JSON.stringify(filas)).toBe(primera);
    expect(prisma.insigniaUsuario.upsert).toHaveBeenCalledTimes(escrituras);
  });

  it('sin usuarios no hace nada más que sincronizar el catálogo', async () => {
    const { service, prisma } = build([]);
    expect(await service.backfillTodos()).toBe(0);
    expect(prisma.insigniaUsuario.upsert).not.toHaveBeenCalled();
  });

  it('sin NotificationsService (como el script) tampoco falla', async () => {
    const { prisma } = makePrisma([1]);
    metricas.valores['1:tareas'] = 100;
    await expect(new InsigniasService(prisma as never).backfillTodos()).resolves.toBe(1);
  });
});

describe('listarInsigniasUsuario', () => {
  it('devuelve las 7 con progreso, siguiente umbral y fechas; las bloqueadas con nivel null', async () => {
    const { service, filas } = build();
    metricas.valores['1:tareas'] = 12;
    await service.recalcular(1, ['tareas']);
    const lista = await service.listarMias(1);
    expect(lista).toHaveLength(7);
    const tareas = lista.find((i) => i.clave === 'tareas')!;
    expect(tareas).toMatchObject({ nivel: 'PLATA', progreso: 12, siguienteUmbral: 50, umbrales: [1, 10, 50, 100] });
    expect(tareas.fechas.BRONCE).toBe(fila(filas, 'tareas')!.fechaBronce!.toISOString());
    expect(tareas.fechas.ORO).toBeNull();
    expect(lista.find((i) => i.clave === 'horas')).toMatchObject({ nivel: null, progreso: 0, siguienteUmbral: 5 });
  });

  it('con Diamante no hay siguiente umbral', async () => {
    const { service } = build();
    metricas.valores['1:sprints'] = 25;
    await service.recalcular(1, ['sprints']);
    expect((await service.listarMias(1)).find((i) => i.clave === 'sprints')).toMatchObject({
      nivel: 'DIAMANTE',
      siguienteUmbral: null,
    });
  });

  it('soloObtenidas oculta las bloqueadas (perfil público) y filtra por el usuario pedido', async () => {
    const { service, prisma } = build([1, 2]);
    metricas.valores = { '1:tareas': 1, '2:horas': 5 };
    await service.recalcular(1, ['tareas', 'horas']);
    await service.recalcular(2, ['tareas', 'horas']);
    const publicas = await listarInsigniasUsuario(prisma as never, 2, true);
    expect(publicas.map((i) => i.clave)).toEqual(['horas']);
  });
});
