import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { cleanupAdminMeetings, escenarioReuniones, notificacionesConGatewayFalso } from './setup/admin-meetings';
import { AdminMeetingsService } from '../../src/events/admin-meetings.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * HU-195 (G10, T-364): garantías de entrega de los avisos de reunión sobre
 * PostgreSQL real: el socket es posterior y prescindible, las preferencias
 * mandan en los tres tipos, la clave de idempotencia aguanta reintentos
 * concurrentes y cada aviso nombra solo el proyecto propio del destinatario.
 */
describeIntegration('HU-195 G10 — avisos de reunión: entrega, preferencias e idempotencia (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  const scope = { userIds: [] as number[], projectIds: [] as number[], roleIds: [] as number[], participationIds: [] as number[] };
  let esc: Awaited<ReturnType<typeof escenarioReuniones>>;

  const dto = (proyectos: number[], tituloEvento: string) => ({
    tituloEvento,
    fechaInicio: esc.enDias(6).toISOString(),
    fechaFin: esc.enDias(6, 16).toISOString(),
    modalidad: 'VIRTUAL' as const,
    linkSesion: 'https://meet.google.com/abc-defg-hij',
    proyectos,
  });
  const avisosDe = (idReunion: number) =>
    prisma.notificacion.findMany({ where: { claveIdempotencia: { startsWith: `reunion:${idReunion}:` } }, select: { idUsuario: true, tipoNotificacion: true, datosJson: true } });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    esc = await escenarioReuniones(prisma, scope);
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('AC-27: si el socket falla después del commit, la reunión y los avisos quedan guardados y se leen después', async () => {
    const gatewayRoto = { server: {}, notifyUsers: async () => { throw new Error('socket caído'); } } as unknown as NotificationsGateway;
    const service = new AdminMeetingsService(prisma as unknown as PrismaService, new NotificationsService(prisma as unknown as PrismaService, gatewayRoto));

    const creada = await service.create(esc.id('ADMIN'), dto([esc.p.P2.idProyecto], 'Socket caído'));
    expect(creada.estado).toBe('ACTIVA');
    expect((await avisosDe(creada.idReunion)).map((a) => a.idUsuario).sort((a, b) => a - b)).toEqual([esc.id('COMUN'), esc.id('L2'), esc.id('M2')].sort((a, b) => a - b));
  });

  it('las preferencias se respetan en ACTUALIZADA y CANCELADA, no solo en PROGRAMADA', async () => {
    const { notifications } = notificacionesConGatewayFalso(prisma);
    const service = new AdminMeetingsService(prisma as unknown as PrismaService, notifications);
    await prisma.preferenciaNotificacion.createMany({
      data: [
        { idUsuario: esc.id('M2'), tipoNotificacion: 'REUNION_ACTUALIZADA', activa: false },
        { idUsuario: esc.id('L2'), tipoNotificacion: 'REUNION_CANCELADA', activa: false },
      ],
    });
    try {
      const creada = await service.create(esc.id('ADMIN'), dto([esc.p.P2.idProyecto], 'Preferencias'));
      await service.update(creada.idReunion, esc.id('ADMIN'), { version: 1, tituloEvento: 'Preferencias 2' });
      await service.cancel(creada.idReunion, esc.id('ADMIN'));
      const avisos = await avisosDe(creada.idReunion);
      const de = (usuario: string) => avisos.filter((a) => a.idUsuario === esc.id(usuario as never)).map((a) => a.tipoNotificacion).sort();
      expect(de('M2')).toEqual(['REUNION_CANCELADA', 'REUNION_PROGRAMADA']);
      expect(de('L2')).toEqual(['REUNION_ACTUALIZADA', 'REUNION_PROGRAMADA']);
      expect(de('COMUN')).toEqual(['REUNION_ACTUALIZADA', 'REUNION_CANCELADA', 'REUNION_PROGRAMADA']);
    } finally {
      await prisma.preferenciaNotificacion.deleteMany({ where: { idUsuario: { in: [esc.id('M2'), esc.id('L2')] } } });
    }
  });

  it('reintentos concurrentes de la misma operación lógica (misma clave) persisten un solo aviso por persona', async () => {
    const { notifications, emitidos } = notificacionesConGatewayFalso(prisma);
    const clave = `reunion:${2_000_000_000}:v1:programada`;
    const datos = { meetingId: 2_000_000_000, eventId: 1, projectId: esc.p.P2.idProyecto, projectTitle: 'P2', eventTitle: 'Reintento', fechaInicioTexto: 'x', fechaInicioIso: 'x' };
    const enviar = () => prisma.$transaction(async (tx) => {
      const efectos: { publish: () => unknown }[] = [];
      await notifications.persistTemplateTx(tx, [esc.id('M2'), esc.id('L2')], 'REUNION_PROGRAMADA', datos, { add: (e) => efectos.push(e) }, { claveIdempotencia: clave });
      return efectos;
    });
    const [a, b] = await Promise.all([enviar(), enviar()]);
    await notifications.publishEffects([...a, ...b] as never);
    const filas = await prisma.notificacion.findMany({ where: { claveIdempotencia: clave } });
    expect(filas.map((f) => f.idUsuario).sort((x, y) => x - y)).toEqual([esc.id('L2'), esc.id('M2')].sort((x, y) => x - y));
    // Tampoco se emite dos veces: solo se publica a quien de verdad se insertó.
    expect(emitidos.flatMap((e) => e.userIds).sort((x, y) => x - y)).toEqual([esc.id('L2'), esc.id('M2')].sort((x, y) => x - y));
  });

  it('AC-28: cada aviso nombra y enlaza solo un proyecto del propio destinatario', async () => {
    const { notifications } = notificacionesConGatewayFalso(prisma);
    const service = new AdminMeetingsService(prisma as unknown as PrismaService, notifications);
    const creada = await service.create(esc.id('ADMIN'), dto([esc.p.P1.idProyecto, esc.p.P2.idProyecto], 'Privacidad'));
    const propios: Record<number, number[]> = {
      [esc.id('L1')]: [esc.p.P1.idProyecto], [esc.id('M1')]: [esc.p.P1.idProyecto],
      [esc.id('L2')]: [esc.p.P2.idProyecto], [esc.id('M2')]: [esc.p.P2.idProyecto],
      [esc.id('COMUN')]: [esc.p.P1.idProyecto, esc.p.P2.idProyecto],
    };
    const titulos = new Map([[esc.p.P1.idProyecto, esc.p.P1.tituloProyecto], [esc.p.P2.idProyecto, esc.p.P2.tituloProyecto]]);
    for (const aviso of await avisosDe(creada.idReunion)) {
      const datos = aviso.datosJson as { projectId: number; projectTitle: string };
      expect(propios[aviso.idUsuario]).toContain(datos.projectId);
      expect(datos.projectTitle).toBe(titulos.get(datos.projectId));
      expect(JSON.stringify(datos)).not.toMatch(/proyectos|participantes|correo/);
    }
  });
});
