import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Tarea 33: NotificationsService.notifyRoleMembers — destinatarios son
 * exclusivamente los miembros con participación ACTIVA en un rol concreto
 * de un proyecto concreto, excluyendo al actor y deduplicados por
 * idUsuario, delegando una única vez en notifyUsers (sin duplicar
 * persistencia ni emisión por gateway).
 */
function makePrisma() {
  return {
    notificacion: { createMany: vi.fn() },
    participacionProyecto: { findMany: vi.fn() },
  } as any;
}

const PROJECT_A = 1;
const PROJECT_B = 2;
const ROLE_A1 = 10;
const ROLE_A2 = 20;
const ROLE_B1 = 30;
const ACTOR_ID = 99;

const INPUT = { tipoNotificacion: 'PROYECTO_ACTUALIZADO' as any, tituloNotificacion: 'x' };

describe('NotificationsService.notifyRoleMembers — consulta (Tarea 33)', () => {
  it('consulta exactamente estadoParticipacion: ACTIVO y rolProyecto: { idRolProyecto, idProyecto, proyecto: { eliminadoEn: null } }, con select mínimo', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith({
      where: {
        estadoParticipacion: 'ACTIVO',
        rolProyecto: {
          idRolProyecto: ROLE_A1,
          idProyecto: PROJECT_A,
          proyecto: { eliminadoEn: null },
        },
      },
      select: { idUsuario: true },
    });
  });

  it('realiza una sola consulta de participaciones', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.notifyRoleMembers — destinatarios (Tarea 33)', () => {
  it('un miembro activo recibe notificación', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ idUsuario: 1 })],
      skipDuplicates: false,
    });
  });

  it('varios miembros activos reciben notificación', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { idUsuario: 1 },
      { idUsuario: 2 },
      { idUsuario: 3 },
    ]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(new Set(idsNotificados)).toEqual(new Set([1, 2, 3]));
  });

  it('la consulta ya filtra participaciones inactivas, miembros de otro rol y de otro proyecto (responsabilidad del where, no del helper)', async () => {
    // El fake de Prisma simula el resultado YA filtrado por el `where` real
    // (estadoParticipacion: ACTIVO + rolProyecto.idRolProyecto/idProyecto):
    // este test documenta que notifyRoleMembers no vuelve a filtrar en
    // memoria por esos criterios (ver el test de "consulta" para el where
    // exacto enviado a Prisma).
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(idsNotificados).toEqual([1]);
  });

  it('el actor queda excluido aunque tenga participación activa en el rol', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: ACTOR_ID }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(idsNotificados).not.toContain(ACTOR_ID);
    expect(idsNotificados).toEqual([1]);
  });

  it('el actor como único miembro produce cero notificaciones (sin llamar notificacion.createMany)', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: ACTOR_ID }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('lista sin miembros produce cero notificaciones', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma);

    await expect(service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT)).resolves.toBeUndefined();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.notifyRoleMembers — deduplicación (Tarea 33)', () => {
  it('el mismo idUsuario repetido en los resultados simulados genera una sola notificación', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { idUsuario: 1 },
      { idUsuario: 1 },
      { idUsuario: 2 },
    ]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(idsNotificados.filter((id: number) => id === 1)).toHaveLength(1);
  });

  it('el actor repetido nunca aparece en el resultado final', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([
      { idUsuario: ACTOR_ID },
      { idUsuario: ACTOR_ID },
      { idUsuario: 1 },
    ]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(idsNotificados).toEqual([1]);
  });
});

describe('NotificationsService.notifyRoleMembers — delegación en notifyUsers (Tarea 33)', () => {
  it('notificacion.createMany (usado por notifyUsers) se llama exactamente una vez', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.notificacion.createMany).toHaveBeenCalledTimes(1);
  });

  it('recibe el mismo objeto input (tipoNotificacion/tituloNotificacion/mensajeNotificacion/datosJson) sin transformarlo', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);
    const input = {
      tipoNotificacion: 'PROYECTO_ACTUALIZADO' as any,
      tituloNotificacion: 'Título real',
      mensajeNotificacion: 'Mensaje real',
      datosJson: { projectId: PROJECT_A, roleId: ROLE_A1 },
    };

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, input);

    expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
      data: [
        {
          idUsuario: 1,
          tipoNotificacion: input.tipoNotificacion,
          tituloNotificacion: input.tituloNotificacion,
          mensajeNotificacion: input.mensajeNotificacion,
          datosJson: input.datosJson,
        },
      ],
      skipDuplicates: false,
    });
  });

  it('no se persisten notificaciones fuera de la llamada a notificacion.createMany (sin escrituras adicionales)', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect((prisma.notificacion as any).create).toBeUndefined();
    expect((prisma.notificacion as any).update).toBeUndefined();
  });

  it('no llama directamente al gateway (sin gateway inyectado, notifyUsers no intenta emitir)', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    // Instanciado sin segundo argumento (gateway): si el helper intentara
    // llamar al gateway directamente en vez de delegar en notifyUsers,
    // fallaría aquí con un TypeError sobre `undefined`.
    const service = new NotificationsService(prisma);

    await expect(
      service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT),
    ).resolves.toBeUndefined();
  });

  it('emite por el gateway correcto cuando hay un gateway con server activo (mismo mecanismo que notifyUsers)', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }, { idUsuario: 2 }]);
    const gateway = { server: {}, notifyUsers: vi.fn().mockResolvedValue(undefined) } as any;
    const service = new NotificationsService(prisma, gateway);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    expect(gateway.notifyUsers).toHaveBeenCalledTimes(1);
    const [idsEmitidos] = gateway.notifyUsers.mock.calls[0];
    expect(new Set(idsEmitidos)).toEqual(new Set([1, 2]));
  });
});

