import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { cleanupAdminMeetings, escenarioReuniones, notificacionesConGatewayFalso } from './setup/admin-meetings';
import { AdminMeetingsService } from '../../src/events/admin-meetings.service';
import { EventsService } from '../../src/events/events.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * HU-195 (G09, T-360/T-364): las reuniones de Administración en el calendario
 * de cada integrante, sobre PostgreSQL real. La lectura es la de
 * GET /usuarios/me/eventos (EventsService.findForUserInRange).
 */
describeIntegration('HU-195 G09 — reuniones en el calendario del equipo (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let reuniones: AdminMeetingsService;
  let eventos: EventsService;
  const scope = { userIds: [] as number[], projectIds: [] as number[], roleIds: [] as number[], participationIds: [] as number[] };
  let esc: Awaited<ReturnType<typeof escenarioReuniones>>;
  let rango: [string, string];

  const crear = (proyectos: number[], titulo: string) =>
    reuniones.create(esc.id('ADMIN'), {
      tituloEvento: titulo,
      fechaInicio: esc.enDias(5).toISOString(),
      fechaFin: esc.enDias(5, 16).toISOString(),
      modalidad: 'VIRTUAL',
      linkSesion: 'https://meet.google.com/abc-defg-hij',
      proyectos,
    });
  const titulos = async (usuario: number) => (await eventos.findForUserInRange(usuario, ...rango)).map((e) => e.tituloEvento);

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    esc = await escenarioReuniones(prisma, scope);
    reuniones = new AdminMeetingsService(prisma as unknown as PrismaService, notificacionesConGatewayFalso(prisma).notifications);
    eventos = new EventsService(prisma as unknown as PrismaService);
    rango = [esc.enDias(0, 0).toISOString(), esc.enDias(10).toISOString()];
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('el integrante activo y el líder ven la reunión con origen ADMINISTRACION; quien está en dos proyectos, una sola vez', async () => {
    const creada = await crear([esc.p.P1.idProyecto, esc.p.P2.idProyecto], 'Calendario doble');
    for (const quien of ['M1', 'L1', 'M2', 'L2'] as const) expect(await titulos(esc.id(quien)), quien).toContain('Calendario doble');

    const delComun = (await eventos.findForUserInRange(esc.id('COMUN'), ...rango)).filter((e) => e.idReunion === creada.idReunion);
    expect(delComun).toHaveLength(1);
    expect(delComun[0]).toMatchObject({ origen: 'ADMINISTRACION', idProyecto: Math.min(esc.p.P1.idProyecto, esc.p.P2.idProyecto) });
  });

  it('RETIRADO, cuenta INACTIVO y ajenos no la ven', async () => {
    await crear([esc.p.P1.idProyecto], 'Calendario P1');
    expect(await titulos(esc.id('RET'))).not.toContain('Calendario P1');
    expect(await titulos(esc.id('ESTUDIANTE'))).not.toContain('Calendario P1');
    // El administrador que la creó no es integrante: no aparece en su calendario personal.
    expect(await titulos(esc.id('ADMIN'))).not.toContain('Calendario P1');
  });

  it('AC-09: el equipo histórico (COMPLETADO) de un CERRADO ve la reunión, pero no los eventos ordinarios del proyecto cerrado', async () => {
    await crear([esc.p.PC.idProyecto], 'Calendario cierre');
    await prisma.eventoProyecto.create({
      data: { idProyecto: esc.p.PC.idProyecto, idCreador: esc.id('LC'), tituloEvento: 'Evento ordinario cerrado', fechaInicio: esc.enDias(5), fechaFin: esc.enDias(5, 16) },
    });

    expect(await titulos(esc.id('H1'))).toContain('Calendario cierre');
    expect(await titulos(esc.id('H1'))).not.toContain('Evento ordinario cerrado');
    expect(await titulos(esc.id('HRET'))).not.toContain('Calendario cierre');
    // El líder del cerrado lo sigue viendo todo, como antes.
    expect(await titulos(esc.id('LC'))).toEqual(expect.arrayContaining(['Calendario cierre', 'Evento ordinario cerrado']));
  });

  it('cancelada, desaparece de todos los calendarios (también del equipo histórico)', async () => {
    const activa = await crear([esc.p.P2.idProyecto, esc.p.PC.idProyecto], 'Calendario a cancelar');
    await reuniones.cancel(activa.idReunion, esc.id('ADMIN'));
    for (const quien of ['M2', 'L2', 'H1', 'LC'] as const) expect(await titulos(esc.id(quien)), quien).not.toContain('Calendario a cancelar');
  });

  it('un evento ordinario lleva origen PROYECTO e idReunion null', async () => {
    const creado = await eventos.create(esc.p.P2.idProyecto, esc.id('L2'), {
      tituloEvento: 'Ordinario P2',
      fechaInicio: esc.enDias(4).toISOString(),
      fechaFin: esc.enDias(4, 16).toISOString(),
    });
    expect(creado).toMatchObject({ origen: 'PROYECTO', idReunion: null });
    const visto = (await eventos.findForUserInRange(esc.id('M2'), ...rango)).find((e) => e.idEvento === creado.idEvento);
    expect(visto).toMatchObject({ origen: 'PROYECTO', idReunion: null });
  });
});
