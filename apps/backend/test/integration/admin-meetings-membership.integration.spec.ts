import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { createIntegrationUser } from './setup/fixtures';
import { cleanupAdminMeetings, escenarioReuniones, notificacionesConGatewayFalso } from './setup/admin-meetings';
import { AdminMeetingsService } from '../../src/events/admin-meetings.service';
import { EventsReminderService } from '../../src/events/events-reminder.service';
import { ApplicationsService } from '../../src/applications/applications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * HU-195 (G11, T-364): nuevos integrantes de proyectos con reuniones futuras
 * (por la aceptación REAL de una postulación) y recordatorios de una reunión
 * multiproyecto con el cron REAL, sobre PostgreSQL desechable.
 */
describeIntegration('HU-195 G11 — altas posteriores y recordatorio agrupado (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  const scope = { userIds: [] as number[], projectIds: [] as number[], roleIds: [] as number[], participationIds: [] as number[] };
  let esc: Awaited<ReturnType<typeof escenarioReuniones>>;
  let reuniones: AdminMeetingsService;
  let aplicaciones: ApplicationsService;
  let notifications: ReturnType<typeof notificacionesConGatewayFalso>['notifications'];
  let emitidos: { userIds: number[]; tipo: string }[];

  const reunion = (proyectos: number[], tituloEvento: string, inicio = esc.enDias(7)) =>
    reuniones.create(esc.id('ADMIN'), {
      tituloEvento,
      fechaInicio: inicio.toISOString(),
      fechaFin: new Date(inicio.getTime() + 3_600_000).toISOString(),
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc-defg-hij',
      proyectos,
      antelacionMinutos: 60,
    });
  const persona = async (nombre: string) => {
    const u = await createIntegrationUser(prisma, { nombre, apellido: 'G11' });
    scope.userIds.push(u.idUsuario);
    return u.idUsuario;
  };
  const aceptarEnP2 = async (idUsuario: number) => {
    const postulacion = await prisma.postulacion.create({
      data: { idUsuarioPostulante: idUsuario, idRolProyecto: esc.p.P2.idRol, justificacion: 'Quiero sumarme', estadoPostulacion: 'PENDIENTE' },
    });
    return aplicaciones.updateEstado(postulacion.idPostulacion, { estadoPostulacion: 'ACEPTADA' }, esc.id('L2'));
  };
  const programadas = (idReunion: number, idUsuario: number) =>
    prisma.notificacion.findMany({ where: { idUsuario, tipoNotificacion: 'REUNION_PROGRAMADA', claveIdempotencia: { startsWith: `reunion:${idReunion}:` } } });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    esc = await escenarioReuniones(prisma, scope);
    const real = notificacionesConGatewayFalso(prisma);
    notifications = real.notifications;
    emitidos = real.emitidos;
    const db = prisma as unknown as PrismaService;
    reuniones = new AdminMeetingsService(db, notifications);
    aplicaciones = new ApplicationsService(
      db, notifications, new EventEmitter2(), new ProjectTransactionService(db),
      new ProjectPolicyService(new ProjectIdResolverService(db)), new ProjectReadPolicyService(db), undefined, reuniones,
    );
  }, 60_000);

  afterAll(async () => {
    try {
      // Las participaciones que crea la aceptación real apuntan a su postulación: se borran antes que ella.
      await prisma.participacionProyecto.deleteMany({ where: { idUsuario: { in: scope.userIds }, idPostulacion: { not: null } } });
      await prisma.postulacion.deleteMany({ where: { idUsuarioPostulante: { in: scope.userIds } } });
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('AC-21: nuevos integrantes', () => {
    it('al aceptarlo en P2 recibe su convocatoria a la reunión futura, una sola vez', async () => {
      const futura = await reunion([esc.p.P1.idProyecto, esc.p.P2.idProyecto], 'Futura G11');
      const nuevo = await persona('Nuevo');
      emitidos.length = 0;
      await aceptarEnP2(nuevo);

      const avisos = await programadas(futura.idReunion, nuevo);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ claveIdempotencia: `reunion:${futura.idReunion}:v1:programada`, datosJson: { projectId: esc.p.P2.idProyecto } });
      expect(emitidos.some((e) => e.tipo === 'REUNION_PROGRAMADA' && e.userIds.includes(nuevo))).toBe(true);
    });

    it('quien ya estaba convocado por otro proyecto de la reunión no recibe una segunda convocatoria', async () => {
      const futura = await reunion([esc.p.P1.idProyecto, esc.p.P2.idProyecto], 'Ya convocado G11');
      // M1 está en P1 (convocado); entra también a P2.
      await aceptarEnP2(esc.id('M1'));
      expect(await programadas(futura.idReunion, esc.id('M1'))).toHaveLength(1);
    });

    it('reuniones canceladas o de otros proyectos no generan convocatoria', async () => {
      const cancelada = await reunion([esc.p.P2.idProyecto], 'Cancelada G11');
      await reuniones.cancel(cancelada.idReunion, esc.id('ADMIN'));
      const ajena = await reunion([esc.p.P1.idProyecto], 'Ajena G11');
      const nuevo = await persona('Nuevo2');
      await aceptarEnP2(nuevo);
      expect(await programadas(cancelada.idReunion, nuevo)).toHaveLength(0);
      expect(await programadas(ajena.idReunion, nuevo)).toHaveLength(0);
    });

    it('si la aceptación revierte, no queda participación ni convocatoria', async () => {
      const futura = await reunion([esc.p.P2.idProyecto], 'Rollback G11');
      const nuevo = await persona('Nuevo3');
      const original = notifications.persistUsersTx.bind(notifications);
      const espia = vi.spyOn(notifications, 'persistUsersTx').mockImplementation(async (...args) => {
        if (args[2].tipoNotificacion === 'POSTULACION_RESUELTA') throw new Error('falla forzada al resolver');
        return original(...args);
      });
      try {
        await expect(aceptarEnP2(nuevo)).rejects.toThrow('falla forzada al resolver');
      } finally {
        espia.mockRestore();
      }
      expect(await programadas(futura.idReunion, nuevo)).toHaveLength(0);
      expect(await prisma.participacionProyecto.count({ where: { idUsuario: nuevo, estadoParticipacion: 'ACTIVO' } })).toBe(0);
    });
  });

  describe('AC-22: recordatorio de una reunión con tres proyectos', () => {
    it('cada integrante recibe UN recordatorio aunque esté en dos proyectos y el cron corra dos veces a la vez', async () => {
      const pronto = await reunion([esc.p.P1.idProyecto, esc.p.P2.idProyecto, esc.p.PC.idProyecto], 'Recordatorio G11', new Date(Date.now() + 30 * 60_000));
      const cron = new EventsReminderService(prisma as unknown as PrismaService, notifications);
      emitidos.length = 0;

      await Promise.all([cron.enviarRecordatoriosPendientes(), cron.enviarRecordatoriosPendientes()]);

      const filas = await prisma.notificacion.findMany({
        where: { tipoNotificacion: 'RECORDATORIO_EVENTO', claveIdempotencia: { startsWith: `reunion:${pronto.idReunion}:recordatorio:` } },
        select: { idUsuario: true },
      });
      const ids = filas.map((f) => f.idUsuario);
      expect(ids).toEqual([...new Set(ids)]);
      for (const quien of ['L1', 'M1', 'COMUN', 'L2', 'M2', 'LC', 'H1'] as const) expect(ids, quien).toContain(esc.id(quien));
      for (const quien of ['RET', 'INACT', 'HRET'] as const) expect(ids, quien).not.toContain(esc.id(quien));
      const recordados = emitidos.filter((e) => e.tipo === 'RECORDATORIO_EVENTO').flatMap((e) => e.userIds);
      expect(recordados.filter((id) => id === esc.id('COMUN'))).toHaveLength(1);
      expect((await prisma.eventoProyecto.findMany({ where: { idReunion: pronto.idReunion } })).every((p) => p.recordatorioEnviadoEn !== null)).toBe(true);
    });
  });
});
