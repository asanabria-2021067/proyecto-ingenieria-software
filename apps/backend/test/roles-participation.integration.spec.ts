import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { RolesService } from '../src/roles/roles.service';

/**
 * Pruebas de INTEGRACIÓN reales contra PostgreSQL (Secciones 2/3): validan el
 * retiro limitado con el aislamiento SERIALIZABLE real, el índice parcial real,
 * la preservación de estados de tarea y la concurrencia — cosas que un mock no
 * puede demostrar. Se activan solo con `ROLES_IT_DATABASE_URL` apuntando a una
 * base PostgreSQL desechable (nunca compartida); sin esa variable, se omiten
 * para no romper la suite unitaria sin base de datos.
 */
const DB_URL = process.env.ROLES_IT_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

// NotificationsService falso: el retiro emite notificaciones best-effort tras
// el commit; aquí no interesa el gateway, solo que la operación no dependa de él.
const fakeNotifications = {
  notifyUsers: async () => undefined,
  notifyRoleMembers: async () => undefined,
} as unknown as NotificationsService;

suite('RolesService.leaveRole — integración PostgreSQL real', () => {
  let prisma: PrismaClient;
  let service: RolesService;

  // IDs sembrados por cada test.
  let leaderId: number;
  let anaId: number;
  let betoId: number;
  let projectId: number;
  let rolFrontId: number;
  let rolDocsId: number;
  const tareas: Record<string, number> = {};
  let etiquetaId: number;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    service = new RolesService(prisma as unknown as PrismaService, fakeNotifications);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE tarea_etiqueta, etiqueta, evidencia, comentario, asignacion_tarea, tarea, hito,
       participacion_proyecto, requisito_habilidad_rol, postulacion, rol_proyecto, proyecto, usuario
       RESTART IDENTITY CASCADE`,
    );

    const leader = await prisma.usuario.create({
      data: { correo: 'lider@x.com', contrasena: 'h', nombre: 'Lía', apellido: 'Der' },
    });
    const ana = await prisma.usuario.create({
      data: { correo: 'ana@x.com', contrasena: 'h', nombre: 'Ana', apellido: 'Uno' },
    });
    const beto = await prisma.usuario.create({
      data: { correo: 'beto@x.com', contrasena: 'h', nombre: 'Beto', apellido: 'Dos' },
    });
    leaderId = leader.idUsuario;
    anaId = ana.idUsuario;
    betoId = beto.idUsuario;

    const proyecto = await prisma.proyecto.create({
      data: {
        tituloProyecto: 'Proj',
        descripcionProyecto: 'Desc',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        creadoPor: leaderId,
      },
    });
    projectId = proyecto.idProyecto;

    const rolFront = await prisma.rolProyecto.create({
      data: { idProyecto: projectId, nombreRol: 'Frontend', cupos: 3 },
    });
    const rolDocs = await prisma.rolProyecto.create({
      data: { idProyecto: projectId, nombreRol: 'Docs', cupos: 3 },
    });
    rolFrontId = rolFront.idRolProyecto;
    rolDocsId = rolDocs.idRolProyecto;

    // Ana participa ACTIVO en ambos roles; Beto en Frontend (candidato a reasignar).
    await prisma.participacionProyecto.createMany({
      data: [
        { idUsuario: anaId, idRolProyecto: rolFrontId, estadoParticipacion: 'ACTIVO' },
        { idUsuario: anaId, idRolProyecto: rolDocsId, estadoParticipacion: 'ACTIVO' },
        { idUsuario: betoId, idRolProyecto: rolFrontId, estadoParticipacion: 'ACTIVO' },
      ],
    });

    // Tareas de Frontend en los cuatro estados + una eliminada; una de Docs; una sin rol.
    const crearTarea = async (
      clave: string,
      estado: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO',
      idRol: number | null,
      eliminada = false,
    ) => {
      const t = await prisma.tarea.create({
        data: {
          idProyecto: projectId,
          idRolProyecto: idRol,
          tituloTarea: clave,
          estadoTarea: estado,
          creadaPor: leaderId,
          eliminadoEn: eliminada ? new Date() : null,
        },
      });
      tareas[clave] = t.idTarea;
      // Asignación activa de Ana en cada tarea.
      await prisma.asignacionTarea.create({
        data: { idTarea: t.idTarea, idUsuario: anaId, asignadoPor: leaderId },
      });
    };

    await crearTarea('frontPorHacer', 'POR_HACER', rolFrontId);
    await crearTarea('frontEnProgreso', 'EN_PROGRESO', rolFrontId);
    await crearTarea('frontEnRevision', 'EN_REVISION', rolFrontId);
    await crearTarea('frontHecho', 'HECHO', rolFrontId);
    await crearTarea('frontEliminada', 'EN_PROGRESO', rolFrontId, true);
    await crearTarea('docs', 'EN_PROGRESO', rolDocsId);
    await crearTarea('sinRol', 'POR_HACER', null);

    // Etiqueta + comentario + evidencia sobre una tarea Frontend, para comprobar
    // que el retiro no las toca.
    const etiqueta = await prisma.etiqueta.create({
      data: { idProyecto: projectId, nombreEtiqueta: 'Urgente', nombreNormalizado: 'urgente', color: '#FF0000' },
    });
    etiquetaId = etiqueta.idEtiqueta;
    await prisma.tareaEtiqueta.create({
      data: { idTarea: tareas.frontEnProgreso, idEtiqueta: etiquetaId },
    });
    await prisma.comentario.create({
      data: { idTarea: tareas.frontEnProgreso, idAutor: anaId, contenido: 'nota' },
    });
    await prisma.evidencia.create({
      data: {
        idTarea: tareas.frontEnProgreso,
        idUsuarioCargador: anaId,
        tipoEvidencia: 'ENLACE',
        urlRecurso: 'https://x.com',
      },
    });
  });

  async function asignacionActiva(idTarea: number) {
    return prisma.asignacionTarea.findFirst({ where: { idTarea, desasignadaEn: null } });
  }

  it('marca RETIRADO, conserva el otro rol y no elimina la participación', async () => {
    const res = await service.leaveRole(projectId, rolFrontId, anaId);
    expect(res.estadoParticipacion).toBe('RETIRADO');

    const participaciones = await prisma.participacionProyecto.findMany({
      where: { idUsuario: anaId },
      orderBy: { idRolProyecto: 'asc' },
    });
    // Ninguna se elimina: siguen las dos filas de Ana.
    expect(participaciones).toHaveLength(2);
    const front = participaciones.find((p) => p.idRolProyecto === rolFrontId)!;
    const docs = participaciones.find((p) => p.idRolProyecto === rolDocsId)!;
    expect(front.estadoParticipacion).toBe('RETIRADO');
    expect(front.fechaSalida).not.toBeNull();
    expect(docs.estadoParticipacion).toBe('ACTIVO');
  });

  it('cierra solo las asignaciones del rol abandonado; conserva estados de tarea', async () => {
    await service.leaveRole(projectId, rolFrontId, anaId);

    // Las 4 tareas Frontend no eliminadas quedan sin asignado activo…
    for (const clave of ['frontPorHacer', 'frontEnProgreso', 'frontEnRevision', 'frontHecho']) {
      expect(await asignacionActiva(tareas[clave])).toBeNull();
    }
    // …pero conservan su estado (no vuelven a POR_HACER, HECHO sigue HECHO).
    const estados = await prisma.tarea.findMany({
      where: { idTarea: { in: Object.values(tareas) } },
      select: { idTarea: true, estadoTarea: true, idRolProyecto: true },
    });
    const estadoDe = (clave: string) => estados.find((t) => t.idTarea === tareas[clave])!.estadoTarea;
    expect(estadoDe('frontPorHacer')).toBe('POR_HACER');
    expect(estadoDe('frontEnProgreso')).toBe('EN_PROGRESO');
    expect(estadoDe('frontEnRevision')).toBe('EN_REVISION');
    expect(estadoDe('frontHecho')).toBe('HECHO');

    // Docs (otro rol), sin rol y la Frontend eliminada conservan su asignación.
    expect(await asignacionActiva(tareas.docs)).not.toBeNull();
    expect(await asignacionActiva(tareas.sinRol)).not.toBeNull();
    expect(await asignacionActiva(tareas.frontEliminada)).not.toBeNull();

    // idRolProyecto no se modifica en ninguna tarea.
    expect(estados.find((t) => t.idTarea === tareas.frontPorHacer)!.idRolProyecto).toBe(rolFrontId);
  });

  it('todas las asignaciones cerradas comparten el mismo timestamp y conservan su historial', async () => {
    await service.leaveRole(projectId, rolFrontId, anaId);

    const cerradas = await prisma.asignacionTarea.findMany({
      where: { idUsuario: anaId, desasignadaEn: { not: null }, tarea: { idRolProyecto: rolFrontId, eliminadoEn: null } },
    });
    expect(cerradas).toHaveLength(4);
    const timestamps = new Set(cerradas.map((a) => a.desasignadaEn!.getTime()));
    expect(timestamps.size).toBe(1); // un único timestamp para toda la operación
    // El historial permanece: fechaAsignacion y asignadoPor intactos.
    for (const a of cerradas) {
      expect(a.fechaAsignacion).not.toBeNull();
      expect(a.asignadoPor).toBe(leaderId);
    }
  });

  it('no modifica etiquetas, comentarios ni evidencias', async () => {
    await service.leaveRole(projectId, rolFrontId, anaId);

    expect(
      await prisma.tareaEtiqueta.count({ where: { idTarea: tareas.frontEnProgreso, idEtiqueta: etiquetaId } }),
    ).toBe(1);
    expect(await prisma.comentario.count({ where: { idTarea: tareas.frontEnProgreso } })).toBe(1);
    expect(await prisma.evidencia.count({ where: { idTarea: tareas.frontEnProgreso } })).toBe(1);
  });

  it('permite la reasignación posterior (nueva asignación) conservando el estado', async () => {
    await service.leaveRole(projectId, rolFrontId, anaId);

    // El índice parcial permite una nueva asignación activa porque la anterior
    // quedó cerrada. Beto participa activo en Frontend.
    const nueva = await prisma.asignacionTarea.create({
      data: { idTarea: tareas.frontPorHacer, idUsuario: betoId, asignadoPor: leaderId },
    });
    expect(nueva.desasignadaEn).toBeNull();

    const tarea = await prisma.tarea.findUnique({ where: { idTarea: tareas.frontPorHacer } });
    expect(tarea!.estadoTarea).toBe('POR_HACER'); // el estado no cambió por la reasignación
    // Historial: la asignación anterior (Ana) sigue existiendo, cerrada.
    const deAna = await prisma.asignacionTarea.findFirst({
      where: { idTarea: tareas.frontPorHacer, idUsuario: anaId },
    });
    expect(deAna!.desasignadaEn).not.toBeNull();
  });

  it('rechaza el retiro del último rol (400) y no toca nada', async () => {
    // Ana abandona Frontend (queda Docs)…
    await service.leaveRole(projectId, rolFrontId, anaId);
    // …y ahora intenta abandonar Docs, su último rol activo.
    await expect(service.leaveRole(projectId, rolDocsId, anaId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Docs sigue ACTIVO y su tarea sigue asignada.
    const docs = await prisma.participacionProyecto.findFirst({
      where: { idUsuario: anaId, idRolProyecto: rolDocsId },
    });
    expect(docs!.estadoParticipacion).toBe('ACTIVO');
    expect(await asignacionActiva(tareas.docs)).not.toBeNull();
  });

  it('CONCURRENCIA: dos retiros simultáneos nunca dejan al usuario sin ningún rol activo', async () => {
    const [r1, r2] = await Promise.allSettled([
      service.leaveRole(projectId, rolFrontId, anaId),
      service.leaveRole(projectId, rolDocsId, anaId),
    ]);

    const exitosos = [r1, r2].filter((r) => r.status === 'fulfilled').length;
    const fallidos = [r1, r2].filter((r) => r.status === 'rejected').length;

    // Exactamente uno tuvo éxito: el otro fue rechazado (último rol) por el
    // aislamiento SERIALIZABLE + reintento, nunca ambos.
    expect(exitosos).toBe(1);
    expect(fallidos).toBe(1);

    const activas = await prisma.participacionProyecto.count({
      where: { idUsuario: anaId, estadoParticipacion: 'ACTIVO' },
    });
    expect(activas).toBe(1); // invariante crítica: jamás 0
  });
});