describe('NotificationsService.notifyRoleMembers — errores (Tarea 33)', () => {
  it('un fallo de participacionProyecto.findMany se propaga sin convertirse en 400/403/404/409', async () => {
    const prisma = makePrisma();
    const errorConsulta = new Error('fallo de conexión simulado');
    prisma.participacionProyecto.findMany.mockRejectedValue(errorConsulta);
    const service = new NotificationsService(prisma);

    await expect(service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT)).rejects.toBe(errorConsulta);
  });

  it('si la consulta falla, notificacion.createMany nunca se llama', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockRejectedValue(new Error('fallo'));
    const service = new NotificationsService(prisma);

    await expect(service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT)).rejects.toThrow();
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('un fallo de notifyUsers (createMany) se propaga sin capturarse, sin reintento', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 1 }]);
    const errorEscritura = new Error('fallo al persistir notificación');
    prisma.notificacion.createMany.mockRejectedValue(errorEscritura);
    const service = new NotificationsService(prisma);

    await expect(service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT)).rejects.toBe(errorEscritura);
    expect(prisma.notificacion.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsService.notifyRoleMembers — dataset amplio y aislamiento (Tarea 33)', () => {
  it('con miembros de A1 (activos e inactivos), A2, B1, duplicados y actor duplicado: notifyUsers recibe exclusivamente los activos de A1 sin actor ni duplicados', async () => {
    const prisma = makePrisma();
    const miembrosActivosA1 = [101, 102, 103, 104, 105];
    // El fake de Prisma ya representa el resultado de la consulta real
    // (estadoParticipacion: ACTIVO + rolProyecto.idRolProyecto: A1 +
    // idProyecto: A): los inactivos de A1, los de A2 y los de B1 nunca
    // aparecen en este array, exactamente como el `where` real los
    // excluiría. Se agregan un ID duplicado y el actor duplicado para
    // ejercer la deduplicación explícita del helper.
    prisma.participacionProyecto.findMany.mockResolvedValue([
      ...miembrosActivosA1.map((idUsuario) => ({ idUsuario })),
      { idUsuario: miembrosActivosA1[0] }, // duplicado
      { idUsuario: ACTOR_ID },
      { idUsuario: ACTOR_ID }, // actor duplicado
    ]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A1, ACTOR_ID, INPUT);

    const idsNotificados = prisma.notificacion.createMany.mock.calls[0][0].data.map((d: any) => d.idUsuario);
    expect(new Set(idsNotificados)).toEqual(new Set(miembrosActivosA1));
    expect(idsNotificados).toHaveLength(miembrosActivosA1.length);
    expect(idsNotificados).not.toContain(ACTOR_ID);
  });

  it('rol A1 bajo projectId = B no notifica a los miembros reales de A1 (aislamiento por proyecto simulado vía where)', async () => {
    const prisma = makePrisma();
    // El `where` real filtra por rolProyecto.idProyecto === PROJECT_B, así
    // que una consulta de "rol A1 bajo Proyecto B" no puede devolver a los
    // miembros reales de A1 (que pertenecen a rolProyecto.idProyecto === A).
    prisma.participacionProyecto.findMany.mockResolvedValue([]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_B, ROLE_A1, ACTOR_ID, INPUT);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rolProyecto: expect.objectContaining({ idRolProyecto: ROLE_A1, idProyecto: PROJECT_B }),
        }),
      }),
    );
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  it('no mezcla roleId de A2/B1: cada llamada usa exactamente el roleId y projectId recibidos', async () => {
    const prisma = makePrisma();
    prisma.participacionProyecto.findMany.mockResolvedValue([{ idUsuario: 201 }]);
    const service = new NotificationsService(prisma);

    await service.notifyRoleMembers(PROJECT_A, ROLE_A2, ACTOR_ID, INPUT);

    expect(prisma.participacionProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rolProyecto: expect.objectContaining({ idRolProyecto: ROLE_A2, idProyecto: PROJECT_A }),
        }),
      }),
    );
    void ROLE_B1;
  });
});
