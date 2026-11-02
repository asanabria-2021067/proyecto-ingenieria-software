import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { createIntegrationHito, createIntegrationProject, createIntegrationProjectRole, createIntegrationUser } from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { accessTokenFor, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { FollowsController } from '../../src/follows/follows.controller';
import { FollowsService } from '../../src/follows/follows.service';
import { RoleInvitationsController } from '../../src/role-invitations/role-invitations.controller';
import { RoleInvitationsService } from '../../src/role-invitations/role-invitations.service';
import { CreateInvitacionRolDto } from '../../src/role-invitations/dto/create-invitacion-rol.dto';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ProjectsService } from '../../src/projects/projects.service';
import { SavedProjectAlertsService } from '../../src/projects/saved-project-alerts.service';
import { avisarProyectoNuevo } from '../../src/projects/new-project-notifications';
import { SocialService } from '../../src/social/social.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { Cache } from 'cache-manager';

/**
 * MEJ-15/16/17/18/19/20/21/22/62 contra PostgreSQL real, por HTTP con el JwtAuthGuard real:
 * seguir organizaciones y asociaciones, invitar a un rol (solo el líder invita, solo el invitado
 * responde), duplicar, «Para ti», filtro por dueño, postulantes por coincidencia y los avisos.
 */
