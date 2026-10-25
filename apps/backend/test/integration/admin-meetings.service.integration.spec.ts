import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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

  describe('G06 · editar, sincronizar y concurrencia', () => {
    const usuariosDe = async (idReunion: number, tipo: string) => (await avisos(idReunion, tipo)).map((f) => f.idUsuario);
    const proyecciones = (idReunion: number) =>
      prisma.eventoProyecto.findMany({ where: { idReunion }, orderBy: { idProyecto: 'asc' }, select: { idEvento: true, idProyecto: true, eliminadoEn: true, tituloEvento: true, fechaInicio: true, recordatorioEnviadoEn: true } });

    it('cambiar el título reescribe todas las proyecciones, sube la versión y avisa ACTUALIZADA una vez por persona', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      emitidos.length = 0;
      const editada = await service.update(creada.idReunion, id('ADMIN2'), { version: 1, tituloEvento: 'Seguimiento reprogramado' });

      expect(editada).toMatchObject({ version: 2, integridad: 'OK', contenido: { tituloEvento: 'Seguimiento reprogramado' } });
      expect((await proyecciones(creada.idReunion)).map((x) => x.tituloEvento)).toEqual(['Seguimiento reprogramado', 'Seguimiento reprogramado']);
      expect(await usuariosDe(creada.idReunion, 'REUNION_ACTUALIZADA')).toEqual([id('L1'), id('M1'), id('COMUN'), id('L2'), id('M2')].sort((a, b) => a - b));
      expect(await usuariosDe(creada.idReunion, 'REUNION_PROGRAMADA')).toHaveLength(5);
      expect(emitidos.every((e) => e.tipo === 'REUNION_ACTUALIZADA')).toBe(true);
    });

    it('un PATCH sin cambios reales no sube la versión ni avisa', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      emitidos.length = 0;
      const igual = await service.update(creada.idReunion, id('ADMIN'), { version: 1, tituloEvento: 'Seguimiento HU-195', proyectos: [p.P2.idProyecto] });
      expect(igual.version).toBe(1);
      expect(await usuariosDe(creada.idReunion, 'REUNION_ACTUALIZADA')).toEqual([]);
      expect(emitidos).toEqual([]);
    });

    it('una versión desfasada es 409 y no escribe', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, tituloEvento: 'Primera edición' });
      const error = await service.update(creada.idReunion, id('ADMIN2'), { version: 1, tituloEvento: 'Edición perdida' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ versionActual: 2 });
      expect((await proyecciones(creada.idReunion))[0].tituloEvento).toBe('Primera edición');
    });

    it('AC-16: dos administradores editan a la vez la misma versión: uno gana, el otro recibe 409', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      const resultados = await Promise.allSettled([
        service.update(creada.idReunion, id('ADMIN'), { version: 1, tituloEvento: 'Versión de ADMIN' }),
        service.update(creada.idReunion, id('ADMIN2'), { version: 1, tituloEvento: 'Versión de ADMIN2' }),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rechazo.reason).toBeInstanceOf(ConflictException);
      const ganador = (resultados.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ contenido: { tituloEvento: string } }>).value;
      expect((await proyecciones(creada.idReunion))[0].tituloEvento).toBe(ganador.contenido.tituloEvento);
      expect((await prisma.reunionAdministracion.findUniqueOrThrow({ where: { idReunion: creada.idReunion } })).version).toBe(2);
    });

    it('AC-06B: retirar P2 no da de baja a COMUN, que sigue por P1; solo L2 y M2 reciben la cancelación', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      const editada = await service.update(creada.idReunion, id('ADMIN'), { version: 1, proyectos: [p.P1.idProyecto] });

      expect(editada.proyectos.map((x) => x.idProyecto)).toEqual([p.P1.idProyecto]);
      expect(await usuariosDe(creada.idReunion, 'REUNION_CANCELADA')).toEqual([id('L2'), id('M2')].sort((a, b) => a - b));
      expect(await usuariosDe(creada.idReunion, 'REUNION_ACTUALIZADA')).toEqual([]);
      const filaP2 = (await proyecciones(creada.idReunion)).find((x) => x.idProyecto === p.P2.idProyecto);
      expect(filaP2?.eliminadoEn).not.toBeNull();
    });

    it('añadir un proyecto avisa solo a quien no estaba ya convocado (COMUN no recibe una segunda convocatoria)', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto]));
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, proyectos: [p.P1.idProyecto, p.P2.idProyecto] });
      const programadas = await avisos(creada.idReunion, 'REUNION_PROGRAMADA');
      expect(programadas.filter((f) => f.claveIdempotencia === `reunion:${creada.idReunion}:v2:programada`).map((f) => f.idUsuario)).toEqual([id('L2'), id('M2')].sort((a, b) => a - b));
      expect(programadas.filter((f) => f.idUsuario === id('COMUN'))).toHaveLength(1);
    });

    it('AC-15: quitar y volver a añadir un proyecto reactiva la MISMA proyección (sin violar el UNIQUE)', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      const original = (await proyecciones(creada.idReunion)).find((x) => x.idProyecto === p.P2.idProyecto);
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, proyectos: [p.P1.idProyecto] });
      await service.update(creada.idReunion, id('ADMIN'), { version: 2, proyectos: [p.P1.idProyecto, p.P2.idProyecto], tituloEvento: 'Vuelve P2' });

      const filas = await proyecciones(creada.idReunion);
      expect(filas).toHaveLength(2);
      const p2 = filas.find((x) => x.idProyecto === p.P2.idProyecto);
      expect(p2).toMatchObject({ idEvento: original?.idEvento, eliminadoEn: null, tituloEvento: 'Vuelve P2' });
      expect(filas.every((x) => x.tituloEvento === 'Vuelve P2')).toBe(true);
    });

    it('reprogramar reabre el recordatorio de todas las proyecciones', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      await prisma.eventoProyecto.updateMany({ where: { idReunion: creada.idReunion }, data: { recordatorioEnviadoEn: new Date() } });
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, fechaInicio: esc.enDias(6).toISOString(), fechaFin: esc.enDias(6, 16).toISOString() });
      expect((await proyecciones(creada.idReunion)).map((x) => x.recordatorioEnviadoEn)).toEqual([null, null]);
    });

    it('con un CERRADO convocado: reprogramar dentro de su ventana sí; fuera, 400; añadir uno vencido, 400', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.PC.idProyecto]));
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, fechaInicio: esc.enDias(20).toISOString(), fechaFin: esc.enDias(20, 16).toISOString() });
      await expect(service.update(creada.idReunion, id('ADMIN'), { version: 2, fechaInicio: esc.enDias(70).toISOString(), fechaFin: esc.enDias(70, 16).toISOString() })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(creada.idReunion, id('ADMIN'), { version: 2, proyectos: [p.PC.idProyecto, p.PVENC.idProyecto] })).rejects.toBeInstanceOf(BadRequestException);
      // Cambiar solo la descripción de un CERRADO ya convocado no revalida la ventana.
      expect((await service.update(creada.idReunion, id('ADMIN'), { version: 2, descripcionEvento: 'Agenda' })).version).toBe(3);
    });

    it('AC-11/AC-12/AC-13: políticas, cambio de política solo por el creador y editor revocado', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto], { politicaEdicion: 'SOLO_CREADOR' }));
      expect(await service.update(creada.idReunion, id('ADMIN2'), { version: 1, tituloEvento: 'X' }).catch((e: unknown) => e)).toBeInstanceOf(ForbiddenException);

      await service.update(creada.idReunion, id('ADMIN'), { version: 1, politicaEdicion: 'ADMINISTRADORES_SELECCIONADOS', editores: [id('ADMIN2')] });
      expect((await service.update(creada.idReunion, id('ADMIN2'), { version: 2, tituloEvento: 'Editado por ADMIN2' })).version).toBe(3);
      // Un editor no amplía permisos: no cambia la política.
      await expect(service.update(creada.idReunion, id('ADMIN2'), { version: 3, politicaEdicion: 'TODOS_ADMINISTRADORES' })).rejects.toBeInstanceOf(ForbiddenException);

      const rol = await prisma.usuarioRolAcceso.findFirstOrThrow({ where: { idUsuario: id('ADMIN2') } });
      await prisma.usuarioRolAcceso.delete({ where: { idUsuarioRolAcceso: rol.idUsuarioRolAcceso } });
      try {
        await expect(service.update(creada.idReunion, id('ADMIN2'), { version: 3, tituloEvento: 'Sin rol' })).rejects.toBeInstanceOf(ForbiddenException);
      } finally {
        await prisma.usuarioRolAcceso.create({ data: { idUsuario: id('ADMIN2'), idRolAcceso: rol.idRolAcceso } });
      }
      const registro = await prisma.bitacoraAuditoria.findFirst({ where: { tipoObjeto: 'REUNION_ADMINISTRACION', idObjeto: String(creada.idReunion), accion: 'REUNION_ADMIN_ACTUALIZADA' }, orderBy: { idAuditoria: 'asc' } });
      expect(registro?.detalleJson).toMatchObject({ politica: { antes: 'SOLO_CREADOR', despues: 'ADMINISTRADORES_SELECCIONADOS' }, editores: { antes: [], despues: [id('ADMIN2')] } });
    });

    it('QC-01: si el creador pierde el rol, otro administrador gestiona por respaldo y queda auditado', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto], { politicaEdicion: 'SOLO_CREADOR' }));
      const rol = await prisma.usuarioRolAcceso.findFirstOrThrow({ where: { idUsuario: id('ADMIN') } });
      await prisma.usuarioRolAcceso.delete({ where: { idUsuarioRolAcceso: rol.idUsuarioRolAcceso } });
      try {
        const editada = await service.update(creada.idReunion, id('ADMIN2'), { version: 1, tituloEvento: 'Respaldo' });
        expect(editada).toMatchObject({ version: 2, canManage: true, motivoGestion: 'RESPALDO_CREADOR_SIN_AUTORIZACION', puedeCambiarPolitica: false });
        const registro = await prisma.bitacoraAuditoria.findFirst({ where: { tipoObjeto: 'REUNION_ADMINISTRACION', idObjeto: String(creada.idReunion), accion: 'REUNION_ADMIN_ACTUALIZADA' } });
        expect(registro).toMatchObject({ idUsuario: id('ADMIN2'), detalleJson: { motivoGestion: 'RESPALDO_CREADOR_SIN_AUTORIZACION' } });
      } finally {
        await prisma.usuarioRolAcceso.create({ data: { idUsuario: id('ADMIN'), idRolAcceso: rol.idRolAcceso } });
      }
    });
  });

  describe('G07 · cancelar', () => {
    const usuariosDe = async (idReunion: number, tipo: string) => (await avisos(idReunion, tipo)).map((f) => f.idUsuario);

    it('cancela padre y proyecciones con el mismo instante, avisa una vez y conserva el historial', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      emitidos.length = 0;
      const cancelada = await service.cancel(creada.idReunion, id('ADMIN2'));

      expect(cancelada).toMatchObject({ estado: 'CANCELADA', version: 2, integridad: 'OK' });
      expect(cancelada.proyectos.map((x) => x.idProyecto)).toEqual(creada.proyectos.map((x) => x.idProyecto));
      const filas = await prisma.eventoProyecto.findMany({ where: { idReunion: creada.idReunion } });
      expect(filas.every((f) => f.eliminadoEn?.getTime() === cancelada.canceladaEn?.getTime())).toBe(true);
      expect(await usuariosDe(creada.idReunion, 'REUNION_CANCELADA')).toEqual([id('L1'), id('M1'), id('COMUN'), id('L2'), id('M2')].sort((a, b) => a - b));
      expect(emitidos.every((e) => e.tipo === 'REUNION_CANCELADA')).toBe(true);
    });

    it('AC-17: cancelar dos veces (también a la vez) avisa una sola vez y no mueve la fecha de cancelación', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      await Promise.all([service.cancel(creada.idReunion, id('ADMIN')), service.cancel(creada.idReunion, id('ADMIN2'))]);
      const primera = await prisma.reunionAdministracion.findUniqueOrThrow({ where: { idReunion: creada.idReunion } });
      const otra = await service.cancel(creada.idReunion, id('ADMIN'));

      expect(otra.canceladaEn).toEqual(primera.canceladaEn);
      expect(otra.version).toBe(2);
      const lista = await usuariosDe(creada.idReunion, 'REUNION_CANCELADA');
      expect(lista).toEqual([...new Set(lista)]);
      expect(lista).toHaveLength(3);
      expect(await prisma.bitacoraAuditoria.count({ where: { tipoObjeto: 'REUNION_ADMINISTRACION', idObjeto: String(creada.idReunion), accion: 'REUNION_ADMIN_CANCELADA' } })).toBe(1);
    });

    it('una reunión cancelada ya no se edita (409)', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto]));
      await service.cancel(creada.idReunion, id('ADMIN'));
      await expect(service.update(creada.idReunion, id('ADMIN'), { version: 2, tituloEvento: 'Tarde' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('QC-02: un convocado que ya salió del equipo también se entera, si su cuenta sigue activa; quien ya recibió su baja no se repite', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P1.idProyecto, p.P2.idProyecto]));
      // L2 y M2 dejan de estar convocados al retirar P2 (reciben su cancelación en ese momento).
      await service.update(creada.idReunion, id('ADMIN'), { version: 1, proyectos: [p.P1.idProyecto] });
      // M1 sale del proyecto después de ser convocado.
      const part = await prisma.participacionProyecto.findFirstOrThrow({ where: { idUsuario: id('M1'), idRolProyecto: p.P1.idRol } });
      await prisma.participacionProyecto.update({ where: { idParticipacion: part.idParticipacion }, data: { estadoParticipacion: 'RETIRADO' } });
      try {
        await service.cancel(creada.idReunion, id('ADMIN'));
        const canceladas = await avisos(creada.idReunion, 'REUNION_CANCELADA');
        // M1 (exmiembro convocado) sí; L2 y M2, una sola cancelación (la del retiro de P2).
        expect(canceladas.filter((f) => f.idUsuario === id('M1'))).toHaveLength(1);
        for (const usuario of [id('L2'), id('M2')]) expect(canceladas.filter((f) => f.idUsuario === usuario)).toHaveLength(1);
        // El aviso no nombra proyectos.
        expect(canceladas.every((f) => !('projectId' in (f.datosJson as object)))).toBe(true);
      } finally {
        await prisma.participacionProyecto.update({ where: { idParticipacion: part.idParticipacion }, data: { estadoParticipacion: 'ACTIVO' } });
      }
    });

    it('quien no gestiona la reunión no la cancela (403) y nada cambia', async () => {
      const { id, p } = esc;
      const creada = await service.create(id('ADMIN'), dto([p.P2.idProyecto], { politicaEdicion: 'SOLO_CREADOR' }));
      await expect(service.cancel(creada.idReunion, id('ADMIN2'))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.cancel(creada.idReunion, id('ESTUDIANTE'))).rejects.toBeInstanceOf(ForbiddenException);
      expect((await prisma.reunionAdministracion.findUniqueOrThrow({ where: { idReunion: creada.idReunion } })).canceladaEn).toBeNull();
    });
  });
});
