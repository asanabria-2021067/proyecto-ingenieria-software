import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { cleanupAdminMeetings, escenarioReuniones, notificacionesConGatewayFalso } from './setup/admin-meetings';
import { AdminMeetingsService } from '../../src/events/admin-meetings.service';
import type { CreateAdminMeetingDto } from '../../src/events/dto/create-admin-meeting.dto';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * HU-195 (G05–G07, T-362/T-364/T-365): AdminMeetingsService REAL contra
 * PostgreSQL desechable. Solo el socket es falso: registra qué se emitió, para
 * comprobar que nada sale antes del commit ni tras un rollback.
 */
describeIntegration('HU-195 — servicio de reuniones de Administración (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let service: AdminMeetingsService;
  let emitidos: { userIds: number[]; tipo: string }[];
  const scope = { userIds: [] as number[], projectIds: [] as number[], roleIds: [] as number[], participationIds: [] as number[] };
  let esc: Awaited<ReturnType<typeof escenarioReuniones>>;

  const dto = (proyectos: number[], extra: Partial<CreateAdminMeetingDto> = {}): CreateAdminMeetingDto => ({
    tituloEvento: 'Seguimiento HU-195',
    fechaInicio: esc.enDias(5).toISOString(),
    fechaFin: esc.enDias(5, 16).toISOString(),
    modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/abc-defg-hij',
    proyectos,
    ...extra,
  });
  const avisos = (idReunion: number, tipo = 'REUNION_PROGRAMADA') =>
    prisma.notificacion.findMany({
      where: { tipoNotificacion: tipo as never, claveIdempotencia: { startsWith: `reunion:${idReunion}:` } },
      select: { idUsuario: true, datosJson: true, claveIdempotencia: true },
      orderBy: { idUsuario: 'asc' },
    });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    esc = await escenarioReuniones(prisma, scope);
  }, 60_000);

  beforeEach(() => {
    const real = notificacionesConGatewayFalso(prisma);
    emitidos = real.emitidos;
    service = new AdminMeetingsService(prisma as unknown as PrismaService, real.notifications);
  });

  afterAll(async () => {
    try {
      await cleanupAdminMeetings(prisma, scope);
      await cleanupIntegrationFixtures(prisma, scope);
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('G05 · crear', () => {
    it('AC-01: dos proyectos → 1 padre + 2 proyecciones idénticas de tipo REUNION, para todo el proyecto', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));

      expect(creada).toMatchObject({ version: 1, estado: 'ACTIVA', integridad: 'OK', canManage: true, motivoGestion: 'POLITICA', politicaEdicion: 'TODOS_ADMINISTRADORES', editores: [] });
      expect(creada.proyectos.map((x) => x.idProyecto)).toEqual([p.P1.idProyecto, p.P2.idProyecto].sort((a, b) => a - b));
      const filas = await prisma.eventoProyecto.findMany({ where: { idReunion: creada.idReunion }, orderBy: { idProyecto: 'asc' } });
      expect(filas).toHaveLength(2);
      for (const fila of filas) {
        expect(fila).toMatchObject({ tipoEvento: 'REUNION', invitados: [], rolesDestino: [], idCreador: id('ADMIN'), eliminadoEn: null, tituloEvento: 'Seguimiento HU-195', linkSesion: 'https://meet.google.com/abc-defg-hij' });
      }
      expect(filas[0].fechaInicio).toEqual(filas[1].fechaInicio);
    });

    it('AC-06/AC-07/AC-08: equipo completo y deduplicado; líder sin participación incluido; retirado e inactivo fuera', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      const filas = await avisos(creada.idReunion);

      expect(filas.map((f) => f.idUsuario)).toEqual([id('L1'), id('M1'), id('COMUN'), id('L2'), id('M2')].sort((a, b) => a - b));
      expect(new Set(filas.map((f) => f.claveIdempotencia))).toEqual(new Set([`reunion:${creada.idReunion}:v1:programada`]));
      // COMUN está en P1 y P2: un solo aviso, enlazado a una sola proyección y nombrando un solo proyecto.
      const comun = filas.filter((f) => f.idUsuario === id('COMUN'));
      expect(comun).toHaveLength(1);
      expect(comun[0].datosJson).toMatchObject({ meetingId: creada.idReunion, projectId: Math.min(p.P1.idProyecto, p.P2.idProyecto) });
      // Socket después del commit, una vez por destinatario.
      expect(emitidos.flatMap((e) => e.userIds).sort((a, b) => a - b)).toEqual(filas.map((f) => f.idUsuario));
      expect(emitidos.every((e) => e.tipo === 'REUNION_PROGRAMADA')).toBe(true);
    });

    it('AC-02 y AC-03: un solo proyecto EN_PROGRESO; un CERRADO en ventana convoca al equipo histórico (COMPLETADO) y al líder', async () => {
      const { id, p } = esc;
      const unica = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      expect((await avisos(unica.idReunion)).map((f) => f.idUsuario)).toEqual([id('COMUN'), id('L2'), id('M2')].sort((a, b) => a - b));

      const cerrada = await service.create(id('ADMIN'), dto([p.PC.idProyecto]));
      expect((await avisos(cerrada.idReunion)).map((f) => f.idUsuario)).toEqual([id('LC'), id('H1')].sort((a, b) => a - b));
    });

    it('AC-04/AC-05: vencido, sin fecha oficial, cancelado o inexistente → 400 con motivo por proyecto y nada escrito', async () => {
      const { id, p } = esc;
      const antes = await prisma.reunionAdministracion.count();
      const error = await service
        .create(id('ADMIN'), dto([p.P1.idProyecto, p.PVENC.idProyecto, p.PSIN.idProyecto, p.PCANC.idProyecto, 2_000_000_000]))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        proyectos: [
          { idProyecto: p.PVENC.idProyecto, motivo: 'FUERA_DE_VENTANA_POSCIERRE' },
          { idProyecto: p.PSIN.idProyecto, motivo: 'SIN_FECHA_OFICIAL_CIERRE' },
          { idProyecto: p.PCANC.idProyecto, motivo: 'ESTADO_NO_ELEGIBLE' },
          { idProyecto: 2_000_000_000, motivo: 'PROYECTO_INEXISTENTE' },
        ],
      });
      expect(await prisma.reunionAdministracion.count()).toBe(antes);
      expect(emitidos).toEqual([]);
    });

    it('AC-03B: con un proyecto CERRADO, una reunión que termina después de su ventana es 400', async () => {
      const { id, p } = esc;
      // Cierre hace 10 días: la ventana acaba en ~50 días.
      await expect(service.create(id('ADMIN'), dto([p.PC.idProyecto], { fechaInicio: esc.enDias(49).toISOString(), fechaFin: esc.enDias(60).toISOString() })))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('AC-18: un fallo dentro de la transacción revierte padre, proyecciones y avisos, y no emite nada', async () => {
      const { id, p } = esc;
      const antes = { reuniones: await prisma.reunionAdministracion.count(), avisos: await prisma.notificacion.count({ where: { idUsuario: id('M2') } }) };
      vi.spyOn(service as unknown as { auditar: () => Promise<void> }, 'auditar').mockRejectedValueOnce(new Error('falla forzada antes del commit'));

      await expect(service.create(id('ADMIN'), dto([p.P2.idProyecto]))).rejects.toThrow('falla forzada antes del commit');
      expect(await prisma.reunionAdministracion.count()).toBe(antes.reuniones);
      expect(await prisma.notificacion.count({ where: { idUsuario: id('M2') } })).toBe(antes.avisos);
      expect(emitidos).toEqual([]);
    });

    it('fechas: fin antes que inicio o inicio en el pasado → 400', async () => {
      const { id, p } = esc;
      await expect(service.create(id('ADMIN'), dto([p.P1.idProyecto], { fechaFin: esc.enDias(5, 14).toISOString() }))).rejects.toThrow('posterior');
      await expect(service.create(id('ADMIN'), dto([p.P1.idProyecto], { fechaInicio: esc.enDias(-1).toISOString(), fechaFin: esc.enDias(-1, 16).toISOString() }))).rejects.toThrow('anterior al momento actual');
    });

    it('editores: solo con ADMINISTRADORES_SELECCIONADOS y solo administradores activos', async () => {
      const { id, p } = esc;
      await expect(service.create(id('ADMIN'), dto([p.P1.idProyecto], { editores: [id('ADMIN2')] }))).rejects.toThrow('ADMINISTRADORES_SELECCIONADOS');
      await expect(service.create(id('ADMIN'), dto([p.P1.idProyecto], { politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [id('ESTUDIANTE')] }))).rejects.toBeInstanceOf(BadRequestException);

      const ok = await service.create(id('ADMIN'), dto([p.P1.idProyecto], { politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [id('ADMIN2'), id('ADMIN')] }));
      // El creador ya gestiona: no se guarda como editor.
      expect(ok.editores.map((e) => e.idUsuario)).toEqual([id('ADMIN2')]);
      expect(ok.editores[0]).not.toHaveProperty('correo');
    });

    it('respeta preferencias: quien desactivó REUNION_PROGRAMADA no la recibe', async () => {
      const { id, p } = esc;
      await prisma.preferenciaNotificacion.create({ data: { idUsuario: id('M2'), tipoNotificacion: 'REUNION_PROGRAMADA', activa: false } });
      try {
        const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
        expect((await avisos(creada.idReunion)).map((f) => f.idUsuario)).not.toContain(id('M2'));
      } finally {
        await prisma.preferenciaNotificacion.deleteMany({ where: { idUsuario: id('M2') } });
      }
    });

    it('deja la creación en la bitácora con proyectos, política y motivo', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      const registro = await prisma.bitacoraAuditoria.findFirst({ where: { tipoObjeto: 'REUNION_ADMINISTRACION', idObjeto: String(creada.idReunion) } });
      expect(registro).toMatchObject({ idUsuario: id('ADMIN'), accion: 'REUNION_ADMIN_CREADA', detalleJson: { proyectos: [p.P2.idProyecto], politicaEdicion: 'TODOS_ADMINISTRADORES', motivoGestion: 'POLITICA' } });
    });
  });
});
