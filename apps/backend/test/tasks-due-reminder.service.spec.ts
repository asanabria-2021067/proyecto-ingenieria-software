import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EstadoTarea } from '@prisma/client';
import {
  TasksDueReminderService,
  fechaLimiteParaVentana,
  type TareaPorVencer,
  type VentanaRecordatorio,
} from '../src/tasks/tasks-due-reminder.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
    const service = new ServicioObservado(prisma);

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
    const service = new ServicioObservado(prisma);

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
    const service = new ServicioObservado(prisma);

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(1);
    expect(service.emitir).toHaveBeenCalledWith(tarea(), 24, RESPONSABLE_ID);
    expect([...registrados]).toEqual([`${TASK_ID}:24`]);
  });

  it('caso 2: tarea que vence pasado mañana → aviso de 48 h, registrado', async () => {
    const t = tarea({ fechaLimite: PASADO_MANANA });
    const { prisma, registrados } = makePrisma(new Map([[PASADO_MANANA.getTime(), [t]]]));
    const service = new ServicioObservado(prisma);

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(1);
    expect(service.emitir).toHaveBeenCalledWith(t, 48, RESPONSABLE_ID);
    expect([...registrados]).toEqual([`${TASK_ID}:48`]);
  });

  it('caso 3: tarea HECHO → la consulta la excluye y no se registra ni emite nada', async () => {
    // La exclusión vive en el where (Prisma no la devuelve); el test de
    // integración la comprueba contra PostgreSQL real.
    const { prisma } = makePrisma();
    const service = new ServicioObservado(prisma);

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
    const service = new ServicioObservado(prisma);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.recordatorioTarea.createMany).toHaveBeenCalledWith({
      data: [{ idTarea: TASK_ID, ventanaHoras: 24 }],
      skipDuplicates: true,
    });
    expect(service.emitir).not.toHaveBeenCalled();
  });

  it('caso 4b: corridas concurrentes sobre la misma tarea → una sola emisión', async () => {
    const { prisma } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new ServicioObservado(prisma);

    await Promise.all([service.enviarRecordatoriosDeVencimiento(), service.enviarRecordatoriosDeVencimiento()]);

    expect(service.emitir).toHaveBeenCalledTimes(1);
  });

  it('caso 5: 48 h y 24 h son independientes — la misma tarea recibe ambos, cada uno una vez', async () => {
    const t = tarea({ fechaLimite: PASADO_MANANA });
    const { prisma, registrados } = makePrisma(new Map([[PASADO_MANANA.getTime(), [t]]]));
    const service = new ServicioObservado(prisma);

    // Día 1 (10/10): vence el 12/10 → ventana 48 h.
    await service.enviarRecordatoriosDeVencimiento();
    // Día 2 (11/10): la misma tarea cae en la ventana 24 h; la corrida repetida no agrega nada.
    vi.setSystemTime(new Date('2026-10-11T14:00:00.000Z'));
    await service.enviarRecordatoriosDeVencimiento();
    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir.mock.calls.map(([, ventana]) => ventana)).toEqual([48, 24]);
    expect([...registrados].sort()).toEqual([`${TASK_ID}:24`, `${TASK_ID}:48`]);
  });

  it('si la emisión falla libera el registro para reintentar en la siguiente corrida', async () => {
    const { prisma, registrados } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new ServicioObservado(prisma);
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
    const service = new ServicioObservado(prisma);
    service.emitir.mockRejectedValueOnce(new Error('boom'));

    await service.enviarRecordatoriosDeVencimiento();

    expect(service.emitir).toHaveBeenCalledTimes(2);
    expect(service.emitir).toHaveBeenLastCalledWith(otra, 24, RESPONSABLE_ID + 1);
  });

  it('sin T-330 todavía, el servicio real no deja ningún aviso marcado como enviado', async () => {
    const { prisma, registrados } = makePrisma(new Map([[MANANA.getTime(), [tarea()]]]));
    const service = new TasksDueReminderService(prisma);

    await service.enviarRecordatoriosDeVencimiento();

    expect(prisma.recordatorioTarea.createMany).toHaveBeenCalledTimes(1);
    expect(registrados.size).toBe(0);
  });
});
