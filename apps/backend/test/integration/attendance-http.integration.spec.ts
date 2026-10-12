import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { EstadoParticipacion, EstadoProyecto, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { accessTokenFor, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { AttendanceController } from '../../src/attendance/attendance.controller';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { CreateActividadDto } from '../../src/attendance/dto/create-actividad.dto';
import { MarkAttendanceDto } from '../../src/attendance/dto/mark-attendance.dto';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * GPI01-C15 (HU-177): actividades del proyecto y asistencia, contrato HTTP
 * real contra PostgreSQL (base desechable, `INTEGRATION_DATABASE_URL`) con el
 * JwtAuthGuard, el ProjectWriteGuard, el ValidationPipe y el servicio reales.
 *
 * Reglas ya implementadas que aquí se certifican (no se inventa ninguna):
 *  - crear una actividad y marcar asistencia es exclusivo del líder y solo en
 *    un proyecto operativo (PUBLICADO o EN_PROGRESO);
 *  - leen el líder y los participantes activos; un tercero no;
 *  - confirmar asistencia acredita las horas de la actividad en
 *    HorasParticipacion; repetirla no duplica, quitarla borra esas horas y
 *    volver a confirmarla las crea de nuevo. Nunca hay dos filas vivas.
 */
describeIntegration('GPI01-C15 — actividades y asistencia (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  const scope: Required<Pick<IntegrationCleanupScope, 'userIds' | 'projectIds' | 'roleIds' | 'participationIds'>> = {
    userIds: [],
    projectIds: [],
    roleIds: [],
    participationIds: [],
  };
  const ids = { lider: 0, integrante: 0, retirado: 0, tercero: 0, proyecto: 0, cerrado: 0, enCierre: 0, publicado: 0, participacion: 0 };
  const tokens = { lider: '', integrante: '', tercero: '' };

  type Respuesta = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  async function pedir(metodo: 'GET' | 'POST' | 'PATCH', ruta: string, token?: string, body?: unknown): Promise<Respuesta> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${http.url}${ruta}`, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // cuerpo no JSON
    }
    return { status: response.status, body: parsed };
  }

  const actividad = (extra: Record<string, unknown> = {}) => ({
    tituloActividad: 'Jornada de siembra',
    tipoActividad: 'JORNADA',
    fechaActividad: '2031-03-10',
    horasValor: 2.5,
    ...extra,
  });

  const horasDe = (idParticipacion: number) =>
    prisma.horasParticipacion.findMany({ where: { idParticipacion }, orderBy: { idRegistroHoras: 'asc' } });

  async function crearActividad(token = tokens.lider, proyecto = ids.proyecto, extra: Record<string, unknown> = {}) {
    return pedir('POST', `/proyectos/${proyecto}/actividades`, token, actividad(extra));
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const [lider, integrante, retirado, tercero] = await Promise.all([
      createIntegrationUser(prisma),
      createIntegrationUser(prisma),
      createIntegrationUser(prisma),
      createIntegrationUser(prisma),
    ]);
    Object.assign(ids, { lider: lider.idUsuario, integrante: integrante.idUsuario, retirado: retirado.idUsuario, tercero: tercero.idUsuario });
    scope.userIds.push(lider.idUsuario, integrante.idUsuario, retirado.idUsuario, tercero.idUsuario);
    tokens.lider = accessTokenFor(lider);
    tokens.integrante = accessTokenFor(integrante);
    tokens.tercero = accessTokenFor(tercero);

    const proyectoEn = async (estadoProyecto: EstadoProyecto) => {
      const proyecto = await createIntegrationProject(prisma, lider.idUsuario, { estadoProyecto });
      scope.projectIds.push(proyecto.idProyecto);
      return proyecto.idProyecto;
    };
    ids.proyecto = await proyectoEn(EstadoProyecto.EN_PROGRESO);
    ids.publicado = await proyectoEn(EstadoProyecto.PUBLICADO);
    ids.enCierre = await proyectoEn(EstadoProyecto.EN_SOLICITUD_CIERRE);
    ids.cerrado = await proyectoEn(EstadoProyecto.CERRADO);

    const rol = await createIntegrationProjectRole(prisma, ids.proyecto, { cupos: 5 });
    scope.roleIds.push(rol.idRolProyecto);
    const activa = await createIntegrationParticipation(prisma, integrante.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: EstadoParticipacion.ACTIVO,
    });
    const inactiva = await createIntegrationParticipation(prisma, retirado.idUsuario, rol.idRolProyecto, {
      estadoParticipacion: EstadoParticipacion.RETIRADO,
    });
    ids.participacion = activa.idParticipacion;
    scope.participationIds.push(activa.idParticipacion, inactiva.idParticipacion);

    const prismaService = prisma as unknown as PrismaService;
    const service = new AttendanceService(
      prismaService,
      new ProjectTransactionService(prismaService),
      new ProjectPolicyService(new ProjectIdResolverService(prismaService)),
      new ProjectReadPolicyService(prismaService),
      new BitacoraEventosService(),
    );
    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: AttendanceController,
          deps: [AttendanceService],
          handlers: {
            findAll: [Number, Object],
            findOne: [Number, Number, Object],
            create: [Number, Object, CreateActividadDto],
            markAttendance: [Number, Number, Number, Object, MarkAttendanceDto],
          },
        },
      ],
      providers: [{ provide: AttendanceService, useValue: service }],
    });
  });

  afterAll(async () => {
    await http?.close();
    const actividades = await prisma.actividadProyecto.findMany({ where: { idProyecto: { in: scope.projectIds } }, select: { idActividad: true } });
    const idActividades = actividades.map((a) => a.idActividad);
    await prisma.asistenciaActividad.deleteMany({ where: { idActividad: { in: idActividades } } });
    await prisma.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds } } });
    await prisma.actividadProyecto.deleteMany({ where: { idActividad: { in: idActividades } } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds } } });
    await cleanupIntegrationFixtures(prisma, scope);
    await prisma.$disconnect();
  });

  // ── Crear ──────────────────────────────────────────────────────────────
  it('el líder crea una actividad en un proyecto operativo y queda persistida', async () => {
    const { status, body } = await crearActividad();
    expect(status).toBe(201);
    expect(body).toMatchObject({
      idProyecto: ids.proyecto,
      tituloActividad: 'Jornada de siembra',
      tipoActividad: 'JORNADA',
      fechaActividad: '2031-03-10',
      horasValor: 2.5,
      creadoPor: ids.lider,
    });
    const fila = await prisma.actividadProyecto.findUnique({ where: { idActividad: body.idActividad } });
    expect(fila?.horasValor.toNumber()).toBe(2.5);

    // PUBLICADO también es operativo.
    expect((await crearActividad(tokens.lider, ids.publicado)).status).toBe(201);
  });

  it('queda registrada en la bitácora del proyecto', async () => {
    const { body } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Taller con bitácora', tipoActividad: 'TALLER' });
    const evento = await prisma.bitacoraAuditoria.findFirst({
      where: { tipoObjeto: 'ACTIVIDAD', idObjeto: String(body.idActividad), accion: 'ACTIVITY_CREATED' },
    });
    expect(evento, 'evento de creación en la bitácora').not.toBeNull();
    expect(evento?.idUsuario).toBe(ids.lider);
    expect(evento?.detalleJson).toMatchObject({ valorNuevo: { tituloActividad: 'Taller con bitácora', tipoActividad: 'TALLER' } });
  });

  it.each([
    ['título vacío', { tituloActividad: '   ' }],
    ['tipo desconocido', { tipoActividad: 'FIESTA' }],
    ['fecha inválida', { fechaActividad: 'ayer' }],
    ['horas en cero', { horasValor: 0 }],
    ['horas negativas', { horasValor: -1 }],
    ['campo no declarado', { extra: 'x' }],
  ])('rechaza con 400 una actividad con %s y no crea nada', async (_caso, extra) => {
    const antes = await prisma.actividadProyecto.count({ where: { idProyecto: ids.proyecto } });
    expect((await crearActividad(tokens.lider, ids.proyecto, extra)).status).toBe(400);
    expect(await prisma.actividadProyecto.count({ where: { idProyecto: ids.proyecto } })).toBe(antes);
  });

  it('solo el líder crea: un integrante y un tercero reciben 403, sin sesión 401, y nada se persiste', async () => {
    const antes = await prisma.actividadProyecto.count({ where: { idProyecto: ids.proyecto } });
    expect((await crearActividad(tokens.integrante)).status).toBe(403);
    expect((await crearActividad(tokens.tercero)).status).toBe(403);
    expect((await pedir('POST', `/proyectos/${ids.proyecto}/actividades`, undefined, actividad())).status).toBe(401);
    expect(await prisma.actividadProyecto.count({ where: { idProyecto: ids.proyecto } })).toBe(antes);
  });

  it('un proyecto en solicitud de cierre o cerrado no admite actividades nuevas, y uno inexistente responde 404', async () => {
    for (const proyecto of [ids.enCierre, ids.cerrado]) {
      const { status } = await crearActividad(tokens.lider, proyecto);
      expect(status, `proyecto ${proyecto}`).toBe(409);
      expect(await prisma.actividadProyecto.count({ where: { idProyecto: proyecto } })).toBe(0);
    }
    expect((await crearActividad(tokens.lider, 2_147_483_000)).status).toBe(404);
  });

  // ── Leer ───────────────────────────────────────────────────────────────
  it('el líder y un participante activo leen la lista y el detalle; un tercero y un anónimo no', async () => {
    const { body: creada } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Reunión de lectura', tipoActividad: 'REUNION' });
    for (const token of [tokens.lider, tokens.integrante]) {
      const lista = await pedir('GET', `/proyectos/${ids.proyecto}/actividades`, token);
      expect(lista.status).toBe(200);
      const item = lista.body.find((a: { idActividad: number }) => a.idActividad === creada.idActividad);
      expect(item).toMatchObject({ tituloActividad: 'Reunión de lectura', totalIntegrantes: 1, totalAsistieron: 0 });

      const detalle = await pedir('GET', `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}`, token);
      expect(detalle.status).toBe(200);
      // Solo los participantes ACTIVOS aparecen como integrantes; el retirado no.
      expect(detalle.body.integrantes.map((i: { idUsuario: number }) => i.idUsuario)).toEqual([ids.integrante]);
      expect(detalle.body.integrantes[0]).toMatchObject({ asistio: false, confirmadoEn: null });
    }
    for (const ruta of [`/proyectos/${ids.proyecto}/actividades`, `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}`]) {
      expect((await pedir('GET', ruta, tokens.tercero)).status, ruta).toBe(403);
      expect((await pedir('GET', ruta)).status, ruta).toBe(401);
    }
  });

  it('el detalle de una actividad inexistente o de otro proyecto responde 404', async () => {
    const { body: ajena } = await crearActividad(tokens.lider, ids.publicado, { tituloActividad: 'De otro proyecto' });
    expect((await pedir('GET', `/proyectos/${ids.proyecto}/actividades/2147483000`, tokens.lider)).status).toBe(404);
    expect((await pedir('GET', `/proyectos/${ids.proyecto}/actividades/${ajena.idActividad}`, tokens.lider)).status).toBe(404);
  });

  // ── Asistencia ─────────────────────────────────────────────────────────
  it('confirmar asistencia acredita las horas una sola vez; quitarla las borra; volver a confirmar las crea de nuevo', async () => {
    const { body: creada } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Jornada con asistencia', horasValor: 3 });
    const ruta = `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}/asistencia/${ids.integrante}`;
    const horasAntes = (await horasDe(ids.participacion)).length;

    // Confirmar.
    const primera = await pedir('PATCH', ruta, tokens.lider, { asistio: true });
    expect(primera.status).toBe(200);
    expect(primera.body).toMatchObject({ idActividad: creada.idActividad, idUsuario: ids.integrante, asistio: true, confirmadoPor: ids.lider });
    expect(primera.body.idRegistroHoras).toEqual(expect.any(Number));
    let horas = await horasDe(ids.participacion);
    expect(horas).toHaveLength(horasAntes + 1);
    const acreditada = horas.find((h) => h.idRegistroHoras === primera.body.idRegistroHoras);
    expect(acreditada?.estadoHoras).toBe('APROBADA');
    expect(acreditada?.horasAprobadas?.toNumber()).toBe(3);
    expect(acreditada?.aprobadoPor).toBe(ids.lider);

    const marcada = await prisma.bitacoraAuditoria.findFirst({
      where: { tipoObjeto: 'ACTIVIDAD', idObjeto: String(creada.idActividad), accion: 'ATTENDANCE_MARKED' },
    });
    expect(marcada?.detalleJson).toMatchObject({ valorNuevo: { idUsuario: ids.integrante, asistio: true, horasAcreditadas: '3.00' } });

    // Repetir la confirmación: misma fila de horas, ninguna nueva.
    const repetida = await pedir('PATCH', ruta, tokens.lider, { asistio: true });
    expect(repetida.status).toBe(200);
    expect(repetida.body.idAsistencia).toBe(primera.body.idAsistencia);
    expect(repetida.body.idRegistroHoras).toBe(primera.body.idRegistroHoras);
    expect(await horasDe(ids.participacion)).toHaveLength(horasAntes + 1);
    expect(await prisma.asistenciaActividad.count({ where: { idActividad: creada.idActividad } })).toBe(1);

    // La lectura refleja la asistencia.
    const detalle = await pedir('GET', `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}`, tokens.integrante);
    expect(detalle.body.integrantes[0]).toMatchObject({ idUsuario: ids.integrante, asistio: true });
    expect(detalle.body.integrantes[0].confirmadoEn).toEqual(expect.any(String));
    const lista = await pedir('GET', `/proyectos/${ids.proyecto}/actividades`, tokens.lider);
    expect(lista.body.find((a: { idActividad: number }) => a.idActividad === creada.idActividad).totalAsistieron).toBe(1);

    // Quitar la asistencia: las horas acreditadas desaparecen.
    const quitada = await pedir('PATCH', ruta, tokens.lider, { asistio: false });
    expect(quitada.status).toBe(200);
    expect(quitada.body).toMatchObject({ asistio: false, idRegistroHoras: null, idAsistencia: primera.body.idAsistencia });
    horas = await horasDe(ids.participacion);
    expect(horas).toHaveLength(horasAntes);
    expect(horas.some((h) => h.idRegistroHoras === primera.body.idRegistroHoras)).toBe(false);

    // Quitarla otra vez no cambia nada.
    expect((await pedir('PATCH', ruta, tokens.lider, { asistio: false })).status).toBe(200);
    expect(await horasDe(ids.participacion)).toHaveLength(horasAntes);

    // Volver a confirmar: una fila nueva, y solo una.
    const otraVez = await pedir('PATCH', ruta, tokens.lider, { asistio: true });
    expect(otraVez.status).toBe(200);
    expect(otraVez.body.idRegistroHoras).not.toBe(primera.body.idRegistroHoras);
    expect(await horasDe(ids.participacion)).toHaveLength(horasAntes + 1);
    expect(await prisma.asistenciaActividad.count({ where: { idActividad: creada.idActividad } })).toBe(1);
  });

  it('solo se marca a un participante activo de una actividad existente, con un cuerpo válido', async () => {
    const { body: creada } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Reunión con rechazos', tipoActividad: 'REUNION' });
    const base = `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}/asistencia`;

    // Ni el retirado ni un tercero ni el propio líder son participantes activos.
    for (const idUsuario of [ids.retirado, ids.tercero, ids.lider]) {
      const { status, body } = await pedir('PATCH', `${base}/${idUsuario}`, tokens.lider, { asistio: true });
      expect(status, `usuario ${idUsuario}`).toBe(400);
      expect(body.message).toBe('El integrante no tiene una participación activa en el proyecto de esta actividad');
    }
    expect((await pedir('PATCH', `/proyectos/${ids.proyecto}/actividades/2147483000/asistencia/${ids.integrante}`, tokens.lider, { asistio: true })).status).toBe(404);
    for (const cuerpo of [{}, { asistio: 'si' }, { asistio: true, otro: 1 }]) {
      expect((await pedir('PATCH', `${base}/${ids.integrante}`, tokens.lider, cuerpo)).status).toBe(400);
    }
    expect(await prisma.asistenciaActividad.count({ where: { idActividad: creada.idActividad } })).toBe(0);
  });

  it('solo el líder marca asistencia: un integrante (ni la propia), un tercero y un anónimo no pueden', async () => {
    const { body: creada } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Taller con permisos', tipoActividad: 'TALLER' });
    const ruta = `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}/asistencia/${ids.integrante}`;
    const horasAntes = (await horasDe(ids.participacion)).length;

    expect((await pedir('PATCH', ruta, tokens.integrante, { asistio: true })).status).toBe(403);
    expect((await pedir('PATCH', ruta, tokens.tercero, { asistio: true })).status).toBe(403);
    expect((await pedir('PATCH', ruta, undefined, { asistio: true })).status).toBe(401);

    expect(await prisma.asistenciaActividad.count({ where: { idActividad: creada.idActividad } })).toBe(0);
    expect(await horasDe(ids.participacion)).toHaveLength(horasAntes);
  });

  it('cuando el proyecto pasa a solicitud de cierre la asistencia queda bloqueada y las lecturas siguen', async () => {
    const { body: creada } = await crearActividad(tokens.lider, ids.proyecto, { tituloActividad: 'Última jornada' });
    const ruta = `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}/asistencia/${ids.integrante}`;
    expect((await pedir('PATCH', ruta, tokens.lider, { asistio: true })).status).toBe(200);
    const horasAntes = (await horasDe(ids.participacion)).length;

    await prisma.proyecto.update({ where: { idProyecto: ids.proyecto }, data: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE } });
    try {
      expect((await pedir('PATCH', ruta, tokens.lider, { asistio: false })).status).toBe(409);
      expect((await crearActividad()).status).toBe(409);
      expect(await horasDe(ids.participacion), 'las horas ya acreditadas no se tocan').toHaveLength(horasAntes);
      expect((await pedir('GET', `/proyectos/${ids.proyecto}/actividades/${creada.idActividad}`, tokens.integrante)).status).toBe(200);
    } finally {
      await prisma.proyecto.update({ where: { idProyecto: ids.proyecto }, data: { estadoProyecto: EstadoProyecto.EN_PROGRESO } });
    }
  });
});
