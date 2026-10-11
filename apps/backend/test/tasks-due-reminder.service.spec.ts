import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EstadoTarea, Prisma, TipoNotificacion } from '@prisma/client';
import {
  TasksDueReminderService,
  fechaLimiteParaVentana,
  type TareaPorVencer,
  type VentanaRecordatorio,
} from '../src/tasks/tasks-due-reminder.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationsGateway } from '../src/notifications/notifications.gateway';
import { NOTIFICATION_TEMPLATES } from '../src/notifications/templates/notification.templates';

const PROJECT_ID = 5;
const TASK_ID = 10;
const RESPONSABLE_ID = 7;

// 08:00 en Guatemala del 10/10/2026 (hora del cron) = 14:00 UTC.
const AHORA = new Date('2026-10-10T14:00:00.000Z');
const MANANA = new Date('2026-10-11T00:00:00.000Z'); // ventana 24 h
const PASADO_MANANA = new Date('2026-10-12T00:00:00.000Z'); // ventana 48 h

function tarea(overrides: Partial<TareaPorVencer> = {}): TareaPorVencer {
  return {
    idTarea: TASK_ID,
    idProyecto: PROJECT_ID,
    tituloTarea: 'Diseñar el login',
    fechaLimite: MANANA,
    proyecto: { tituloProyecto: 'Proyecto X' },
    asignaciones: [{ idUsuario: RESPONSABLE_ID }],
    ...overrides,
  };
}

/**
 * Prisma simulado con lo mínimo que el job toca. `recordatorioTarea`
 * imita el @@unique([idTarea, ventanaHoras]) con un Set: createMany con
 * skipDuplicates devuelve count 0 si la clave ya existe, igual que el
 * ON CONFLICT DO NOTHING real.
 */
function makePrisma(tareasPorFecha: Map<number, TareaPorVencer[]> = new Map()) {
  const registrados = new Set<string>();
  const prisma = {
    tarea: {
      findMany: vi.fn(async ({ where }: { where: { fechaLimite: Date } }) =>
        tareasPorFecha.get(where.fechaLimite.getTime()) ?? [],
      ),
    },
    recordatorioTarea: {
      createMany: vi.fn(async ({ data }: { data: { idTarea: number; ventanaHoras: number }[] }) => {
        let count = 0;
        for (const fila of data) {
          const clave = `${fila.idTarea}:${fila.ventanaHoras}`;
          if (!registrados.has(clave)) {
            registrados.add(clave);
            count++;
          }
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { idTarea: number; ventanaHoras: number } }) => {
        registrados.delete(`${where.idTarea}:${where.ventanaHoras}`);
        return { count: 1 };
      }),
    },
  };
  return { prisma: prisma as typeof prisma & PrismaService, registrados };
}

/** Los tests de T-329 sustituyen la emisión: NotificationsService no se toca. */
const sinNotificaciones = {} as NotificationsService;

/** Sustituye solo el punto de emisión (T-330) para observar qué detecta T-329. */
class ServicioObservado extends TasksDueReminderService {
  readonly emitir = vi.fn<(tarea: TareaPorVencer, ventana: VentanaRecordatorio, responsable: number) => Promise<void>>(
    async () => undefined,
  );

  protected override emitirRecordatorio(tarea: TareaPorVencer, ventana: VentanaRecordatorio, responsable: number) {
    return this.emitir(tarea, ventana, responsable);
  }
}

describe('fechaLimiteParaVentana (día calendario de Guatemala)', () => {
  it('24 h = mañana y 48 h = pasado mañana, como medianoche UTC del día', () => {
    expect(fechaLimiteParaVentana(24, AHORA)).toEqual(MANANA);
    expect(fechaLimiteParaVentana(48, AHORA)).toEqual(PASADO_MANANA);
  });

  it('usa el día de Guatemala aunque en UTC ya sea el día siguiente', () => {
    // 21:00 del 10/10 en Guatemala = 03:00 UTC del 11/10.
    expect(fechaLimiteParaVentana(24, new Date('2026-10-11T03:00:00.000Z'))).toEqual(MANANA);
  });

  it('a las 00:30 de Guatemala ya cuenta el nuevo día', () => {
    // 00:30 del 11/10 en Guatemala = 06:30 UTC del 11/10.
    expect(fechaLimiteParaVentana(24, new Date('2026-10-11T06:30:00.000Z'))).toEqual(PASADO_MANANA);
  });
});

