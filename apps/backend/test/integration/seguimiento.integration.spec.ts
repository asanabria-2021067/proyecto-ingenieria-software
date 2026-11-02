import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationHito,
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures } from './setup/cleanup';
import { SeguimientoService } from '../../src/seguimiento/seguimiento.service';
import { HitosAtrasadosService } from '../../src/seguimiento/hitos-atrasados.service';
import { ReconocimientosService } from '../../src/seguimiento/reconocimientos.service';
import { RetrospectivaService } from '../../src/seguimiento/retrospectiva.service';
import { SprintReportService } from '../../src/seguimiento/sprint-report.service';
import { SprintsContextService } from '../../src/sprints/sprints-context.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { InsigniasService } from '../../src/insignias/insignias.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';

const dia = (delta: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
};

/** MEJ-54/55/56/57/23/24 contra PostgreSQL real: permisos, unicidad y efectos en BD. */
describeIntegration('SEGUIMIENTO - hitos, semáforo, resultados, reconocimientos, retrospectiva y reporte (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let seguimiento: SeguimientoService;
  let atrasados: HitosAtrasadosService;
  let reconocimientos: ReconocimientosService;
  let retrospectiva: RetrospectivaService;
  let reporte: SprintReportService;
  let insignias: InsigniasService;
  const events = { emit: vi.fn() };
  const userIds: number[] = [];
  let lider: number;
  let ana: number;
  let beto: number;
  let externo: number;
  let idProyecto: number;
  let idSprint: number;
  let idRolProyecto: number;
  const tareaIds: number[] = [];
  const hitoIds: number[] = [];
  const participacionIds: number[] = [];
  const sprintIds: number[] = [];
  let idOrganizacionPrivada: number;

  const nuevoUsuario = async (nombre = 'Integrante') => {
    const u = await createIntegrationUser(prisma, { nombre, apellido: 'Prueba' });
    userIds.push(u.idUsuario);
    return u.idUsuario;
  };

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    const notifications = new NotificationsService(db, {
      notifyUsers: vi.fn().mockResolvedValue(undefined),
      emitToUsers: vi.fn(),
    } as unknown as NotificationsGateway);
    const sprintsContext = new SprintsContextService(db);
    const readPolicy = new ProjectReadPolicyService(db);
    const bitacora = new BitacoraEventosService();
    seguimiento = new SeguimientoService(db, readPolicy);
    atrasados = new HitosAtrasadosService(db, notifications);
    reconocimientos = new ReconocimientosService(db, sprintsContext, notifications, events as never);
    retrospectiva = new RetrospectivaService(db, sprintsContext, bitacora);
    reporte = new SprintReportService(db, readPolicy, sprintsContext, bitacora);
    insignias = new InsigniasService(db, notifications);

    lider = await nuevoUsuario('Lider');
    ana = await nuevoUsuario('Ana');
    beto = await nuevoUsuario('Beto');
    externo = await nuevoUsuario('Externo');
    const proyecto = await createIntegrationProject(prisma, lider, { estadoProyecto: 'EN_PROGRESO' });
    idProyecto = proyecto.idProyecto;
    const rol = await createIntegrationProjectRole(prisma, idProyecto, { cupos: 3 });
    idRolProyecto = rol.idRolProyecto;
    for (const u of [ana, beto]) {
      participacionIds.push((await createIntegrationParticipation(prisma, u, idRolProyecto, { estadoParticipacion: 'ACTIVO' })).idParticipacion);
    }
    const sprint = await createIntegrationSprint(prisma, idProyecto, { estado: 'ACTIVO' });
    idSprint = sprint.idSprint;
    sprintIds.push(idSprint);
    const org = await prisma.organizacion.create({
      data: { nombreOrganizacion: `Org privada seguimiento ${Date.now()}`, creadaPor: lider, visibilidad: 'PRIVADA' },
    });
    idOrganizacionPrivada = org.idOrganizacion;
    await prisma.usuarioOrganizacion.create({ data: { idUsuario: lider, idOrganizacion: idOrganizacionPrivada, rolOrganizacion: 'PROPIETARIO' } });
  });

  afterAll(async () => {
    await prisma.reconocimientoCompanero.deleteMany({ where: { idProyecto } });
    await prisma.retrospectivaSprint.deleteMany({ where: { idProyecto } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.insigniaUsuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.proyectoOrganizacion.deleteMany({ where: { idProyecto } });
    await prisma.usuarioOrganizacion.deleteMany({ where: { idOrganizacion: idOrganizacionPrivada } });
    await prisma.organizacion.deleteMany({ where: { idOrganizacion: idOrganizacionPrivada } });
    await cleanupIntegrationFixtures(prisma, {
      taskIds: tareaIds,
      sprintIds,
      hitoIds,
      participationIds: participacionIds,
      roleIds: [idRolProyecto],
      projectIds: [idProyecto],
      userIds,
    });
    await prisma.$disconnect();
  });

  it('MEJ-54/55: hito sin completar y vencido sale en rojo; el externo y el participante histórico no lo ven', async () => {
    const hito = await createIntegrationHito(prisma, idProyecto, { tituloHito: 'Entrega parcial' });
    hitoIds.push(hito.idHito);
    await prisma.hito.update({ where: { idHito: hito.idHito }, data: { fechaLimite: dia(-4) } });
    const tarea = await createIntegrationTask(prisma, idProyecto, lider, idSprint);
    await prisma.tarea.update({ where: { idTarea: tarea.idTarea }, data: { idHito: hito.idHito } });
    tareaIds.push(tarea.idTarea);

    const vista = await seguimiento.obtener(idProyecto, ana);
    expect(vista.semaforo.color).toBe('ROJO');
    expect(vista.hitosAtrasados).toMatchObject([{ idHito: hito.idHito, tituloHito: 'Entrega parcial', diasAtraso: 4 }]);
    await expect(seguimiento.obtener(idProyecto, lider)).resolves.toBeDefined();
    await expect(seguimiento.obtener(idProyecto, externo)).rejects.toMatchObject({ status: 403 });
  });

  it('MEJ-54: el job avisa al líder una sola vez y marca el hito', async () => {
    const [hito] = hitoIds;
    expect(await atrasados.avisarHitosAtrasados()).toBeGreaterThanOrEqual(1);
    const avisos = await prisma.notificacion.findMany({ where: { idUsuario: lider, tipoNotificacion: 'HITO_ATRASADO' } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].datosJson).toMatchObject({ hitoId: hito, projectId: idProyecto, diasAtraso: 4 });
    expect((await prisma.hito.findUniqueOrThrow({ where: { idHito: hito } })).alertaAtrasoEnviadaEn).not.toBeNull();

    await atrasados.avisarHitosAtrasados();
    expect(await prisma.notificacion.count({ where: { idUsuario: lider, tipoNotificacion: 'HITO_ATRASADO' } })).toBe(1);
  });

  it('MEJ-54: completar las tareas del hito lo saca de los atrasados', async () => {
    await prisma.tarea.update({ where: { idTarea: tareaIds[0] }, data: { estadoTarea: 'HECHO' } });
    const vista = await seguimiento.obtener(idProyecto, lider);
    expect(vista.hitosAtrasados).toEqual([]);
    expect(vista.semaforo.color).toBe('VERDE');
  });

  it('MEJ-57: uno por persona por sprint, no a uno mismo, solo integrantes y solo con sprint abierto', async () => {
    await reconocimientos.crear(idProyecto, idSprint, ana, { idReceptor: beto, mensaje: 'Siempre ayuda al equipo' });
    await expect(reconocimientos.crear(idProyecto, idSprint, ana, { idReceptor: lider, mensaje: 'Otro más' })).rejects.toMatchObject({ status: 409 });
    await expect(reconocimientos.crear(idProyecto, idSprint, beto, { idReceptor: beto, mensaje: 'A mí mismo' })).rejects.toMatchObject({ status: 400 });
    await expect(reconocimientos.crear(idProyecto, idSprint, beto, { idReceptor: externo, mensaje: 'Ajeno' })).rejects.toMatchObject({ status: 400 });
    await expect(reconocimientos.crear(idProyecto, idSprint, externo, { idReceptor: beto, mensaje: 'Intruso' })).rejects.toMatchObject({ status: 403 });
    expect(await prisma.reconocimientoCompanero.count({ where: { idSprint } })).toBe(1);

    const lista = await reconocimientos.listar(idProyecto, idSprint, beto);
    expect(lista.reconocimientos).toHaveLength(1);
    expect(lista.yaReconoci).toBe(false);
    expect(await prisma.notificacion.count({ where: { idUsuario: beto, tipoNotificacion: 'RECONOCIMIENTO_RECIBIDO' } })).toBe(1);
    expect(events.emit).toHaveBeenCalledWith('insignias.recalcular', { claves: ['companerismo'], idUsuarios: [beto] });
  });

  it('MEJ-57: la base impide el reconocimiento a uno mismo y el segundo del mismo autor en el sprint', async () => {
    await expect(
      prisma.reconocimientoCompanero.create({ data: { idSprint, idProyecto, idAutor: beto, idReceptor: beto, mensaje: 'yo' } }),
    ).rejects.toThrow();
    await expect(
      prisma.reconocimientoCompanero.create({ data: { idSprint, idProyecto, idAutor: ana, idReceptor: lider, mensaje: 'dos' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('MEJ-57: recibir un reconocimiento sube la insignia «Compañero ejemplar» a Bronce', async () => {
    await insignias.sincronizarCatalogo();
    const subidas = await insignias.recalcular(beto, ['companerismo']);
    expect(subidas).toEqual(['companerismo']);
    const lista = await insignias.listarMias(beto);
    expect(lista.find((i) => i.clave === 'companerismo')).toMatchObject({ nivel: 'BRONCE', progreso: 1, icono: 'Handshake' });
  });

  it('MEJ-24: la retrospectiva la escribe solo el líder cuando el sprint ya no está activo y queda en la bitácora', async () => {
    const datos = { quePaso: 'Se entregó la demo', quePodriaMejorar: 'Estimar mejor', acuerdos: 'Revisión diaria' };
    await expect(retrospectiva.guardar(idProyecto, idSprint, lider, datos)).rejects.toMatchObject({ status: 400 });
    await prisma.sprint.update({ where: { idSprint }, data: { estado: 'EN_FINALIZACION' } });
    await expect(retrospectiva.guardar(idProyecto, idSprint, ana, datos)).rejects.toMatchObject({ status: 403 });

    await retrospectiva.guardar(idProyecto, idSprint, lider, datos);
    await retrospectiva.guardar(idProyecto, idSprint, lider, { ...datos, acuerdos: 'Revisión cada dos días' });
    expect(await prisma.retrospectivaSprint.count({ where: { idSprint } })).toBe(1);
    expect(await retrospectiva.obtener(idProyecto, idSprint, ana)).toMatchObject({ acuerdos: 'Revisión cada dos días' });
    await expect(retrospectiva.obtener(idProyecto, idSprint, externo)).rejects.toMatchObject({ status: 403 });

    const eventos = await prisma.bitacoraAuditoria.findMany({
      where: { accion: 'SPRINT_RETROSPECTIVE_SAVED', tipoObjeto: 'SPRINT', idObjeto: String(idSprint) },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos[0].detalleJson).toMatchObject({ idProyecto, idSprint });
  });

  it('MEJ-57: con el sprint en finalización aún se reconoce; ya cerrado no', async () => {
    await reconocimientos.crear(idProyecto, idSprint, lider, { idReceptor: ana, mensaje: 'Buen trabajo' });
    await prisma.sprint.update({ where: { idSprint }, data: { estado: 'CERRADO', fechaCierre: new Date() } });
    await expect(reconocimientos.crear(idProyecto, idSprint, beto, { idReceptor: ana, mensaje: 'Tarde' })).rejects.toMatchObject({ status: 400 });
  });

  it('MEJ-23: el reporte del sprint es del líder; un participante recibe 403', async () => {
    const m = await reporte.modelo(idProyecto, idSprint, lider);
    expect(m.sprint).toMatchObject({ numero: 1, estado: 'CERRADO' });
    expect(m.tareas).toHaveLength(1);
    expect(m.retrospectiva).toMatchObject({ quePaso: 'Se entregó la demo' });
    expect((await reporte.csv(idProyecto, idSprint, lider)).toString('utf-8')).toContain('Revisión cada dos días');
    expect((await reporte.pdf(idProyecto, idSprint, lider)).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(reporte.csv(idProyecto, idSprint, ana)).rejects.toMatchObject({ status: 403 });
    await expect(reporte.pdf(idProyecto, idSprint, externo)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.bitacoraAuditoria.count({ where: { accion: 'PROJECT_EXPORT_CSV_GENERATED', idObjeto: String(idSprint) } })).toBe(1);
  });

  it('MEJ-56: los resultados solo existen con el proyecto cerrado y el portafolio de una org privada no se revela', async () => {
    await expect(seguimiento.resultados(idProyecto, lider)).rejects.toMatchObject({ status: 400 });
    await prisma.proyecto.update({ where: { idProyecto }, data: { estadoProyecto: 'CERRADO' } });

    const r = await seguimiento.resultados(idProyecto, ana);
    expect(r.proyecto.idProyecto).toBe(idProyecto);
    expect(r.metricas).toMatchObject({ integrantes: 3, tareasTotales: 1, tareasHechas: 1, hitosTotales: 1, hitosCompletados: 1, reconocimientos: 2 });
    expect(r.equipo.map((e) => e.idUsuario).sort()).toEqual([ana, beto].sort());
    await expect(seguimiento.resultados(idProyecto, externo)).rejects.toMatchObject({ status: 403 });

    await expect(seguimiento.portafolioOrganizacion(idOrganizacionPrivada, externo)).rejects.toMatchObject({ status: 404 });
    await prisma.proyectoOrganizacion.create({ data: { idProyecto, idOrganizacion: idOrganizacionPrivada } });
    const portafolio = await seguimiento.portafolioOrganizacion(idOrganizacionPrivada, lider);
    expect(portafolio).toMatchObject([{ idProyecto, tareasHechas: 1, integrantes: 3 }]);
    await prisma.proyectoOrganizacion.deleteMany({ where: { idProyecto } });
  });
});
