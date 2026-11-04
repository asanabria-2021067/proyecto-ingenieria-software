import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import * as fx from './setup/fixtures';
import { timeStack } from './setup/time-records';
import { TeamGestionService } from '../../src/team/team-gestion.service';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { ChatCanalesService } from '../../src/chat/chat-canales.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { addDaysToDay, todayInGuatemala } from '../../src/common/utils/guatemala-date';

const MOTIVO = 'Incumplimiento reiterado de acuerdos del equipo';
const dia = (d: string) => new Date(`${d}T00:00:00Z`);

describeIntegration('MEJ-104/105 carga del equipo y baja de integrante (PostgreSQL real)', () => {
  let db: PrismaClient;
  let service: TeamGestionService;
  let chat: ChatCanalesService;
  const sufijo = randomUUID().slice(0, 8);
  const userIds: number[] = [];
  const carreraIds: number[] = [];
  const f = {} as Record<string, number>;
  let proyecto: number;
  let proyectoAjeno: number;
  let proyectoCerrado: number;
  let proyectoFinalizando: number;
  let asignacionSprintCerrado: number;
  let sprint: number;
  let tareaAbierta: number;
  let tareaHecha: number;
  let asignacionAbierta: number;
  let asignacionHecha: number;
  let participacionMiembro: number;

  const usuario = async () => {
    const u = await fx.createIntegrationUser(db);
    userIds.push(u.idUsuario);
    return u.idUsuario;
  };
  const conRol = async (idUsuario: number, nombrePerfil: string) => {
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil }, update: {}, create: { nombrePerfil } });
    await db.usuarioRolAcceso.create({ data: { idUsuario, idRolAcceso: rol.idRolAcceso } });
  };

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
    const prisma = db as unknown as PrismaService;
    const gateway = { server: {}, notifyUsers: vi.fn().mockResolvedValue(undefined), emitToUsers: vi.fn() };
    chat = new ChatCanalesService(prisma, { removeFromConversation: vi.fn() } as never);
    service = new TeamGestionService(
      prisma,
      timeStack(db).service,
      new BitacoraEventosService(),
      new NotificationsService(prisma, gateway as unknown as NotificationsGateway),
      new ProjectTransactionService(prisma),
      new ProjectPolicyService(new ProjectIdResolverService(prisma)),
      chat,
    );

    const a = await db.carrera.create({ data: { nombreCarrera: `Baja A ${sufijo}`, facultad: `F ${sufijo}` } });
    const b = await db.carrera.create({ data: { nombreCarrera: `Baja B ${sufijo}`, facultad: `G ${sufijo}` } });
    carreraIds.push(a.idCarrera, b.idCarrera);

    f.admin = await usuario();
    f.lider = await usuario();
    f.miembro = await usuario();
    f.otro = await usuario();
    f.sinHoras = await usuario();
    f.ajeno = await usuario();
    f.coordDentro = await usuario();
    f.coordFuera = await usuario();
    f.coordParticipa = await usuario();
    f.adminParticipa = await usuario();
    await conRol(f.admin, 'administrador');
    await conRol(f.adminParticipa, 'administrador');
    for (const [coord, carrera] of [[f.coordDentro, a], [f.coordFuera, b], [f.coordParticipa, a]] as const) {
      await conRol(coord, 'coordinador_academico');
      await db.alcanceCoordinador.create({ data: { idUsuario: coord, idCarrera: carrera.idCarrera } });
    }

    const p = await fx.createIntegrationProject(db, f.lider, { estadoProyecto: 'EN_PROGRESO' });
    proyecto = p.idProyecto;
    await db.proyecto.update({ where: { idProyecto: proyecto }, data: { idCarrera: a.idCarrera } });
    const rol = await fx.createIntegrationProjectRole(db, proyecto, { cupos: 10 });
    for (const u of [f.miembro, f.otro, f.sinHoras, f.coordParticipa, f.adminParticipa]) {
      const part = await fx.createIntegrationParticipation(db, u, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
      if (u === f.miembro) participacionMiembro = part.idParticipacion;
    }
    const sp = await fx.createIntegrationSprint(db, proyecto);
    sprint = sp.idSprint;
    const tAbierta = await fx.createIntegrationTask(db, proyecto, f.lider, sprint, { estadoTarea: 'EN_PROGRESO' });
    const tHecha = await fx.createIntegrationTask(db, proyecto, f.lider, sprint, { estadoTarea: 'HECHO' });
    tareaAbierta = tAbierta.idTarea;
    tareaHecha = tHecha.idTarea;
    const asA = await fx.createIntegrationTaskAssignment(db, tareaAbierta, f.miembro, f.lider, { idParticipacion: participacionMiembro });
    const asH = await fx.createIntegrationTaskAssignment(db, tareaHecha, f.miembro, f.lider, { idParticipacion: participacionMiembro });
    asignacionAbierta = asA.idAsignacion;
    asignacionHecha = asH.idAsignacion;

    const hoy = todayInGuatemala();
    const lunes = addDaysToDay(hoy, -((new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7));
    const registros = [
      { idAsignacion: asignacionAbierta, idUsuario: f.miembro, horas: 2, fecha: dia(hoy) },
      { idAsignacion: asignacionAbierta, idUsuario: f.miembro, horas: 1.5, fecha: dia(lunes) },
      // Semana anterior: cuenta en el Sprint pero no en la semana.
      { idAsignacion: asignacionHecha, idUsuario: f.miembro, horas: 4, fecha: dia(addDaysToDay(lunes, -1)) },
      // Revocado: no cuenta en ninguna parte.
      { idAsignacion: asignacionHecha, idUsuario: f.miembro, horas: 9, fecha: dia(hoy), revocadoEn: new Date(), revocadoPor: f.miembro },
    ];
    await db.registroTiempoTarea.createMany({ data: registros });
    await db.asignacionTarea.update({ where: { idAsignacion: asignacionHecha }, data: { horasReales: 4 } });

    // Tarea abierta en un Sprint ya cerrado: la baja no reescribe ese tramo.
    const spCerrado = await fx.createIntegrationSprint(db, proyecto, { numero: 2, estado: 'CERRADO' });
    const tCerrada = await fx.createIntegrationTask(db, proyecto, f.lider, spCerrado.idSprint, { estadoTarea: 'EN_PROGRESO' });
    asignacionSprintCerrado = (await fx.createIntegrationTaskAssignment(db, tCerrada.idTarea, f.miembro, f.lider, { idParticipacion: participacionMiembro })).idAsignacion;
    // MEJ-109: `otro` es responsable adicional de la tarea abierta del Sprint ACTIVO, de la abierta de un Sprint cerrado y de la HECHO.
    await db.tareaResponsable.createMany({
      data: [tareaAbierta, tCerrada.idTarea, tareaHecha].map((idTarea) => ({ idTarea, idUsuario: f.otro })),
    });
    await chat.sincronizar(proyecto);

    const pc = await fx.createIntegrationProject(db, f.ajeno, { estadoProyecto: 'CERRADO' });
    proyectoCerrado = pc.idProyecto;
    const pf = await fx.createIntegrationProject(db, f.ajeno, { estadoProyecto: 'EN_PROGRESO' });
    proyectoFinalizando = pf.idProyecto;
    for (const pid of [proyectoCerrado, proyectoFinalizando]) {
      const rl = await fx.createIntegrationProjectRole(db, pid);
      await fx.createIntegrationParticipation(db, f.sinHoras, rl.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    }
    await fx.createIntegrationSprint(db, proyectoFinalizando, { estado: 'EN_FINALIZACION' });

    const pa = await fx.createIntegrationProject(db, f.ajeno, { estadoProyecto: 'EN_PROGRESO' });
    proyectoAjeno = pa.idProyecto;
  });

  afterAll(async () => {
    const proyectos = [proyecto, proyectoAjeno, proyectoCerrado, proyectoFinalizando].filter((id) => id !== undefined);
    await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.conversacionParticipante.deleteMany({ where: { conversacion: { idProyecto: { in: proyectos } } } });
    await db.conversacion.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.tareaResponsable.deleteMany({ where: { tarea: { idProyecto: { in: proyectos } } } });
    await db.registroTiempoTarea.deleteMany({ where: { asignacion: { tarea: { idProyecto: { in: proyectos } } } } });
    await db.asignacionTarea.deleteMany({ where: { tarea: { idProyecto: { in: proyectos } } } });
    await db.tarea.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.sprint.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.participacionProyecto.deleteMany({ where: { rolProyecto: { idProyecto: { in: proyectos } } } });
    await db.rolProyecto.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.proyecto.deleteMany({ where: { idProyecto: { in: proyectos } } });
    await db.alcanceCoordinador.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.carrera.deleteMany({ where: { idCarrera: { in: carreraIds } } });
    await db.$disconnect();
  });

  it('carga: tareas abiertas, horas de la semana y del Sprint; sin horas = 0; el HECHO y lo revocado no cuentan', async () => {
    const r = await service.cargaEquipo(proyecto, f.lider);
    const por = (id: number) => r.integrantes.find((i) => i.idUsuario === id)!;
    expect(r.sprintActivo?.idSprint).toBe(sprint);
    expect(por(f.miembro)).toMatchObject({ tareasAbiertas: 2, horasSemana: 3.5, horasSprint: 7.5 });
    expect(por(f.sinHoras)).toMatchObject({ tareasAbiertas: 0, horasSemana: 0, horasSprint: 0 });
    // Responsable adicional de dos tareas abiertas (la tercera esta HECHO): cuentan en su carga.
    expect(por(f.otro)).toMatchObject({ tareasAbiertas: 2 });
    expect(r.integrantes.map((i) => i.idUsuario)).not.toContain(f.lider);
    expect(r.semana.hasta > r.semana.desde).toBe(true);
  });

  it('carga: admin y coordinador en alcance ven; estudiante, coordinador fuera de alcance, coordinador participante y líder ajeno 403; id cruzado 403', async () => {
    await expect(service.cargaEquipo(proyecto, f.admin)).resolves.toBeDefined();
    await expect(service.cargaEquipo(proyecto, f.coordDentro)).resolves.toBeDefined();
    for (const actor of [f.miembro, f.coordFuera, f.coordParticipa, f.ajeno]) {
      await expect(service.cargaEquipo(proyecto, actor)).rejects.toMatchObject({ status: 403 });
    }
    // El líder de otro proyecto no ve este por nombrar su propio id: solo el suyo.
    await expect(service.cargaEquipo(proyectoAjeno, f.lider)).rejects.toMatchObject({ status: 403 });
    await expect(service.cargaEquipo(99999999, f.admin)).rejects.toMatchObject({ status: 404 });
  });

  it('baja: líder, estudiante, coordinador de otra carrera y coordinador participante 403 sin tocar nada', async () => {
    for (const actor of [f.lider, f.otro, f.coordFuera, f.coordParticipa]) {
      await expect(service.darDeBaja(proyecto, f.miembro, actor, MOTIVO)).rejects.toMatchObject({ status: 403 });
    }
    const p = await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: participacionMiembro } });
    expect(p.estadoParticipacion).toBe('ACTIVO');
  });

  it('baja: un coordinador no puede dar de baja a un administrador que participa; el admin sí', async () => {
    await expect(service.darDeBaja(proyecto, f.adminParticipa, f.coordDentro, MOTIVO)).rejects.toMatchObject({ status: 403 });
    expect((await db.participacionProyecto.findFirstOrThrow({ where: { idUsuario: f.adminParticipa, rolProyecto: { idProyecto: proyecto } } })).estadoParticipacion).toBe('ACTIVO');
  });

  it('baja: proyecto CERRADO 409 y Sprint EN_FINALIZACION 409, sin cambios', async () => {
    for (const pid of [proyectoCerrado, proyectoFinalizando]) {
      await expect(service.darDeBaja(pid, f.sinHoras, f.admin, MOTIVO)).rejects.toMatchObject({ status: 409 });
      expect(await db.participacionProyecto.count({ where: { idUsuario: f.sinHoras, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: pid } } })).toBe(1);
    }
  });

  it('baja: líder del proyecto y usuario ajeno al proyecto (id cruzado)', async () => {
    await expect(service.darDeBaja(proyecto, f.lider, f.admin, MOTIVO)).rejects.toMatchObject({ status: 404 });
    await expect(service.darDeBaja(proyectoAjeno, f.miembro, f.admin, MOTIVO)).rejects.toMatchObject({ status: 404 });
    const rol = await fx.createIntegrationProjectRole(db, proyecto);
    await fx.createIntegrationParticipation(db, f.lider, rol.idRolProyecto, { estadoParticipacion: 'ACTIVO' });
    await expect(service.darDeBaja(proyecto, f.lider, f.admin, MOTIVO)).rejects.toMatchObject({ status: 400 });
  });

  it('baja por coordinador dentro del alcance: participación RETIRADO con motivo y ejecutor; tarea abierta sin asignar; horas, tarea HECHO, bitácora y notificación', async () => {
    const r = await service.darDeBaja(proyecto, f.miembro, f.coordDentro, MOTIVO);
    expect(r).toMatchObject({ estadoParticipacion: 'RETIRADO', participacionesRetiradas: 1, tareasSinAsignar: 1 });

    const p = await db.participacionProyecto.findUniqueOrThrow({ where: { idParticipacion: participacionMiembro } });
    expect(p).toMatchObject({ estadoParticipacion: 'RETIRADO', motivoBaja: MOTIVO, bajaPor: f.coordDentro });
    expect(p.fechaSalida).not.toBeNull();

    const abierta = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: asignacionAbierta } });
    expect(abierta.desasignadaEn).not.toBeNull();
    expect(Number(abierta.horasReales)).toBe(3.5);
    expect(await db.asignacionTarea.count({ where: { idTarea: tareaAbierta, desasignadaEn: null } })).toBe(0);
    expect(await db.tarea.count({ where: { idTarea: tareaAbierta, eliminadoEn: null } })).toBe(1);
    const hecha = await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: asignacionHecha } });
    expect(hecha.desasignadaEn).toBeNull();
    expect(Number(hecha.horasReales)).toBe(4);
    expect(await db.registroTiempoTarea.count({ where: { idUsuario: f.miembro } })).toBe(4);
    // El tramo abierto de un Sprint ya cerrado no se toca (C056).
    expect((await db.asignacionTarea.findUniqueOrThrow({ where: { idAsignacion: asignacionSprintCerrado } })).desasignadaEn).toBeNull();
    // Sale de los canales del proyecto.
    expect(await db.conversacionParticipante.count({ where: { idUsuario: f.miembro, conversacion: { idProyecto: proyecto } } })).toBe(0);
    expect(await db.conversacionParticipante.count({ where: { idUsuario: f.otro, conversacion: { idProyecto: proyecto } } })).toBe(1);

    const evento = await db.bitacoraAuditoria.findFirstOrThrow({ where: { accion: 'PARTICIPATION_REMOVED', idUsuario: f.coordDentro } });
    expect(evento.detalleJson).toMatchObject({ idProyecto: proyecto, valorNuevo: { idUsuario: f.miembro, motivo: MOTIVO } });
    const aviso = await db.notificacion.findFirstOrThrow({ where: { idUsuario: f.miembro, tipoNotificacion: 'PARTICIPACION_ACTUALIZADA' } });
    expect(aviso.mensajeNotificacion).toContain(MOTIVO);
  });

  it('doble baja 409 y el dado de baja sale de la carga del equipo', async () => {
    await expect(service.darDeBaja(proyecto, f.miembro, f.admin, MOTIVO)).rejects.toMatchObject({ status: 409 });
    const r = await service.cargaEquipo(proyecto, f.admin);
    expect(r.integrantes.map((i) => i.idUsuario)).not.toContain(f.miembro);
  });

  it('admin da de baja a otro integrante', async () => {
    await expect(service.darDeBaja(proyecto, f.otro, f.admin, MOTIVO)).resolves.toMatchObject({ participacionesRetiradas: 1, tareasSinAsignar: 0 });
  });

  it('baja: el responsable adicional sale de todas las tareas abiertas del proyecto, incluida la de un Sprint cerrado, y queda en la bitácora; la HECHO conserva su fila', async () => {
    const filas = await db.tareaResponsable.findMany({ where: { idUsuario: f.otro, tarea: { idProyecto: proyecto } }, select: { idTarea: true } });
    expect(filas.map((x) => x.idTarea)).toEqual([tareaHecha]);
    const evento = await db.bitacoraAuditoria.findFirstOrThrow({ where: { accion: 'PARTICIPATION_REMOVED', idUsuario: f.admin } });
    expect(evento.detalleJson).toMatchObject({ valorNuevo: { idUsuario: f.otro, adicionales: 2 } });
  });
});