describeIntegration('Descubrimiento — seguir, invitar a un rol, duplicar y Para ti (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  let notifications: NotificationsService;
  let alertas: SavedProjectAlertsService;
  const userIds: number[] = [];
  const orgIds: number[] = [];
  const asociacionIds: number[] = [];
  const habilidadIds: number[] = [];
  const scope: IntegrationCleanupScope = { projectIds: [], roleIds: [], hitoIds: [], participationIds: [] };

  type Respuesta = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  async function pedir(metodo: 'GET' | 'POST' | 'DELETE', ruta: string, token?: string, body?: unknown): Promise<Respuesta> {
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

  async function proyecto(lider: { idUsuario: number }, estadoProyecto: EstadoProyecto = EstadoProyecto.PUBLICADO) {
    const p = await createIntegrationProject(prisma, lider.idUsuario, { estadoProyecto });
    scope.projectIds!.push(p.idProyecto);
    return p;
  }

  async function rol(idProyecto: number, cupos = 1, habilidades: number[] = []) {
    const r = await createIntegrationProjectRole(prisma, idProyecto, { cupos });
    scope.roleIds!.push(r.idRolProyecto);
    for (const idHabilidad of habilidades) {
      await prisma.requisitoHabilidadRol.create({ data: { idRolProyecto: r.idRolProyecto, idHabilidad, nivelMinimo: 'BASICO' } });
    }
    return r;
  }

  async function habilidad() {
    const h = await prisma.habilidad.create({ data: { nombreHabilidad: `Hab ${randomUUID().slice(0, 8)}` } });
    habilidadIds.push(h.idHabilidad);
    return h.idHabilidad;
  }

  async function org(creador: { idUsuario: number }, visibilidad: 'PUBLICA' | 'PRIVADA') {
    const o = await prisma.organizacion.create({
      data: { nombreOrganizacion: `Org ${randomUUID().slice(0, 8)}`, creadaPor: creador.idUsuario, visibilidad },
    });
    orgIds.push(o.idOrganizacion);
    return o.idOrganizacion;
  }

  async function asociacion(archivada = false) {
    const a = await prisma.asociacion.create({ data: { nombre: `Aso ${randomUUID().slice(0, 8)}`, archivada } });
    asociacionIds.push(a.idAsociacion);
    return a.idAsociacion;
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    notifications = new NotificationsService(prismaService, { server: undefined } as unknown as NotificationsGateway);
    const resolver = new ProjectIdResolverService(prismaService);
    const policy = new ProjectPolicyService(resolver);
    const projectTx = new ProjectTransactionService(prismaService);
    const projects = new ProjectsService(
      prismaService,
      notifications,
      { get: async () => undefined, set: async () => undefined, del: async () => undefined } as unknown as Cache,
      projectTx,
      policy,
      new ProjectReadPolicyService(prismaService),
      new SocialService(prismaService, notifications),
    );
    const follows = new FollowsService(prismaService);
    const invitaciones = new RoleInvitationsService(prismaService, notifications, projectTx, policy, { emit: () => true } as never);
    alertas = new SavedProjectAlertsService(prismaService, notifications);

    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        { controller: FollowsController, deps: [FollowsService] },
        { controller: RoleInvitationsController, deps: [RoleInvitationsService], handlers: { invitar: [CreateInvitacionRolDto, Object] } },
        { controller: ProjectsController, deps: [ProjectsService] },
      ],
      providers: [
        { provide: FollowsService, useValue: follows },
        { provide: RoleInvitationsService, useValue: invitaciones },
        { provide: ProjectsService, useValue: projects },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.seguimientoEntidad.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.proyectoGuardado.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.invitacionRolProyecto.deleteMany({ where: { idRolProyecto: { in: scope.roleIds } } });
    await prisma.postulacion.deleteMany({ where: { idRolProyecto: { in: scope.roleIds } } });
    await prisma.proyectoOrganizacion.deleteMany({ where: { idOrganizacion: { in: orgIds } } });
    // Las copias (duplicar) traen sus propios roles, requisitos e hitos.
    const copias = await prisma.proyecto.findMany({ where: { creadoPor: { in: userIds } }, select: { idProyecto: true } });
    const idsProyecto = copias.map((p) => p.idProyecto);
    const roles = await prisma.rolProyecto.findMany({ where: { idProyecto: { in: idsProyecto } }, select: { idRolProyecto: true } });
    const hitos = await prisma.hito.findMany({ where: { idProyecto: { in: idsProyecto } }, select: { idHito: true } });
    const participaciones = await prisma.participacionProyecto.findMany({ where: { idRolProyecto: { in: roles.map((r) => r.idRolProyecto) } }, select: { idParticipacion: true } });
    await prisma.requisitoHabilidadRol.deleteMany({ where: { idRolProyecto: { in: roles.map((r) => r.idRolProyecto) } } });
    await prisma.proyectoInteres.deleteMany({ where: { idProyecto: { in: idsProyecto } } });
    await cleanupIntegrationFixtures(prisma, {
      participationIds: participaciones.map((p) => p.idParticipacion),
      roleIds: roles.map((r) => r.idRolProyecto),
      hitoIds: hitos.map((h) => h.idHito),
      projectIds: idsProyecto,
    });
    await prisma.usuarioHabilidad.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.organizacion.deleteMany({ where: { idOrganizacion: { in: orgIds } } });
    await prisma.asociacion.deleteMany({ where: { idAsociacion: { in: asociacionIds } } });
    await prisma.habilidad.deleteMany({ where: { idHabilidad: { in: habilidadIds } } });
    await prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('todas las rutas nuevas exigen sesión', async () => {
    for (const [metodo, ruta] of [
      ['GET', '/seguimientos/mios'],
      ['POST', '/seguimientos/organizaciones/1'],
      ['GET', '/invitaciones-rol/mias'],
      ['GET', '/invitaciones-rol/sugerencias?habilidades=1'],
      ['GET', '/proyectos/para-ti'],
      ['POST', '/proyectos/1/duplicar'],
    ] as const) {
      expect((await pedir(metodo, ruta)).status, `${metodo} ${ruta}`).toBe(401);
    }
  });

  describe('MEJ-18 seguir organizaciones y asociaciones', () => {
    it('sigue y deja de seguir una organización pública y una asociación; el seguimiento es idempotente', async () => {
      const dueno = await usuario();
      const yo = await usuario();
      const idOrg = await org(dueno, 'PUBLICA');
      const idAso = await asociacion();

      expect((await pedir('POST', `/seguimientos/organizaciones/${idOrg}`, yo.token)).status).toBe(200);
      expect((await pedir('POST', `/seguimientos/organizaciones/${idOrg}`, yo.token)).status).toBe(200);
      expect((await pedir('POST', `/seguimientos/asociaciones/${idAso}`, yo.token)).status).toBe(200);
      expect(await prisma.seguimientoEntidad.count({ where: { idUsuario: yo.idUsuario } })).toBe(2);

      const mios = await pedir('GET', '/seguimientos/mios', yo.token);
      expect(mios.body.organizaciones.map((o: any) => o.idOrganizacion)).toEqual([idOrg]); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(mios.body.asociaciones.map((a: any) => a.idAsociacion)).toEqual([idAso]); // eslint-disable-line @typescript-eslint/no-explicit-any

      const catalogo = await pedir('GET', '/seguimientos/asociaciones', yo.token);
      expect(catalogo.body.find((a: any) => a.idAsociacion === idAso).siguiendo).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any

      expect((await pedir('DELETE', `/seguimientos/organizaciones/${idOrg}`, yo.token)).status).toBe(200);
      expect((await pedir('DELETE', `/seguimientos/asociaciones/${idAso}`, yo.token)).status).toBe(200);
      expect(await prisma.seguimientoEntidad.count({ where: { idUsuario: yo.idUsuario } })).toBe(0);
    });

    it('una organización privada ajena no se puede seguir (404) y una asociación archivada tampoco', async () => {
      const dueno = await usuario();
      const extrano = await usuario();
      const idPrivada = await org(dueno, 'PRIVADA');
      const idArchivada = await asociacion(true);
      expect((await pedir('POST', `/seguimientos/organizaciones/${idPrivada}`, extrano.token)).status).toBe(404);
      expect((await pedir('POST', `/seguimientos/asociaciones/${idArchivada}`, extrano.token)).status).toBe(404);
      expect(await prisma.seguimientoEntidad.count({ where: { idUsuario: extrano.idUsuario } })).toBe(0);
    });

    it('la base impide un seguimiento sin entidad o con las dos a la vez', async () => {
      const yo = await usuario();
      const idOrg = await org(yo, 'PUBLICA');
      const idAso = await asociacion();
      await expect(prisma.seguimientoEntidad.create({ data: { idUsuario: yo.idUsuario } })).rejects.toThrow();
      await expect(prisma.seguimientoEntidad.create({ data: { idUsuario: yo.idUsuario, idOrganizacion: idOrg, idAsociacion: idAso } })).rejects.toThrow();
    });
  });

  describe('MEJ-22 invitar directo a un rol', () => {
    it('el líder invita, solo el invitado responde y aceptar crea la participación y ocupa el cupo', async () => {
      const lider = await usuario();
      const invitado = await usuario();
      const otro = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 1);

      expect((await pedir('POST', '/invitaciones-rol', otro.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario })).status).toBe(403);
      const creada = await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario, mensaje: 'Te necesitamos' });
      expect(creada.status).toBe(201);
      const id = creada.body.idInvitacionRol as number;
      expect((await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario })).status).toBe(409);
      expect(await prisma.notificacion.count({ where: { idUsuario: invitado.idUsuario, tipoNotificacion: 'INVITACION_ROL_PROYECTO' } })).toBe(1);

      expect((await pedir('GET', '/invitaciones-rol/mias', invitado.token)).body).toHaveLength(1);
      expect((await pedir('GET', '/invitaciones-rol/mias', otro.token)).body).toHaveLength(0);
      expect((await pedir('GET', `/invitaciones-rol/proyecto/${p.idProyecto}`, lider.token)).body).toHaveLength(1);
      expect((await pedir('GET', `/invitaciones-rol/proyecto/${p.idProyecto}`, otro.token)).status).toBe(403);

      // Nadie acepta una invitación ajena; ni el propio líder.
      expect((await pedir('POST', `/invitaciones-rol/${id}/aceptar`, otro.token)).status).toBe(404);
      expect((await pedir('POST', `/invitaciones-rol/${id}/aceptar`, lider.token)).status).toBe(404);
      expect(await prisma.participacionProyecto.count({ where: { idRolProyecto: r.idRolProyecto } })).toBe(0);

      const aceptada = await pedir('POST', `/invitaciones-rol/${id}/aceptar`, invitado.token);
      expect(aceptada.status).toBe(200);
      expect(aceptada.body.estado).toBe('ACEPTADA');
      const participacion = await prisma.participacionProyecto.findFirst({ where: { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario } });
      expect(participacion?.estadoParticipacion).toBe('ACTIVO');
      scope.participationIds!.push(participacion!.idParticipacion);
      expect(await prisma.notificacion.count({ where: { idUsuario: lider.idUsuario, tipoNotificacion: 'INVITACION_ROL_PROYECTO' } })).toBe(1);

      // Ya respondida; y el rol quedó lleno.
      expect((await pedir('POST', `/invitaciones-rol/${id}/aceptar`, invitado.token)).status).toBe(409);
      expect((await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: otro.idUsuario })).status).toBe(409);
    });

    it('rechazar no crea participación y la invitación no se vuelve a responder', async () => {
      const lider = await usuario();
      const invitado = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 2);
      const id = (await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario })).body.idInvitacionRol;

      expect((await pedir('POST', `/invitaciones-rol/${id}/rechazar`, invitado.token)).body.estado).toBe('RECHAZADA');
      expect(await prisma.participacionProyecto.count({ where: { idRolProyecto: r.idRolProyecto } })).toBe(0);
      expect((await pedir('POST', `/invitaciones-rol/${id}/aceptar`, invitado.token)).status).toBe(409);
      // Tras rechazar se puede volver a invitar (el índice solo limita las pendientes).
      expect((await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario })).status).toBe(201);
    });

    it('si el cupo se llena antes de aceptar, aceptar falla y la invitación sigue pendiente', async () => {
      const lider = await usuario();
      const invitado = await usuario();
      const ganador = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 1);
      const id = (await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: r.idRolProyecto, idUsuario: invitado.idUsuario })).body.idInvitacionRol;
      const ocupa = await prisma.participacionProyecto.create({ data: { idUsuario: ganador.idUsuario, idRolProyecto: r.idRolProyecto } });
      scope.participationIds!.push(ocupa.idParticipacion);

      expect((await pedir('POST', `/invitaciones-rol/${id}/aceptar`, invitado.token)).status).toBe(409);
      expect((await prisma.invitacionRolProyecto.findUniqueOrThrow({ where: { idInvitacionRol: id } })).estado).toBe('PENDIENTE');
    });

    it('no se invita en un proyecto cerrado ni a una cuenta bloqueada', async () => {
      const lider = await usuario();
      const invitado = await usuario();
      const cerrado = await proyecto(lider, EstadoProyecto.CERRADO);
      const rolCerrado = await rol(cerrado.idProyecto);
      expect((await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: rolCerrado.idRolProyecto, idUsuario: invitado.idUsuario })).status).toBe(409);

      const abierto = await proyecto(lider);
      const rolAbierto = await rol(abierto.idProyecto);
      await prisma.usuario.update({ where: { idUsuario: invitado.idUsuario }, data: { estado: 'BLOQUEADO' } });
      expect((await pedir('POST', '/invitaciones-rol', lider.token, { idRolProyecto: rolAbierto.idRolProyecto, idUsuario: invitado.idUsuario })).status).toBe(404);
    });
  });

  describe('MEJ-62 sugerir a quién invitar', () => {
    it('ordena por coincidencia, deja fuera a quien ya participa y solo lo consulta el líder del proyecto', async () => {
      const lider = await usuario();
      const alto = await usuario();
      const medio = await usuario();
      const ninguno = await usuario();
      const yaParticipa = await usuario();
      const h1 = await habilidad();
      const h2 = await habilidad();
      for (const [u, hs] of [[alto, [h1, h2]], [medio, [h1]], [yaParticipa, [h1, h2]]] as const) {
        await prisma.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `C${randomUUID().slice(0, 8)}` } });
        for (const idHabilidad of hs) await prisma.usuarioHabilidad.create({ data: { idUsuario: u.idUsuario, idHabilidad } });
      }
      await prisma.perfilEstudiante.create({ data: { idUsuario: ninguno.idUsuario, carne: `C${randomUUID().slice(0, 8)}` } });
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 3);
      const part = await prisma.participacionProyecto.create({ data: { idUsuario: yaParticipa.idUsuario, idRolProyecto: r.idRolProyecto } });
      scope.participationIds!.push(part.idParticipacion);

      const sugeridos = await pedir('GET', `/invitaciones-rol/sugerencias?habilidades=${h1},${h2}&proyecto=${p.idProyecto}`, lider.token);
      expect(sugeridos.status).toBe(200);
      expect(sugeridos.body.map((s: any) => [s.idUsuario, s.porcentaje])).toEqual([[alto.idUsuario, 100], [medio.idUsuario, 50]]); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(Object.keys(sugeridos.body[0]).sort()).toEqual(['apellido', 'carrera', 'fotoUrl', 'habilidadesEnComun', 'idUsuario', 'mismaCarrera', 'nombre', 'porcentaje']);

      expect((await pedir('GET', `/invitaciones-rol/sugerencias?habilidades=${h1}&proyecto=${p.idProyecto}`, medio.token)).status).toBe(403);
      // Al crear un rol aún no hay proyecto: cualquiera consulta con las habilidades del formulario.
      expect((await pedir('GET', `/invitaciones-rol/sugerencias?habilidades=${h1}`, ninguno.token)).status).toBe(200);
    });
  });

  describe('MEJ-20 duplicar proyecto', () => {
    it('copia roles, requisitos e hitos como borrador; solo el líder duplica', async () => {
      const lider = await usuario();
      const extrano = await usuario();
      const h = await habilidad();
      const fuente = await proyecto(lider, EstadoProyecto.CERRADO);
      const r = await rol(fuente.idProyecto, 2, [h]);
      const hito = await createIntegrationHito(prisma, fuente.idProyecto, { tituloHito: 'Entrega 1' });
      scope.hitoIds!.push(hito.idHito);
      const integrante = await usuario();
      const part = await prisma.participacionProyecto.create({ data: { idUsuario: integrante.idUsuario, idRolProyecto: r.idRolProyecto } });
      scope.participationIds!.push(part.idParticipacion);

      expect((await pedir('POST', `/proyectos/${fuente.idProyecto}/duplicar`, extrano.token)).status).toBe(403);
      const copia = await pedir('POST', `/proyectos/${fuente.idProyecto}/duplicar`, lider.token);
      expect(copia.status).toBe(201);
      expect(copia.body.estadoProyecto).toBe('BORRADOR');

      const guardada = await prisma.proyecto.findUniqueOrThrow({
        where: { idProyecto: copia.body.idProyecto },
        include: { roles: { include: { requisitos: true, participaciones: true } }, hitos: true, tareas: true },
      });
      expect(guardada.tituloProyecto).toBe(`${fuente.tituloProyecto} (copia)`);
      expect(guardada.creadoPor).toBe(lider.idUsuario);
      expect(guardada.roles).toHaveLength(1);
      expect(guardada.roles[0].cupos).toBe(2);
      expect(guardada.roles[0].requisitos.map((q) => q.idHabilidad)).toEqual([h]);
      expect(guardada.roles[0].participaciones).toHaveLength(0);
      expect(guardada.hitos.map((x) => x.tituloHito)).toEqual(['Entrega 1']);
      expect(guardada.tareas).toHaveLength(0);
      // El original no cambia.
      expect((await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: fuente.idProyecto } })).estadoProyecto).toBe('CERRADO');
    });

    it('un proyecto inexistente responde 404', async () => {
      const lider = await usuario();
      expect((await pedir('POST', '/proyectos/999999999/duplicar', lider.token)).status).toBe(404);
    });
  });

  describe('MEJ-15 Para ti y MEJ-19 filtro por dueño', () => {
    it('ordena por coincidencia con las habilidades, excluye propios y llenos, y filtra por dueño', async () => {
      const lider = await usuario();
      const yo = await usuario();
      const h1 = await habilidad();
      const h2 = await habilidad();
      await prisma.usuarioHabilidad.create({ data: { idUsuario: yo.idUsuario, idHabilidad: h1 } });

      const mitad = await proyecto(lider);
      await rol(mitad.idProyecto, 1, [h1, h2]);
      const total = await proyecto(lider);
      await rol(total.idProyecto, 1, [h1]);
      const sinNada = await proyecto(lider);
      await rol(sinNada.idProyecto, 1, [h2]);
      const lleno = await proyecto(lider);
      const rolLleno = await rol(lleno.idProyecto, 1, [h1]);
      const ocupa = await prisma.participacionProyecto.create({ data: { idUsuario: lider.idUsuario, idRolProyecto: rolLleno.idRolProyecto } });
      scope.participationIds!.push(ocupa.idParticipacion);
      const propio = await proyecto(yo);
      await rol(propio.idProyecto, 1, [h1]);
      const delOrg = await proyecto(lider);
      await rol(delOrg.idProyecto, 1, [h1]);
      const idOrg = await org(lider, 'PUBLICA');
      await prisma.proyectoOrganizacion.create({ data: { idProyecto: delOrg.idProyecto, idOrganizacion: idOrg } });

      const r = await pedir('GET', '/proyectos/para-ti', yo.token);
      expect(r.status).toBe(200);
      const mios = (r.body as Array<{ idProyecto: number; coincidencia: { porcentaje: number; coincideHabilidades: boolean } }>).filter((x) =>
        [mitad, total, sinNada, lleno, propio, delOrg].some((p) => p.idProyecto === x.idProyecto),
      );
      expect(mios.map((x) => [x.idProyecto, x.coincidencia.porcentaje, x.coincidencia.coincideHabilidades]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual(
        [
          [mitad.idProyecto, 50, true],
          [total.idProyecto, 100, true],
          [delOrg.idProyecto, 100, true],
        ].sort((a, b) => Number(a[0]) - Number(b[0])),
      );
      const posicion = (id: number) => (r.body as Array<{ idProyecto: number }>).findIndex((x) => x.idProyecto === id);
      expect(posicion(total.idProyecto)).toBeLessThan(posicion(mitad.idProyecto));

      const soloOrg = await pedir('GET', '/proyectos/para-ti?duenio=ORGANIZACION', yo.token);
      const idsOrg = (soloOrg.body as Array<{ idProyecto: number }>).map((x) => x.idProyecto);
      expect(idsOrg).toContain(delOrg.idProyecto);
      expect(idsOrg).not.toContain(total.idProyecto);

      const personales = await pedir('GET', '/proyectos?duenio=PERSONAL', yo.token);
      const idsPersonales = (personales.body as Array<{ idProyecto: number }>).map((x) => x.idProyecto);
      expect(idsPersonales).not.toContain(delOrg.idProyecto);
      const deOrg = await pedir('GET', '/proyectos?duenio=ORGANIZACION&page=1&limit=50', yo.token);
      const idsDeOrg = (deOrg.body.data as Array<{ idProyecto: number }>).map((x) => x.idProyecto);
      expect(idsDeOrg).toContain(delOrg.idProyecto);
      expect(idsDeOrg).not.toContain(total.idProyecto);
    });
  });

  describe('MEJ-21 postulantes por coincidencia', () => {
    it('trae el % de cada postulante y ordena por él con orden=coincidencia; solo lo ve el líder', async () => {
      const lider = await usuario();
      const fuerte = await usuario();
      const debil = await usuario();
      const h1 = await habilidad();
      const h2 = await habilidad();
      await prisma.usuarioHabilidad.create({ data: { idUsuario: fuerte.idUsuario, idHabilidad: h1 } });
      await prisma.usuarioHabilidad.create({ data: { idUsuario: fuerte.idUsuario, idHabilidad: h2 } });
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 3, [h1, h2]);
      // El débil se postuló después (más reciente), el fuerte antes.
      await prisma.postulacion.create({ data: { idUsuarioPostulante: fuerte.idUsuario, idRolProyecto: r.idRolProyecto, justificacion: 'x'.repeat(40), fechaPostulacion: new Date('2026-11-01T10:00:00Z') } });
      await prisma.postulacion.create({ data: { idUsuarioPostulante: debil.idUsuario, idRolProyecto: r.idRolProyecto, justificacion: 'x'.repeat(40), fechaPostulacion: new Date('2026-11-02T10:00:00Z') } });

      const porFecha = await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones`, lider.token);
      expect(porFecha.body.map((x: any) => x.idUsuarioPostulante)).toEqual([debil.idUsuario, fuerte.idUsuario]); // eslint-disable-line @typescript-eslint/no-explicit-any
      const porMatch = await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones?orden=coincidencia`, lider.token);
      expect(porMatch.body.map((x: any) => [x.idUsuarioPostulante, x.coincidencia.porcentaje])).toEqual([[fuerte.idUsuario, 100], [debil.idUsuario, 0]]); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect((await pedir('GET', `/proyectos/${p.idProyecto}/postulaciones?orden=coincidencia`, debil.token)).status).toBe(403);
    });
  });

  describe('MEJ-16 proyecto nuevo y MEJ-17 guardados', () => {
    it('avisa al publicarse a quien sigue a la organización o comparte carrera, una vez y sin avisar al líder', async () => {
      const lider = await usuario();
      const seguidor = await usuario();
      const deCarrera = await usuario();
      const carrera = await prisma.carrera.create({ data: { nombreCarrera: `Carrera ${randomUUID().slice(0, 6)}` } });
      await prisma.perfilEstudiante.create({ data: { idUsuario: deCarrera.idUsuario, carne: `C${randomUUID().slice(0, 8)}`, idCarrera: carrera.idCarrera } });
      const idOrg = await org(lider, 'PUBLICA');
      await prisma.seguimientoEntidad.create({ data: { idUsuario: seguidor.idUsuario, idOrganizacion: idOrg } });
      const p = await proyecto(lider);
      await prisma.proyectoOrganizacion.create({ data: { idProyecto: p.idProyecto, idOrganizacion: idOrg } });
      const r = await rol(p.idProyecto, 1);
      await prisma.rolProyecto.update({ where: { idRolProyecto: r.idRolProyecto }, data: { idCarreraRequerida: carrera.idCarrera } });

      await prisma.$transaction((tx) => avisarProyectoNuevo(tx, notifications, p.idProyecto));

      const tipo = 'PROYECTO_NUEVO_PARA_TI';
      const sigue = await prisma.notificacion.findMany({ where: { idUsuario: seguidor.idUsuario, tipoNotificacion: tipo } });
      expect(sigue).toHaveLength(1);
      expect(sigue[0].mensajeNotificacion).toContain('que sigues');
      const carreraNotif = await prisma.notificacion.findMany({ where: { idUsuario: deCarrera.idUsuario, tipoNotificacion: tipo } });
      expect(carreraNotif).toHaveLength(1);
      expect(carreraNotif[0].mensajeNotificacion).toContain('tu carrera');
      expect(await prisma.notificacion.count({ where: { idUsuario: lider.idUsuario, tipoNotificacion: tipo } })).toBe(0);
      await prisma.perfilEstudiante.delete({ where: { idUsuario: deCarrera.idUsuario } });
      await prisma.carrera.delete({ where: { idCarrera: carrera.idCarrera } });
    });

    it('avisa a quien guardó cuando quedan 1-2 cupos y al pasar a solicitud de cierre, una sola vez por situación', async () => {
      const lider = await usuario();
      const guardador = await usuario();
      const integrante = await usuario();
      const participante = await usuario();
      const p = await proyecto(lider);
      const r = await rol(p.idProyecto, 3);
      for (const u of [guardador, participante]) {
        await prisma.proyectoGuardado.create({ data: { idUsuario: u.idUsuario, idProyecto: p.idProyecto } });
      }
      const ocupa = await Promise.all([integrante, participante].map((u) => prisma.participacionProyecto.create({ data: { idUsuario: u.idUsuario, idRolProyecto: r.idRolProyecto } })));
      scope.participationIds!.push(...ocupa.map((o) => o.idParticipacion));

      await alertas.ejecutar();
      await alertas.ejecutar();
      const avisos = () => prisma.notificacion.findMany({ where: { idUsuario: guardador.idUsuario, tipoNotificacion: 'PROYECTO_GUARDADO_AVISO' }, orderBy: { idNotificacion: 'asc' } });
      expect(await avisos()).toHaveLength(1);
      expect((await avisos())[0].mensajeNotificacion).toContain('le queda 1 cupo');
      // Quien ya participa no recibe el aviso de lo que guardó.
      expect(await prisma.notificacion.count({ where: { idUsuario: participante.idUsuario, tipoNotificacion: 'PROYECTO_GUARDADO_AVISO' } })).toBe(0);

      await prisma.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE } });
      await alertas.ejecutar();
      await alertas.ejecutar();
      const luego = await avisos();
      expect(luego).toHaveLength(2);
      expect(luego[1].mensajeNotificacion).toContain('solicitud de cierre');
    });
  });
});
