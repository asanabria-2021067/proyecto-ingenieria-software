import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EstadoProyecto, TipoProyecto, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationProject, createIntegrationProjectRole, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { accessTokenFor, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { ApplicationsController } from '../../src/applications/applications.controller';
import { ApplicationsService } from '../../src/applications/applications.service';
import { CreatePostulacionDto } from '../../src/applications/dto/create-postulacion.dto';
import { UpdateEstadoPostulacionDto } from '../../src/applications/dto/update-estado-postulacion.dto';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ProjectsService } from '../../src/projects/projects.service';
import { SocialService } from '../../src/social/social.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { Cache } from 'cache-manager';
import { addDaysToDay, todayInGuatemala } from '../../src/common/utils/guatemala-date';

/**
 * MEJ-93/95/96/97/99/100 contra PostgreSQL real, por HTTP con el JwtAuthGuard y el ProjectWriteGuard reales:
 * proyectos parecidos (solo los visibles), «Cierra pronto» y orden por fecha límite, preguntas por rol con
 * respuestas que solo ve el líder, motivo de rechazo, retiro y línea de tiempo de la postulación.
 */
describeIntegration('Postulaciones y Explorar — preguntas, rechazo, retiro, línea de tiempo y parecidos (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  const userIds: number[] = [];
  const carreraIds: number[] = [];
  const habilidadIds: number[] = [];
  const scope: IntegrationCleanupScope = { projectIds: [], roleIds: [], hitoIds: [], participationIds: [] };

  type Respuesta = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  async function pedir(metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', ruta: string, token?: string, body?: unknown): Promise<Respuesta> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${http.url}${ruta}`, { method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // cuerpo vacío
    }
    return { status: response.status, body: parsed };
  }

  async function usuario() {
    const u = await createIntegrationUser(prisma);
    userIds.push(u.idUsuario);
    return { ...u, token: accessTokenFor(u) };
  }

  async function proyecto(
    lider: { idUsuario: number },
    extra: { estadoProyecto?: EstadoProyecto; tipoProyecto?: TipoProyecto; fechaLimitePostulacion?: Date; eliminadoEn?: Date } = {},
  ) {
    const base = await createIntegrationProject(prisma, lider.idUsuario, {
      estadoProyecto: extra.estadoProyecto ?? EstadoProyecto.PUBLICADO,
      tipoProyecto: extra.tipoProyecto,
    });
    scope.projectIds!.push(base.idProyecto);
    if (extra.fechaLimitePostulacion || extra.eliminadoEn) {
      await prisma.proyecto.update({
        where: { idProyecto: base.idProyecto },
        data: { fechaLimitePostulacion: extra.fechaLimitePostulacion, eliminadoEn: extra.eliminadoEn },
      });
    }
    return base;
  }

  async function rol(idProyecto: number, opciones: { idCarreraRequerida?: number; habilidades?: number[] } = {}) {
    const r = await createIntegrationProjectRole(prisma, idProyecto, { cupos: 3 });
    scope.roleIds!.push(r.idRolProyecto);
    if (opciones.idCarreraRequerida) {
      await prisma.rolProyecto.update({ where: { idRolProyecto: r.idRolProyecto }, data: { idCarreraRequerida: opciones.idCarreraRequerida } });
    }
    for (const idHabilidad of opciones.habilidades ?? []) {
      await prisma.requisitoHabilidadRol.create({ data: { idRolProyecto: r.idRolProyecto, idHabilidad, nivelMinimo: 'BASICO' } });
    }
    return r;
  }

  const enDias = (dias: number) => new Date(`${addDaysToDay(todayInGuatemala(), dias)}T00:00:00.000Z`);
  const justificacion = 'Quiero participar porque me interesa aprender y aportar al equipo del proyecto.';

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const notifications = new NotificationsService(prismaService, { server: undefined } as unknown as NotificationsGateway);
    const resolver = new ProjectIdResolverService(prismaService);
    const policy = new ProjectPolicyService(resolver);
    const projectTx = new ProjectTransactionService(prismaService);
    const readPolicy = new ProjectReadPolicyService(prismaService);
    const projects = new ProjectsService(
      prismaService,
      notifications,
      { get: async () => undefined, set: async () => undefined, del: async () => undefined } as unknown as Cache,
      projectTx,
      policy,
      readPolicy,
      new SocialService(prismaService, notifications),
    );
    const applications = new ApplicationsService(
      prismaService,
      notifications,
      { emit: () => true } as never,
      projectTx,
      policy,
      readPolicy,
    );

    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: ApplicationsController,
          deps: [ApplicationsService],
          handlers: { create: [CreatePostulacionDto, Object], updateEstado: [Number, UpdateEstadoPostulacionDto, Object] },
        },
        { controller: ProjectsController, deps: [ProjectsService] },
      ],
      providers: [
        { provide: ApplicationsService, useValue: applications },
        { provide: ProjectsService, useValue: projects },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.postulacion.deleteMany({ where: { idRolProyecto: { in: scope.roleIds } } });
    await prisma.requisitoHabilidadRol.deleteMany({ where: { idRolProyecto: { in: scope.roleIds } } });
    await cleanupIntegrationFixtures(prisma, scope);
    await prisma.habilidad.deleteMany({ where: { idHabilidad: { in: habilidadIds } } });
    await prisma.carrera.deleteMany({ where: { idCarrera: { in: carreraIds } } });
    await prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('las rutas nuevas y las que cambian exigen sesión', async () => {
    for (const [metodo, ruta] of [
      ['GET', '/proyectos/1/similares'],
      ['POST', '/postulaciones/1/en-revision'],
      ['DELETE', '/postulaciones/1'],
      ['PATCH', '/postulaciones/1/estado'],
      ['GET', '/postulaciones/mis-postulaciones'],
    ] as const) {
      expect((await pedir(metodo, ruta)).status, `${metodo} ${ruta}`).toBe(401);
    }
  });

  describe('MEJ-93 proyectos parecidos', () => {
    it('devuelve solo proyectos visibles en Explorar, nunca el propio, borradores, en revisión, cerrados ni eliminados', async () => {
      const lider = await usuario();
      const yo = await usuario();
      const carrera = await prisma.carrera.create({ data: { nombreCarrera: `Carrera ${randomUUID().slice(0, 8)}` } });
      carreraIds.push(carrera.idCarrera);
      const hab = await prisma.habilidad.create({ data: { nombreHabilidad: `Hab ${randomUUID().slice(0, 8)}` } });
      habilidadIds.push(hab.idHabilidad);

      const base = await proyecto(lider);
      await rol(base.idProyecto, { idCarreraRequerida: carrera.idCarrera, habilidades: [hab.idHabilidad] });

      const visibles = [];
      for (const estadoProyecto of [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO]) {
        const p = await proyecto(lider, { estadoProyecto });
        await rol(p.idProyecto, { idCarreraRequerida: carrera.idCarrera, habilidades: [hab.idHabilidad] });
        visibles.push(p.idProyecto);
      }
      const ocultos = [];
      for (const estadoProyecto of [EstadoProyecto.BORRADOR, EstadoProyecto.EN_REVISION, EstadoProyecto.CERRADO, EstadoProyecto.EN_SOLICITUD_CIERRE]) {
        const p = await proyecto(lider, { estadoProyecto });
        await rol(p.idProyecto, { idCarreraRequerida: carrera.idCarrera, habilidades: [hab.idHabilidad] });
        ocultos.push(p.idProyecto);
      }
      const eliminado = await proyecto(lider, { eliminadoEn: new Date() });
      await rol(eliminado.idProyecto, { idCarreraRequerida: carrera.idCarrera });
      ocultos.push(eliminado.idProyecto);

      const respuesta = await pedir('GET', `/proyectos/${base.idProyecto}/similares`, yo.token);
      expect(respuesta.status).toBe(200);
      const ids: number[] = respuesta.body.map((p: { idProyecto: number }) => p.idProyecto);
      expect(ids).toEqual(expect.arrayContaining(visibles));
      for (const oculto of ocultos) expect(ids).not.toContain(oculto);
      expect(ids).not.toContain(base.idProyecto);
      expect(ids.length).toBeLessThanOrEqual(6);
    });

    it('un proyecto base que no es visible responde 404 aunque tenga parecidos', async () => {
      const lider = await usuario();
      const yo = await usuario();
      const borrador = await proyecto(lider, { estadoProyecto: EstadoProyecto.BORRADOR });
      const eliminado = await proyecto(lider, { eliminadoEn: new Date() });
      expect((await pedir('GET', `/proyectos/${borrador.idProyecto}/similares`, yo.token)).status).toBe(404);
      expect((await pedir('GET', `/proyectos/${eliminado.idProyecto}/similares`, yo.token)).status).toBe(404);
    });
  });

  describe('MEJ-95 «Cierra pronto»', () => {
    it('marca cierraPronto a 7 días o menos y ordena por fecha límite con las nulas al final', async () => {
      const lider = await usuario();
      const yo = await usuario();
      const lejos = await proyecto(lider, { fechaLimitePostulacion: enDias(30) });
      const cerca = await proyecto(lider, { fechaLimitePostulacion: enDias(3) });
      const sinFecha = await proyecto(lider);
      const justo = await proyecto(lider, { fechaLimitePostulacion: enDias(7) });
      const pasado = await proyecto(lider, { fechaLimitePostulacion: enDias(8) });

      const res = await pedir('GET', '/proyectos?page=1&limit=50&orden=fechaLimite', yo.token);
      expect(res.status).toBe(200);
      const mios = new Set([lejos, cerca, sinFecha, justo, pasado].map((p) => p.idProyecto));
      const delCatalogo = res.body.data.filter((p: { idProyecto: number }) => mios.has(p.idProyecto));
      const porId = new Map<number, { cierraPronto: boolean }>(delCatalogo.map((p: { idProyecto: number; cierraPronto: boolean }) => [p.idProyecto, p]));
      expect(porId.get(cerca.idProyecto)?.cierraPronto).toBe(true);
      expect(porId.get(justo.idProyecto)?.cierraPronto).toBe(true);
      expect(porId.get(pasado.idProyecto)?.cierraPronto).toBe(false);
      expect(porId.get(lejos.idProyecto)?.cierraPronto).toBe(false);
      expect(porId.get(sinFecha.idProyecto)?.cierraPronto).toBe(false);
      expect(delCatalogo.map((p: { idProyecto: number }) => p.idProyecto)).toEqual([
        cerca.idProyecto,
        justo.idProyecto,
        pasado.idProyecto,
        lejos.idProyecto,
        sinFecha.idProyecto,
      ]);
    });
  });

  describe('MEJ-97 preguntas y respuestas', () => {
    async function escenario() {
      const lider = await usuario();
      const postulante = await usuario();
      const otro = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto);
      const corta = await prisma.preguntaRol.create({ data: { idRolProyecto: r.idRolProyecto, enunciado: '¿Cuántas horas tienes?', tipo: 'CORTA', obligatoria: true, orden: 0 } });
      const larga = await prisma.preguntaRol.create({ data: { idRolProyecto: r.idRolProyecto, enunciado: 'Cuéntanos tu experiencia', tipo: 'LARGA', obligatoria: false, orden: 1 } });
      return { lider, postulante, otro, p, r, corta, larga };
    }

    it('exige las obligatorias y respeta los límites de largo; guarda las respuestas con el enunciado', async () => {
      const { postulante, r, corta, larga } = await escenario();
      const base = { idRolProyecto: r.idRolProyecto, justificacion };

      expect((await pedir('POST', '/postulaciones', postulante.token, base)).status).toBe(400);
      expect((await pedir('POST', '/postulaciones', postulante.token, { ...base, respuestas: [{ idPregunta: corta.idPregunta, respuesta: 'a'.repeat(201) }] })).status).toBe(400);
      expect((await pedir('POST', '/postulaciones', postulante.token, { ...base, respuestas: [{ idPregunta: corta.idPregunta, respuesta: '10' }, { idPregunta: larga.idPregunta, respuesta: 'b'.repeat(2001) }] })).status).toBe(400);
      expect((await pedir('POST', '/postulaciones', postulante.token, { ...base, respuestas: [{ idPregunta: 999999999, respuesta: '10' }] })).status).toBe(400);
      expect((await pedir('POST', '/postulaciones', postulante.token, { ...base, justificacion: 'muy corta' })).status).toBe(400);
      expect(await prisma.postulacion.count({ where: { idRolProyecto: r.idRolProyecto } })).toBe(0);

      const ok = await pedir('POST', '/postulaciones', postulante.token, {
        ...base,
        respuestas: [{ idPregunta: corta.idPregunta, respuesta: '10' }, { idPregunta: larga.idPregunta, respuesta: 'b'.repeat(2000) }],
      });
      expect(ok.status).toBe(201);
      const guardadas = await prisma.respuestaPostulacion.findMany({ where: { idPostulacion: ok.body.idPostulacion }, orderBy: { orden: 'asc' } });
      expect(guardadas.map((g) => g.enunciado)).toEqual(['¿Cuántas horas tienes?', 'Cuéntanos tu experiencia']);
    });

    it('solo el líder ve las respuestas ajenas: otro estudiante y un no líder no las ven', async () => {
      const { lider, postulante, otro, p, r, corta } = await escenario();
      const creada = await pedir('POST', '/postulaciones', postulante.token, {
        idRolProyecto: r.idRolProyecto,
        justificacion,
        respuestas: [{ idPregunta: corta.idPregunta, respuesta: 'Diez horas' }],
      });
      expect(creada.status).toBe(201);
      const id = creada.body.idPostulacion;

      const delLider = await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones`, lider.token);
      expect(delLider.status).toBe(200);
      expect(delLider.body[0].respuestas.map((x: { respuesta: string }) => x.respuesta)).toEqual(['Diez horas']);
      const detalleLider = await pedir('GET', `/postulaciones/${id}`, lider.token);
      expect(detalleLider.status).toBe(200);
      expect(detalleLider.body.respuestas[0].enunciado).toBe('¿Cuántas horas tienes?');

      expect([403, 404]).toContain((await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones`, otro.token)).status);
      expect([403, 404]).toContain((await pedir('GET', `/postulaciones/${id}`, otro.token)).status);
      const listaDelOtro = await pedir('GET', '/postulaciones', otro.token);
      expect(JSON.stringify(listaDelOtro.body)).not.toContain('Diez horas');
      const minas = await pedir('GET', '/postulaciones/mis-postulaciones', otro.token);
      expect(minas.body).toEqual([]);

      const propia = await pedir('GET', '/postulaciones/mis-postulaciones', postulante.token);
      expect(propia.body[0].respuestas[0].respuesta).toBe('Diez horas');
    });

    it('editar o quitar la pregunta después no altera la respuesta ya enviada', async () => {
      const { postulante, r, corta } = await escenario();
      const creada = await pedir('POST', '/postulaciones', postulante.token, {
        idRolProyecto: r.idRolProyecto,
        justificacion,
        respuestas: [{ idPregunta: corta.idPregunta, respuesta: 'Diez' }],
      });
      expect(creada.status).toBe(201);
      await prisma.preguntaRol.update({ where: { idPregunta: corta.idPregunta }, data: { enunciado: 'Texto nuevo' } });
      await prisma.preguntaRol.deleteMany({ where: { idRolProyecto: r.idRolProyecto } });
      const propia = await pedir('GET', '/postulaciones/mis-postulaciones', postulante.token);
      expect(propia.body[0].respuestas).toHaveLength(1);
      expect(propia.body[0].respuestas[0]).toMatchObject({ enunciado: '¿Cuántas horas tienes?', respuesta: 'Diez', idPregunta: null });
    });
  });

  describe('MEJ-99 motivo del rechazo y MEJ-100 línea de tiempo', () => {
    async function postulacion() {
      const lider = await usuario();
      const postulante = await usuario();
      const otro = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto);
      const creada = await pedir('POST', '/postulaciones', postulante.token, { idRolProyecto: r.idRolProyecto, justificacion });
      expect(creada.status).toBe(201);
      return { lider, postulante, otro, p, r, id: creada.body.idPostulacion as number };
    }
    const tipos = (eventos: { tipo: string }[]) => eventos.map((e) => e.tipo);

    it('solo el líder rechaza; exige motivo y, con «Otro», comentario; el estudiante ve motivo, comentario y aviso', async () => {
      const { lider, postulante, otro, id } = await postulacion();

      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, otro.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'HORARIO' })).status).toBe(403);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, postulante.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'HORARIO' })).status).toBe(403);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'RECHAZADA' })).status).toBe(400);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'NO_EXISTE' })).status).toBe(400);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'OTRO' })).status).toBe(400);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'OTRO', comentarioResolucion: 'x'.repeat(501) })).status).toBe(400);
      expect((await prisma.postulacion.findUniqueOrThrow({ where: { idPostulacion: id } })).estadoPostulacion).toBe('PENDIENTE');

      const ok = await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, {
        estadoPostulacion: 'RECHAZADA',
        motivoRechazo: 'OTRO',
        comentarioResolucion: 'Buscamos otro perfil esta vez',
      });
      expect(ok.status).toBe(200);

      const minas = await pedir('GET', '/postulaciones/mis-postulaciones', postulante.token);
      expect(minas.body[0]).toMatchObject({
        estadoPostulacion: 'RECHAZADA',
        motivoRechazo: 'OTRO',
        comentarioResolucion: 'Buscamos otro perfil esta vez',
      });
      expect(tipos(minas.body[0].eventos)).toEqual(['ENVIADA', 'RECHAZADA']);
      const aviso = await prisma.notificacion.findFirstOrThrow({ where: { idUsuario: postulante.idUsuario, tipoNotificacion: 'POSTULACION_RESUELTA' } });
      expect(aviso.mensajeNotificacion).toContain('Motivo: Otro motivo');
      expect(aviso.mensajeNotificacion).toContain('Buscamos otro perfil esta vez');
    });

    it('«vista» se registra una sola vez cuando el líder abre la postulación; el postulante y los demás no la marcan', async () => {
      const { lider, postulante, otro, id } = await postulacion();
      await pedir('GET', `/postulaciones/${id}`, postulante.token);
      await pedir('GET', `/postulaciones/${id}`, otro.token);
      expect(await prisma.eventoPostulacion.count({ where: { idPostulacion: id, tipo: 'VISTA' } })).toBe(0);

      expect((await pedir('GET', `/postulaciones/${id}`, lider.token)).status).toBe(200);
      const primera = await prisma.eventoPostulacion.findFirstOrThrow({ where: { idPostulacion: id, tipo: 'VISTA' } });
      expect((await pedir('GET', `/postulaciones/${id}`, lider.token)).status).toBe(200);
      const eventos = await prisma.eventoPostulacion.findMany({ where: { idPostulacion: id, tipo: 'VISTA' } });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].fecha).toEqual(primera.fecha);
    });

    it('solo el líder marca «en revisión»; la línea de tiempo llega completa y en orden a Mis postulaciones', async () => {
      const { lider, postulante, otro, id } = await postulacion();
      expect((await pedir('POST', `/postulaciones/${id}/en-revision`, otro.token)).status).toBe(403);
      expect((await pedir('POST', `/postulaciones/${id}/en-revision`, postulante.token)).status).toBe(403);
      await pedir('GET', `/postulaciones/${id}`, lider.token);
      expect((await pedir('POST', `/postulaciones/${id}/en-revision`, lider.token)).status).toBe(201);
      expect((await pedir('POST', `/postulaciones/${id}/en-revision`, lider.token)).status).toBe(201);
      expect(await prisma.eventoPostulacion.count({ where: { idPostulacion: id, tipo: 'EN_REVISION' } })).toBe(1);

      await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'RECHAZADA', motivoRechazo: 'CUPO_LLENO' });
      expect((await pedir('POST', `/postulaciones/${id}/en-revision`, lider.token)).status).toBe(400);

      const minas = await pedir('GET', '/postulaciones/mis-postulaciones', postulante.token);
      expect(tipos(minas.body[0].eventos)).toEqual(['ENVIADA', 'VISTA', 'EN_REVISION', 'RECHAZADA']);
    });
  });

  describe('MEJ-96 retirar la postulación', () => {
    it('solo el postulante retira la suya mientras está pendiente; queda RETIRADA, avisa al líder y no se borra', async () => {
      const lider = await usuario();
      const postulante = await usuario();
      const otro = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto);
      const id = (await pedir('POST', '/postulaciones', postulante.token, { idRolProyecto: r.idRolProyecto, justificacion })).body.idPostulacion as number;

      expect((await pedir('DELETE', `/postulaciones/${id}`, otro.token)).status).toBe(403);
      expect((await pedir('DELETE', `/postulaciones/${id}`, lider.token)).status).toBe(403);
      expect((await prisma.postulacion.findUniqueOrThrow({ where: { idPostulacion: id } })).estadoPostulacion).toBe('PENDIENTE');

      const retirada = await pedir('DELETE', `/postulaciones/${id}`, postulante.token);
      expect(retirada.status).toBe(200);
      expect(retirada.body.estadoPostulacion).toBe('RETIRADA');
      const fila = await prisma.postulacion.findUniqueOrThrow({ where: { idPostulacion: id } });
      expect(fila.estadoPostulacion).toBe('RETIRADA');
      expect(fila.fechaResolucion).not.toBeNull();

      const aviso = await prisma.notificacion.findFirstOrThrow({ where: { idUsuario: lider.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION', tituloNotificacion: 'Postulación retirada' } });
      expect(aviso.mensajeNotificacion).toContain('retiró su postulación');

      const minas = await pedir('GET', '/postulaciones/mis-postulaciones', postulante.token);
      expect(minas.body[0].estadoPostulacion).toBe('RETIRADA');
      expect(tipos(minas.body[0].eventos)).toEqual(['ENVIADA', 'RETIRADA']);

      expect((await pedir('DELETE', `/postulaciones/${id}`, postulante.token)).status).toBe(400);
      expect((await pedir('PATCH', `/postulaciones/${id}/estado`, lider.token, { estadoPostulacion: 'ACEPTADA' })).status).toBe(400);

      const delLider = await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones`, lider.token);
      expect(delLider.body).toEqual([]);

      // Retirar no impide volver a postular al mismo rol.
      expect((await pedir('POST', '/postulaciones', postulante.token, { idRolProyecto: r.idRolProyecto, justificacion })).status).toBe(201);
    });

    function tipos(eventos: { tipo: string }[]) {
      return eventos.map((e) => e.tipo);
    }
  });
});