describe('TasksDueReminderService.enviarRecordatoriosDeVencimiento (T-329)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filtra en la consulta: no HECHO, no eliminada, proyecto vigente, con responsable y sin aviso previo de esa ventana', async () => {
    const { prisma } = makePrisma();
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.tarea.findMany).toHaveBeenCalledTimes(2);
    for (const [ventana, fecha] of [
      [48, PASADO_MANANA],
      [24, MANANA],
    ] as const) {
      expect(prisma.tarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            fechaLimite: fecha,
            estadoTarea: { not: EstadoTarea.HECHO },
            eliminadoEn: null,
            proyecto: { eliminadoEn: null },
            asignaciones: { some: { desasignadaEn: null } },
            recordatorios: { none: { ventanaHoras: ventana } },
          },
        }),
      );
    }
  });

  it('el responsable sale de la asignación vigente (desasignadaEn null)', async () => {
    const { prisma } = makePrisma();
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          asignaciones: { where: { desasignadaEn: null }, select: { idUsuario: true }, take: 1 },
        }),
      }),
    );
  });

  it('caso 1: tarea que vence mañana → aviso de 24 h al responsable, registrado', async () => {
    const { prisma, registrados } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(1);
    expect(service.emitir).toHaveBeenCalledWith(tarea(), 24, RESPONSABLE_ID);
    expect([...registrados]).toEqual([`${TASK_ID}:24`]);
  });

  it('caso 2: tarea que vence pasado mañana → aviso de 48 h, registrado', async () => {
    const t = tarea({ fechaLimite: PASADO_MANANA });
    const { prisma, registrados } = makePrisma(new Map([[PASADO_MANANA.getTime(), [t]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(1);
    expect(service.emitir).toHaveBeenCalledWith(t, 48, RESPONSABLE_ID);
    expect([...registrados]).toEqual([`${TASK_ID}:48`]);
  });

  it('caso 3: tarea HECHO → la consulta la excluye y no se registra ni emite nada', async () => {
    // La exclusión vive en el where (Prisma no la devuelve); el test de
    // integración la comprueba contra PostgreSQL real.
    const { prisma } = makePrisma();
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    for (const [args] of prisma.tarea.findMany.mock.calls) {
      expect(args.where).toMatchObject({ estadoTarea: { not: EstadoTarea.HECHO } });
    }
    expect(service.emitir).not.toHaveBeenCalled();
    expect(prisma.recordatorioTarea.createMany).not.toHaveBeenCalled();
  });

  it('caso 4: aviso ya registrado → no se emite un segundo', async () => {
    const { prisma, registrados } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    registrados.add(`${TASK_ID}:24`);
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.recordatorioTarea.createMany).toHaveBeenCalledWith({
      data: [{ idTarea: TASK_ID, ventanaHoras: 24 }],
      skipDuplicates: true,
    });
    expect(service.emitir).not.toHaveBeenCalled();
  });

  it('caso 4b: corridas concurrentes sobre la misma tarea → una sola emisión', async () => {
    const { prisma } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await Promise.all([service.enviarRecordatoriosDeVencimiento(), service.enviarRecordatoriosDeVencimiento()]);

    expect(service.emitir).toHaveBeenCalledTimes(1);
  });

  it('caso 5: 48 h y 24 h son independientes — la misma tarea recibe ambos, cada uno una vez', async () => {
    const t = tarea({ fechaLimite: PASADO_MANANA });
    const { prisma, registrados } = makePrisma(new Map([[PASADO_MANANA.getTime(), [t]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);

    // Día 1 (10/10): vence el 12/10 → ventana 48 h.
    await service.enviarRecordatoriosDeVencimiento();
    // Día 2 (11/10): la misma tarea cae en la ventana 24 h; la corrida repetida no agrega nada.
    vi.setSystemTime(new Date('2026-10-11T14:00:00.000Z'));
    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir.mock.calls.map(([, ventana]) => ventana)).toEqual([48, 24]);
    expect([...registrados].sort()).toEqual([`${TASK_ID}:24`, `${TASK_ID}:48`]);
  });

  it('si la emisión falla libera el registro: otra corrida el mismo día lo reintenta', async () => {
    const { prisma, registrados } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);
    service.emitir.mockRejectedValueOnce(new Error('db caída'));

    await service.enviarRecordatoriosDeVencimiento();
    expect(registrados.size).toBe(0);

    await service.enviarRecordatoriosDeVencimiento();
    expect(service.emitir).toHaveBeenCalledTimes(2);
    expect([...registrados]).toEqual([`${TASK_ID}:24`]);
  });

  it('un fallo en una tarea no aborta el resto', async () => {
    const otra = tarea({ idTarea: TASK_ID + 1, asignaciones: [{ idUsuario: RESPONSABLE_ID + 1 }] });
    const { prisma } = makePrisma(new Map([[MANANA.getTime(), [tarea(), otra]]]));
    const service = new ServicioObservado(prisma, sinNotificaciones);
    service.emitir.mockRejectedValueOnce(new Error('boom'));

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(2);
    expect(service.emitir).toHaveBeenLastCalledWith(otra, 24, RESPONSABLE_ID + 1);
  });

  it('si falla el registro de una tarea, sigue con las demás y no borra reservas ajenas', async () => {
    const otra = tarea({ idTarea: TASK_ID + 1, asignaciones: [{ idUsuario: RESPONSABLE_ID + 1 }] });
    const { prisma } = makePrisma(new Map([[MANANA.getTime(), [tarea(), otra]]]));
    prisma.recordatorioTarea.createMany.mockRejectedValueOnce(new Error('conexión perdida'));
    const service = new ServicioObservado(prisma, sinNotificaciones);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.recordatorioTarea.deleteMany).not.toHaveBeenCalled();
    expect(service.emitir).toHaveBeenCalledTimes(1);
    expect(service.emitir).toHaveBeenCalledWith(otra, 24, RESPONSABLE_ID + 1);
  });

});

/**
 * T-330 con el NotificationsService y el NotificationsGateway REALES: solo
 * Prisma (en memoria, filtrando por el `where` recibido, como
 * notifications-preferences-delivery.spec.ts) y el socket son simulados. Así
 * se prueba el filtro real de HU-185 dentro de notifyUsers, sin recrearlo.
 */
type Pref = { idUsuario: number; tipoNotificacion: TipoNotificacion; activa: boolean };
type PrefWhere = { idUsuario: { in: number[] }; tipoNotificacion: TipoNotificacion; activa: boolean };

function makeCentroDeNotificaciones(tareas: Map<number, TareaPorVencer[]>, preferencias: Pref[] = []) {
  const { prisma, registrados } = makePrisma(tareas);
  const guardadas: Prisma.NotificacionCreateManyInput[] = [];
  Object.assign(prisma, {
    notificacion: {
      createMany: vi.fn(async ({ data }: { data: Prisma.NotificacionCreateManyInput[] }) => {
        guardadas.push(...data);
        return { count: data.length };
      }),
    },
    preferenciaNotificacion: {
      findMany: vi.fn(async ({ where }: { where: PrefWhere }) =>
        preferencias
          .filter(
            (p) =>
              where.idUsuario.in.includes(p.idUsuario) &&
              p.tipoNotificacion === where.tipoNotificacion &&
              p.activa === where.activa,
          )
          .map((p) => ({ idUsuario: p.idUsuario })),
      ),
    },
  });

  const salas: string[] = [];
  const gateway = new NotificationsGateway(undefined as never);
  gateway.server = {
    to: (sala: string) => ({
      emit: (evento: string) => {
        if (evento === 'notification') salas.push(sala);
        return true;
      },
    }),
  } as unknown as NotificationsGateway['server'];

  const notifications = new NotificationsService(prisma, gateway);
  const service = new TasksDueReminderService(prisma, notifications);
  return { service, notifications, guardadas, salas, registrados };
}

const MENSAJE_24H =
  'La tarea "Diseñar el login" del proyecto "Proyecto X" vence el 11 de octubre de 2026. ' +
  'Este es tu recordatorio de 24 horas.';

describe('TAREA_POR_VENCER por el centro de notificaciones (T-330)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('el tipo existe en el enum de Prisma y tiene plantilla', () => {
    expect(TipoNotificacion.TAREA_POR_VENCER).toBe('TAREA_POR_VENCER');
    expect(NOTIFICATION_TEMPLATES.TAREA_POR_VENCER).toBeDefined();
  });

  it('la plantilla distingue 24 h y 48 h, muestra la fecha y no expone IDs internos', () => {
    const base = {
      taskTitle: 'Diseñar el login',
      projectTitle: 'Proyecto X',
      taskId: 987,
      projectId: 654,
      fechaLimiteTexto: '11 de octubre de 2026',
    };
    const plantilla = NOTIFICATION_TEMPLATES.TAREA_POR_VENCER;

    expect(plantilla.title({ ...base, horasAntes: 24 })).toBe('Tu tarea vence mañana');
    expect(plantilla.title({ ...base, horasAntes: 48 })).toBe('Tu tarea vence en 2 días');
    expect(plantilla.message({ ...base, horasAntes: 24 })).toBe(MENSAJE_24H);
    expect(plantilla.message({ ...base, horasAntes: 48 })).toContain('recordatorio de 48 horas');
    expect(plantilla.message({ ...base, horasAntes: 24 })).not.toMatch(/987|654/);
  });

  it('caso 1 → notifyUsers recibe TAREA_POR_VENCER y solo el responsable recibe fila y socket', async () => {
    const { service, notifications, guardadas, salas } = makeCentroDeNotificaciones(
      new Map([[MANANA.getTime(), [tarea()]]]),
    );
    const notifyUsers = vi.spyOn(notifications, 'notifyUsers');

    await service.enviarRecordatoriosDeVencimiento();

    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(notifyUsers).toHaveBeenCalledWith(
      [RESPONSABLE_ID],
      expect.objectContaining({ tipoNotificacion: 'TAREA_POR_VENCER' }),
      undefined,
    );
    expect(guardadas).toEqual([
      {
        idUsuario: RESPONSABLE_ID,
        tipoNotificacion: 'TAREA_POR_VENCER',
        tituloNotificacion: 'Tu tarea vence mañana',
        mensajeNotificacion: MENSAJE_24H,
        datosJson: {
          taskTitle: 'Diseñar el login',
          projectTitle: 'Proyecto X',
          taskId: TASK_ID,
          projectId: PROJECT_ID,
          horasAntes: 24,
          fechaLimiteTexto: '11 de octubre de 2026',
        },
      },
    ]);
    expect(salas).toEqual([`user:${RESPONSABLE_ID}`]);
  });

  it('caso 2 → aviso de 48 h con su título', async () => {
    const { service, guardadas } = makeCentroDeNotificaciones(
      new Map([[PASADO_MANANA.getTime(), [tarea({ fechaLimite: PASADO_MANANA })]]]),
    );

    await service.enviarRecordatoriosDeVencimiento();

    expect(guardadas.map((n) => n.tituloNotificacion)).toEqual(['Tu tarea vence en 2 días']);
  });

  it('caso 6 (HU-185): responsable con TAREA_POR_VENCER desactivado → sin fila ni socket, y no se reintenta', async () => {
    const { service, guardadas, salas, registrados } = makeCentroDeNotificaciones(
      new Map([[MANANA.getTime(), [tarea()]]]),
      [{ idUsuario: RESPONSABLE_ID, tipoNotificacion: TipoNotificacion.TAREA_POR_VENCER, activa: false }],
    );

    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    expect(guardadas).toEqual([]);
    expect(salas).toEqual([]);
    expect([...registrados]).toEqual([`${TASK_ID}:24`]);
  });

  it('caso 6 (HU-185): desactivar otro tipo no bloquea el recordatorio', async () => {
    const { service, guardadas } = makeCentroDeNotificaciones(new Map([[MANANA.getTime(), [tarea()]]]), [
      { idUsuario: RESPONSABLE_ID, tipoNotificacion: TipoNotificacion.TAREA_ASIGNADA, activa: false },
    ]);

    await service.enviarRecordatoriosDeVencimiento();

    expect(guardadas.map((n) => n.idUsuario)).toEqual([RESPONSABLE_ID]);
  });
});
