import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { EstadoUsuario, RolOrganizacion, type PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationSprint,
  createIntegrationTask,
  createIntegrationTaskAssignment,
  createIntegrationUser,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { hacerAdministrador } from './setup/admin-meetings';
import { tasksStack } from './setup/tasks-stack';
import { accessTokenFor, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { OrganizationsController } from '../../src/organizations/organizations.controller';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { OrganizationInvitationsService } from '../../src/organizations/organization-invitations.service';
import { OrganizationChatService } from '../../src/organizations/organization-chat.service';
import { CreateOrganizationDto } from '../../src/organizations/dto/create-organization.dto';
import { UpdateOrganizationDto } from '../../src/organizations/dto/update-organization.dto';
import { InviteMemberDto, SearchCandidatesQueryDto } from '../../src/organizations/dto/invite-member.dto';
import { ChangeRoleDto } from '../../src/organizations/dto/change-role.dto';
import { TransferOwnershipDto } from '../../src/organizations/dto/transfer-ownership.dto';
import { SendOrgMessageDto } from '../../src/organizations/dto/send-org-message.dto';
import { ListOrganizationsQueryDto } from '../../src/organizations/dto/list-organizations-query.dto';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ProjectsService } from '../../src/projects/projects.service';
import { CreateProjectFullDto } from '../../src/projects/dto/create-project-full.dto';
import { TasksController } from '../../src/tasks/tasks.controller';
import { TasksService } from '../../src/tasks/tasks.service';
import { TimeRecordsController } from '../../src/time-records/time-records.controller';
import { TimeRecordsService } from '../../src/time-records/time-records.service';
import { ChatService } from '../../src/chat/chat.service';
import { SocialService } from '../../src/social/social.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ProjectTransactionService } from '../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../src/common/project-policy/project-id-resolver.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import type { ChatGateway } from '../../src/chat/chat.gateway';
import type { NotificationsGateway } from '../../src/notifications/notifications.gateway';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { Cache } from 'cache-manager';
import type { ChatStoragePort } from '../../src/storage/chat-storage.port';

/**
 * ORG (Fase 1): organizaciones estilo GitHub contra PostgreSQL real, por HTTP
 * con el JwtAuthGuard, el ProjectWriteGuard, el ValidationPipe y los servicios
 * reales. Cubre las pruebas de permisos obligatorias: Lectura no edita ni crea
 * o mueve tareas ni registra horas; Editor no cambia roles, invita ni
 * transfiere; Admin no quita ni degrada al Propietario; nadie acepta una
 * invitación ajena ni vencida.
 */
describeIntegration('ORG — organizaciones, invitaciones, chat y proyectos (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  const gateway = {
    notifyConversationCreated: vi.fn(),
    removeFromConversation: vi.fn(),
    broadcastMessage: vi.fn(),
  };
  const userIds: number[] = [];
  const scope: IntegrationCleanupScope = { projectIds: [], roleIds: [], participationIds: [], sprintIds: [], taskIds: [], assignmentIds: [] };

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
      // cuerpo vacío (204) o no JSON
    }
    return { status: response.status, body: parsed };
  }

  async function usuario(estado?: EstadoUsuario) {
    const u = await createIntegrationUser(prisma);
    if (estado) await prisma.usuario.update({ where: { idUsuario: u.idUsuario }, data: { estado } });
    userIds.push(u.idUsuario);
    return { ...u, token: accessTokenFor(u) };
  }

  /** Organización creada por la API; el creador es el Propietario. */
  async function crearOrg(propietario: { token: string }, extra: Record<string, unknown> = {}) {
    const r = await pedir('POST', '/organizaciones', propietario.token, { nombreOrganizacion: `Org ${randomUUID().slice(0, 8)}`, ...extra });
    expect(r.status).toBe(201);
    return r.body.idOrganizacion as number;
  }

  /** Alta directa de un miembro con un rol (los flujos de invitación se prueban aparte). */
  async function agregar(idOrganizacion: number, u: { idUsuario: number }, rol: RolOrganizacion) {
    await prisma.usuarioOrganizacion.create({ data: { idOrganizacion, idUsuario: u.idUsuario, rolOrganizacion: rol } });
  }

  const rolDe = async (idOrganizacion: number, idUsuario: number) =>
    (await prisma.usuarioOrganizacion.findUnique({ where: { idUsuario_idOrganizacion: { idUsuario, idOrganizacion } } }))?.rolOrganizacion ?? null;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const notifications = new NotificationsService(prismaService, { server: undefined } as unknown as NotificationsGateway);
    const chatService = new ChatService(prismaService, gateway as unknown as ChatGateway, {} as ChatStoragePort);
    const orgChat = new OrganizationChatService(prismaService, gateway as unknown as ChatGateway, chatService);
    const organizations = new OrganizationsService(prismaService, notifications, orgChat);
    const invitations = new OrganizationInvitationsService(prismaService, notifications, orgChat);

    const resolver = new ProjectIdResolverService(prismaService);
    const projects = new ProjectsService(
      prismaService,
      notifications,
      { get: async () => undefined, set: async () => undefined, del: async () => undefined } as unknown as Cache,
      new ProjectTransactionService(prismaService),
      new ProjectPolicyService(resolver),
      new ProjectReadPolicyService(prismaService),
      new SocialService(prismaService, notifications),
    );
    const { tasks, timeRecords } = tasksStack(prisma);

    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        {
          controller: OrganizationsController,
          deps: [OrganizationsService, OrganizationInvitationsService, OrganizationChatService],
          handlers: {
            create: [CreateOrganizationDto, Object],
            search: [ListOrganizationsQueryDto, Object],
            update: [Number, UpdateOrganizationDto, Object],
            transfer: [Number, TransferOwnershipDto, Object],
            auditLog: [Number, ListOrganizationsQueryDto, Object],
            changeRole: [Number, Number, ChangeRoleDto, Object],
            candidates: [Number, SearchCandidatesQueryDto, Object],
            invite: [Number, InviteMemberDto, Object],
            sendChatMessage: [Number, SendOrgMessageDto, Object],
          },
        },
        { controller: ProjectsController, deps: [ProjectsService], handlers: { create: [CreateProjectFullDto, Object] } },
        { controller: TasksController, deps: [TasksService] },
        { controller: TimeRecordsController, deps: [TimeRecordsService] },
      ],
      providers: [
        { provide: OrganizationsService, useValue: organizations },
        { provide: OrganizationInvitationsService, useValue: invitations },
        { provide: OrganizationChatService, useValue: orgChat },
        { provide: ProjectsService, useValue: projects },
        { provide: TasksService, useValue: tasks },
        { provide: TimeRecordsService, useValue: timeRecords },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
    const orgs = await prisma.organizacion.findMany({ where: { creadaPor: { in: userIds } }, select: { idOrganizacion: true } });
    const idsOrg = orgs.map((o) => o.idOrganizacion);
    const conversaciones = await prisma.conversacion.findMany({ where: { idOrganizacion: { in: idsOrg } }, select: { idConversacion: true } });
    const idsConv = conversaciones.map((c) => c.idConversacion);
    await prisma.mensajeChat.deleteMany({ where: { idConversacion: { in: idsConv } } });
    await prisma.conversacionParticipante.deleteMany({ where: { idConversacion: { in: idsConv } } });
    await prisma.conversacion.deleteMany({ where: { idConversacion: { in: idsConv } } });
    await prisma.invitacionOrganizacion.deleteMany({ where: { idOrganizacion: { in: idsOrg } } });
    await prisma.solicitudUnirseOrganizacion.deleteMany({ where: { idOrganizacion: { in: idsOrg } } });
    await prisma.proyectoOrganizacion.deleteMany({ where: { idOrganizacion: { in: idsOrg } } });
    await prisma.usuarioOrganizacion.deleteMany({ where: { idOrganizacion: { in: idsOrg } } });
    await prisma.organizacion.deleteMany({ where: { idOrganizacion: { in: idsOrg } } });
    await prisma.notificacion.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } });
    // Los proyectos creados por la API traen sus roles; las participaciones y la caché de horas se limpian por proyecto.
    const roles = await prisma.rolProyecto.findMany({ where: { idProyecto: { in: scope.projectIds } }, select: { idRolProyecto: true } });
    scope.roleIds = roles.map((r) => r.idRolProyecto);
    const participaciones = await prisma.participacionProyecto.findMany({ where: { idRolProyecto: { in: scope.roleIds } }, select: { idParticipacion: true } });
    scope.participationIds = participaciones.map((p) => p.idParticipacion);
    const tareas = await prisma.tarea.findMany({ where: { idProyecto: { in: scope.projectIds } }, select: { idTarea: true } });
    scope.taskIds = tareas.map((t) => t.idTarea);
    const asignaciones = await prisma.asignacionTarea.findMany({ where: { idTarea: { in: scope.taskIds } }, select: { idAsignacion: true } });
    scope.assignmentIds = asignaciones.map((a) => a.idAsignacion);
    await prisma.horasParticipacion.deleteMany({ where: { idParticipacion: { in: scope.participationIds } } });
    await prisma.registroAvanceAsignacion.deleteMany({ where: { idAsignacion: { in: scope.assignmentIds } } });
    scope.userIds = userIds;
    await cleanupIntegrationFixtures(prisma, scope);
    await prisma.$disconnect();
  });

  // ─── Crear ───────────────────────────────────────────────────────────────

  it('cualquier usuario activo crea una organización y queda como único Propietario, con #general', async () => {
    const ana = await usuario();
    const r = await pedir('POST', '/organizaciones', ana.token, {
      nombreOrganizacion: `Club ${randomUUID().slice(0, 8)}`,
      descripcionOrganizacion: 'Grupo de estudio',
      sitioWeb: 'https://ejemplo.org',
    });

    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ miRol: 'PROPIETARIO', visibilidad: 'PRIVADA', archivada: false, puedePublicar: true });
    expect(await rolDe(r.body.idOrganizacion, ana.idUsuario)).toBe('PROPIETARIO');

    const chat = await pedir('GET', `/organizaciones/${r.body.idOrganizacion}/chat`, ana.token);
    expect(chat.status).toBe(200);
    expect(chat.body).toMatchObject({ nombre: 'general', archivada: false });
    expect(chat.body.miembros.map((m: { idUsuario: number }) => m.idUsuario)).toEqual([ana.idUsuario]);
  });

  it('el nombre es único sin distinguir mayúsculas', async () => {
    const ana = await usuario();
    const nombre = `Unica ${randomUUID().slice(0, 8)}`;
    expect((await pedir('POST', '/organizaciones', ana.token, { nombreOrganizacion: nombre })).status).toBe(201);
    const otra = await usuario();
    const repetida = await pedir('POST', '/organizaciones', otra.token, { nombreOrganizacion: nombre.toUpperCase() });
    expect(repetida.status).toBe(409);
  });

  it('el logo debe ser una URL de Cloudinary y el sitio web http(s)', async () => {
    const ana = await usuario();
    const base = { nombreOrganizacion: `Logo ${randomUUID().slice(0, 8)}` };
    expect((await pedir('POST', '/organizaciones', ana.token, { ...base, logoUrl: 'https://evil.example/logo.png' })).status).toBe(400);
    expect((await pedir('POST', '/organizaciones', ana.token, { ...base, sitioWeb: 'javascript:alert(1)' })).status).toBe(400);
    const ok = await pedir('POST', '/organizaciones', ana.token, { ...base, logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png' });
    expect(ok.status).toBe(201);
  });

  it('sin token no se accede a ninguna ruta', async () => {
    expect((await pedir('GET', '/organizaciones/mias')).status).toBe(401);
    expect((await pedir('POST', '/organizaciones', undefined, { nombreOrganizacion: 'Sin sesión' })).status).toBe(401);
  });

  // ─── Visibilidad ─────────────────────────────────────────────────────────

  it('una privada solo existe para sus miembros; una pública se ve sin la lista de miembros', async () => {
    const dueno = await usuario();
    const ajeno = await usuario();
    const privada = await crearOrg(dueno);
    const publica = await crearOrg(dueno, { visibilidad: 'PUBLICA' });

    expect((await pedir('GET', `/organizaciones/${privada}`, ajeno.token)).status).toBe(404);
    expect((await pedir('GET', `/organizaciones/${privada}`, dueno.token)).status).toBe(200);

    const vistaPublica = await pedir('GET', `/organizaciones/${publica}`, ajeno.token);
    expect(vistaPublica.status).toBe(200);
    expect(vistaPublica.body).toMatchObject({ miRol: null, totalMiembros: 1, miembros: null, invitacionesPendientes: null });
    const vistaMiembro = await pedir('GET', `/organizaciones/${publica}`, dueno.token);
    expect(vistaMiembro.body.miembros).toHaveLength(1);
  });

  it('el buscador solo lista organizaciones públicas y activas', async () => {
    const dueno = await usuario();
    const clave = randomUUID().slice(0, 8);
    const publica = await crearOrg(dueno, { visibilidad: 'PUBLICA', nombreOrganizacion: `Buscable ${clave}` });
    await crearOrg(dueno, { nombreOrganizacion: `Buscable privada ${clave}` });
    const archivada = await crearOrg(dueno, { visibilidad: 'PUBLICA', nombreOrganizacion: `Buscable archivada ${clave}` });
    await pedir('POST', `/organizaciones/${archivada}/archivar`, dueno.token);

    const visitante = await usuario();
    const r = await pedir('GET', `/organizaciones/buscar?q=${clave}`, visitante.token);
    expect(r.status).toBe(200);
    expect(r.body.data.map((o: { idOrganizacion: number }) => o.idOrganizacion)).toEqual([publica]);
    expect(r.body.data[0]).toMatchObject({ miRol: null, solicitudPendiente: false, totalMiembros: 1 });
  });

  it('solo el Propietario cambia la visibilidad', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');

    expect((await pedir('PATCH', `/organizaciones/${org}`, admin.token, { visibilidad: 'PUBLICA' })).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}`, admin.token, { descripcionOrganizacion: 'Nueva' })).status).toBe(200);
    expect((await pedir('PATCH', `/organizaciones/${org}`, dueno.token, { visibilidad: 'PUBLICA' })).body.visibilidad).toBe('PUBLICA');
  });

  // ─── Permisos obligatorios ───────────────────────────────────────────────

  it('Lectura no edita la organización', async () => {
    const dueno = await usuario();
    const lector = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, lector, 'LECTURA');

    expect((await pedir('PATCH', `/organizaciones/${org}`, lector.token, { nombreOrganizacion: 'Cambiado por lector' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, lector.token, { idUsuario: dueno.idUsuario, rolOrganizacion: 'LECTURA' })).status).toBe(403);
    expect((await pedir('GET', `/organizaciones/${org}/bitacora`, lector.token)).status).toBe(403);
    const intacta = await prisma.organizacion.findUniqueOrThrow({ where: { idOrganizacion: org } });
    expect(intacta.nombreOrganizacion).not.toBe('Cambiado por lector');
  });

  it('Editor no cambia roles, no invita, no transfiere ni archiva', async () => {
    const dueno = await usuario();
    const editor = await usuario();
    const lector = await usuario();
    const candidato = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, editor, 'EDITOR');
    await agregar(org, lector, 'LECTURA');

    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${lector.idUsuario}`, editor.token, { rolOrganizacion: 'EDITOR' })).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${editor.idUsuario}`, editor.token, { rolOrganizacion: 'ADMINISTRADOR' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, editor.token, { idUsuario: candidato.idUsuario, rolOrganizacion: 'LECTURA' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/transferir`, editor.token, { idUsuario: editor.idUsuario, confirmar: true })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/archivar`, editor.token)).status).toBe(403);
    expect((await pedir('DELETE', `/organizaciones/${org}/miembros/${lector.idUsuario}`, editor.token)).status).toBe(403);

    expect(await rolDe(org, lector.idUsuario)).toBe('LECTURA');
    expect(await rolDe(org, editor.idUsuario)).toBe('EDITOR');
    expect(await rolDe(org, dueno.idUsuario)).toBe('PROPIETARIO');
  });

  it('Admin no quita ni degrada al Propietario, ni toca a otros administradores, ni nombra administradores', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const otroAdmin = await usuario();
    const editor = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');
    await agregar(org, otroAdmin, 'ADMINISTRADOR');
    await agregar(org, editor, 'EDITOR');

    expect((await pedir('DELETE', `/organizaciones/${org}/miembros/${dueno.idUsuario}`, admin.token)).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${dueno.idUsuario}`, admin.token, { rolOrganizacion: 'LECTURA' })).status).toBe(403);
    expect((await pedir('DELETE', `/organizaciones/${org}/miembros/${otroAdmin.idUsuario}`, admin.token)).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${otroAdmin.idUsuario}`, admin.token, { rolOrganizacion: 'EDITOR' })).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${editor.idUsuario}`, admin.token, { rolOrganizacion: 'ADMINISTRADOR' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/transferir`, admin.token, { idUsuario: admin.idUsuario, confirmar: true })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/archivar`, admin.token)).status).toBe(403);

    expect(await rolDe(org, dueno.idUsuario)).toBe('PROPIETARIO');
    expect(await rolDe(org, otroAdmin.idUsuario)).toBe('ADMINISTRADOR');
    expect(await rolDe(org, editor.idUsuario)).toBe('EDITOR');

    // Lo que sí puede: pasar un Editor a Lectura y quitarlo.
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${editor.idUsuario}`, admin.token, { rolOrganizacion: 'LECTURA' })).status).toBe(200);
    expect((await pedir('DELETE', `/organizaciones/${org}/miembros/${editor.idUsuario}`, admin.token)).status).toBe(204);
    expect(await rolDe(org, editor.idUsuario)).toBeNull();
  });

  it('nadie se sube de rol solo ni se vuelve Propietario', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');

    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${admin.idUsuario}`, admin.token, { rolOrganizacion: 'ADMINISTRADOR' })).status).toBe(403);
    // PROPIETARIO no es un rol asignable: el DTO lo rechaza.
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${admin.idUsuario}`, dueno.token, { rolOrganizacion: 'PROPIETARIO' })).status).toBe(400);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: (await usuario()).idUsuario, rolOrganizacion: 'PROPIETARIO' })).status).toBe(400);
    expect(await prisma.usuarioOrganizacion.count({ where: { idOrganizacion: org, rolOrganizacion: 'PROPIETARIO' } })).toBe(1);
  });

  // ─── Invitaciones ────────────────────────────────────────────────────────

  it('invitar notifica al invitado y aceptar lo admite con el rol elegido y en #general', async () => {
    const dueno = await usuario();
    const invitado = await usuario();
    const org = await crearOrg(dueno);

    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { correo: invitado.correo.toUpperCase(), rolOrganizacion: 'EDITOR' });
    expect(invitacion.status).toBe(201);
    const dias = (new Date(invitacion.body.venceEn).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(13.9);
    expect(dias).toBeLessThanOrEqual(14);

    const aviso = await prisma.notificacion.findFirst({ where: { idUsuario: invitado.idUsuario, tipoNotificacion: 'INVITACION_ORGANIZACION' } });
    expect(aviso).not.toBeNull();
    const mias = await pedir('GET', '/organizaciones/invitaciones/mias', invitado.token);
    expect(mias.body.map((i: { idInvitacion: number }) => i.idInvitacion)).toEqual([invitacion.body.idInvitacion]);

    const aceptada = await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, invitado.token);
    expect(aceptada.status).toBe(200);
    expect(await rolDe(org, invitado.idUsuario)).toBe('EDITOR');
    const chat = await pedir('GET', `/organizaciones/${org}/chat`, invitado.token);
    expect(chat.body.miembros.map((m: { idUsuario: number }) => m.idUsuario).sort()).toEqual([dueno.idUsuario, invitado.idUsuario].sort());
    const avisoAlInvitador = await prisma.notificacion.findFirst({ where: { idUsuario: dueno.idUsuario, tipoNotificacion: 'ORGANIZACION_ACTUALIZADA' } });
    expect(avisoAlInvitador).not.toBeNull();
    // Ya resuelta: no se acepta dos veces.
    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, invitado.token)).status).toBe(409);
  });

  it('nadie acepta ni rechaza una invitación ajena', async () => {
    const dueno = await usuario();
    const invitado = await usuario();
    const intruso = await usuario();
    const org = await crearOrg(dueno);
    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'ADMINISTRADOR' });

    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, intruso.token)).status).toBe(404);
    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/rechazar`, intruso.token)).status).toBe(404);
    // Ni siquiera quien invitó puede aceptar en nombre del invitado.
    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, dueno.token)).status).toBe(404);

    expect(await rolDe(org, intruso.idUsuario)).toBeNull();
    expect(await rolDe(org, invitado.idUsuario)).toBeNull();
    const intacta = await prisma.invitacionOrganizacion.findUniqueOrThrow({ where: { idInvitacion: invitacion.body.idInvitacion } });
    expect(intacta.estado).toBe('PENDIENTE');
  });

  it('nadie acepta una invitación vencida y una vencida no bloquea invitar de nuevo', async () => {
    const dueno = await usuario();
    const invitado = await usuario();
    const org = await crearOrg(dueno);
    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'LECTURA' });
    await prisma.invitacionOrganizacion.update({ where: { idInvitacion: invitacion.body.idInvitacion }, data: { venceEn: new Date(Date.now() - 1000) } });

    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, invitado.token)).status).toBe(409);
    expect(await rolDe(org, invitado.idUsuario)).toBeNull();
    expect((await pedir('GET', '/organizaciones/invitaciones/mias', invitado.token)).body).toEqual([]);

    const nueva = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'LECTURA' });
    expect(nueva.status).toBe(201);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'LECTURA' })).status).toBe(409);
  });

  it('rechazar la invitación no admite a nadie; invitar es solo a usuarios activos que no son administradores del sistema', async () => {
    const dueno = await usuario();
    const invitado = await usuario();
    const org = await crearOrg(dueno);
    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'LECTURA' });
    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/rechazar`, invitado.token)).status).toBe(200);
    expect(await rolDe(org, invitado.idUsuario)).toBeNull();

    const sistema = await usuario();
    await hacerAdministrador(prisma, sistema.idUsuario);
    const bloqueado = await usuario('BLOQUEADO');
    const pendiente = await usuario('PENDIENTE_VERIFICACION');
    const inactivo = await usuario('INACTIVO');
    for (const prohibido of [sistema, bloqueado, pendiente, inactivo]) {
      const r = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: prohibido.idUsuario, rolOrganizacion: 'LECTURA' });
      expect(r.status).toBe(400);
    }
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { correo: 'no-existe@example.test', rolOrganizacion: 'LECTURA' })).status).toBe(400);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: dueno.idUsuario, rolOrganizacion: 'LECTURA' })).status).toBe(400);
    expect(await prisma.invitacionOrganizacion.count({ where: { idOrganizacion: org, estado: 'PENDIENTE' } })).toBe(0);
  });

  it('solo el Propietario invita administradores y la invitación pierde validez si quien invitó dejó de poder hacerlo', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const invitado = await usuario();
    const otro = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');

    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, admin.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'ADMINISTRADOR' })).status).toBe(403);
    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, admin.token, { idUsuario: otro.idUsuario, rolOrganizacion: 'EDITOR' });
    expect(invitacion.status).toBe(201);
    await pedir('DELETE', `/organizaciones/${org}/miembros/${admin.idUsuario}`, dueno.token);

    expect((await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, otro.token)).status).toBe(409);
    expect(await rolDe(org, otro.idUsuario)).toBeNull();
  });

  it('el candidato se busca por nombre o correo y excluye a miembros y administradores del sistema', async () => {
    const dueno = await usuario();
    const clave = randomUUID().slice(0, 8);
    const buscado = await createIntegrationUser(prisma, { nombre: `Zoe${clave}`, apellido: 'Pérez' });
    userIds.push(buscado.idUsuario);
    const sistema = await createIntegrationUser(prisma, { nombre: `Zoe${clave}`, apellido: 'Admin' });
    userIds.push(sistema.idUsuario);
    await hacerAdministrador(prisma, sistema.idUsuario);
    const org = await crearOrg(dueno);

    const r = await pedir('GET', `/organizaciones/${org}/candidatos?q=zoe${clave}`, dueno.token);
    expect(r.body.map((u: { idUsuario: number }) => u.idUsuario)).toEqual([buscado.idUsuario]);
    await agregar(org, buscado, 'LECTURA');
    expect((await pedir('GET', `/organizaciones/${org}/candidatos?q=zoe${clave}`, dueno.token)).body).toEqual([]);
    expect((await pedir('GET', `/organizaciones/${org}/candidatos?q=zo`, dueno.token)).body).toEqual([]);
    expect((await pedir('GET', `/organizaciones/${org}/candidatos?q=zoe${clave}`, (await usuario()).token)).status).toBe(404);
  });

  // ─── Solicitudes de unirse ───────────────────────────────────────────────

  it('solicitar unirse a una pública notifica a Propietario y administradores; aceptar admite como Lectura', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const editor = await usuario();
    const aspirante = await usuario();
    const org = await crearOrg(dueno, { visibilidad: 'PUBLICA' });
    await agregar(org, admin, 'ADMINISTRADOR');
    await agregar(org, editor, 'EDITOR');

    const solicitud = await pedir('POST', `/organizaciones/${org}/solicitudes`, aspirante.token);
    expect(solicitud.status).toBe(201);
    expect((await pedir('POST', `/organizaciones/${org}/solicitudes`, aspirante.token)).status).toBe(409);

    const avisados = await prisma.notificacion.findMany({ where: { tipoNotificacion: 'SOLICITUD_UNIRSE_ORGANIZACION', idUsuario: { in: [dueno.idUsuario, admin.idUsuario, editor.idUsuario] } } });
    expect(avisados.map((n) => n.idUsuario).sort()).toEqual([dueno.idUsuario, admin.idUsuario].sort());
    expect((await pedir('GET', `/organizaciones/${org}`, aspirante.token)).body.solicitudPendiente).toBe(true);

    // Un Editor no la resuelve ni la ve; el aspirante tampoco se acepta solo.
    expect((await pedir('POST', `/organizaciones/${org}/solicitudes/${solicitud.body.idSolicitud}/aceptar`, editor.token)).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/solicitudes/${solicitud.body.idSolicitud}/aceptar`, aspirante.token)).status).toBe(403);
    expect((await pedir('GET', `/organizaciones/${org}/solicitudes`, editor.token)).status).toBe(403);

    const lista = await pedir('GET', `/organizaciones/${org}/solicitudes`, admin.token);
    expect(lista.body.map((s: { idSolicitud: number }) => s.idSolicitud)).toEqual([solicitud.body.idSolicitud]);
    expect((await pedir('POST', `/organizaciones/${org}/solicitudes/${solicitud.body.idSolicitud}/aceptar`, admin.token)).status).toBe(200);
    expect(await rolDe(org, aspirante.idUsuario)).toBe('LECTURA');
    expect(await prisma.notificacion.count({ where: { idUsuario: aspirante.idUsuario, tipoNotificacion: 'ORGANIZACION_ACTUALIZADA' } })).toBe(1);
  });

  it('rechazar, vencer y las organizaciones privadas o archivadas no admiten solicitudes', async () => {
    const dueno = await usuario();
    const aspirante = await usuario();
    const publica = await crearOrg(dueno, { visibilidad: 'PUBLICA' });
    const privada = await crearOrg(dueno);
    const archivada = await crearOrg(dueno, { visibilidad: 'PUBLICA' });
    await pedir('POST', `/organizaciones/${archivada}/archivar`, dueno.token);

    expect((await pedir('POST', `/organizaciones/${privada}/solicitudes`, aspirante.token)).status).toBe(404);
    expect((await pedir('POST', `/organizaciones/${archivada}/solicitudes`, aspirante.token)).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${publica}/solicitudes`, dueno.token)).status).toBe(409);

    const solicitud = await pedir('POST', `/organizaciones/${publica}/solicitudes`, aspirante.token);
    expect((await pedir('POST', `/organizaciones/${publica}/solicitudes/${solicitud.body.idSolicitud}/rechazar`, dueno.token)).status).toBe(200);
    expect(await rolDe(publica, aspirante.idUsuario)).toBeNull();

    const segunda = await pedir('POST', `/organizaciones/${publica}/solicitudes`, aspirante.token);
    expect(segunda.status).toBe(201);
    await prisma.solicitudUnirseOrganizacion.update({ where: { idSolicitud: segunda.body.idSolicitud }, data: { venceEn: new Date(Date.now() - 1000) } });
    expect((await pedir('POST', `/organizaciones/${publica}/solicitudes/${segunda.body.idSolicitud}/aceptar`, dueno.token)).status).toBe(409);
    expect(await rolDe(publica, aspirante.idUsuario)).toBeNull();
    expect((await pedir('POST', `/organizaciones/${publica}/solicitudes`, aspirante.token)).status).toBe(201);
  });

  // ─── Ciclo de vida y bitácora ────────────────────────────────────────────

  it('salir: el Propietario no puede, un miembro sí y pierde el acceso al chat', async () => {
    const dueno = await usuario();
    const miembro = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, miembro, 'LECTURA');
    expect((await pedir('GET', `/organizaciones/${org}/chat`, miembro.token)).status).toBe(200);

    expect((await pedir('POST', `/organizaciones/${org}/salir`, dueno.token)).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/salir`, miembro.token)).status).toBe(204);
    expect(await rolDe(org, miembro.idUsuario)).toBeNull();
    expect((await pedir('GET', `/organizaciones/${org}/chat`, miembro.token)).status).toBe(404);
    const general = await prisma.conversacion.findFirstOrThrow({ where: { idOrganizacion: org, nombreCanal: 'general' }, include: { participantes: true } });
    expect(general.participantes.map((p) => p.idUsuario)).toEqual([dueno.idUsuario]);
  });

  it('transferir la propiedad exige confirmación, un miembro activo y deja exactamente un Propietario', async () => {
    const dueno = await usuario();
    const heredero = await usuario();
    const ajeno = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, heredero, 'EDITOR');

    expect((await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: heredero.idUsuario })).status).toBe(400);
    expect((await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: heredero.idUsuario, confirmar: false })).status).toBe(400);
    expect((await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: ajeno.idUsuario, confirmar: true })).status).toBe(404);
    expect((await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: dueno.idUsuario, confirmar: true })).status).toBe(400);

    expect((await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: heredero.idUsuario, confirmar: true })).status).toBe(200);
    expect(await rolDe(org, heredero.idUsuario)).toBe('PROPIETARIO');
    expect(await rolDe(org, dueno.idUsuario)).toBe('ADMINISTRADOR');
    expect(await prisma.usuarioOrganizacion.count({ where: { idOrganizacion: org, rolOrganizacion: 'PROPIETARIO' } })).toBe(1);
    // El Propietario anterior ya no puede transferir ni archivar.
    expect((await pedir('POST', `/organizaciones/${org}/archivar`, dueno.token)).status).toBe(403);
  });

  it('el índice único impide dos Propietarios activos aunque se salte el servicio', async () => {
    const dueno = await usuario();
    const otro = await usuario();
    const org = await crearOrg(dueno);
    await expect(prisma.usuarioOrganizacion.create({ data: { idOrganizacion: org, idUsuario: otro.idUsuario, rolOrganizacion: 'PROPIETARIO' } })).rejects.toThrow();
  });

  it('archivar deja la organización en solo lectura: nada se edita, invita, publica ni se escribe, pero se consulta', async () => {
    const dueno = await usuario();
    const miembro = await usuario();
    const org = await crearOrg(dueno, { visibilidad: 'PUBLICA' });
    await agregar(org, miembro, 'EDITOR');
    const pendiente = await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: (await usuario()).idUsuario, rolOrganizacion: 'LECTURA' });

    expect((await pedir('POST', `/organizaciones/${org}/archivar`, dueno.token)).status).toBe(200);
    expect((await pedir('POST', `/organizaciones/${org}/archivar`, dueno.token)).status).toBe(409);

    expect((await pedir('PATCH', `/organizaciones/${org}`, dueno.token, { descripcionOrganizacion: 'x' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/invitaciones`, dueno.token, { idUsuario: (await usuario()).idUsuario, rolOrganizacion: 'LECTURA' })).status).toBe(403);
    expect((await pedir('PATCH', `/organizaciones/${org}/miembros/${miembro.idUsuario}`, dueno.token, { rolOrganizacion: 'LECTURA' })).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/chat/mensajes`, miembro.token, { contenido: 'hola' })).status).toBe(403);
    const invitacion = await prisma.invitacionOrganizacion.findUniqueOrThrow({ where: { idInvitacion: pendiente.body.idInvitacion } });
    expect(invitacion.estado).toBe('CANCELADA');

    const detalle = await pedir('GET', `/organizaciones/${org}`, miembro.token);
    expect(detalle.body).toMatchObject({ archivada: true, puedePublicar: false });
    expect((await pedir('GET', `/organizaciones/${org}/chat/mensajes`, miembro.token)).status).toBe(200);
    expect((await pedir('POST', `/organizaciones/${org}/salir`, miembro.token)).status).toBe(204);

    // Un Editor de una archivada ya no publica proyectos a su nombre.
    const intento = await pedir('POST', '/proyectos', dueno.token, proyectoBody({ idOrganizacion: org }));
    expect(intento.status).toBe(403);
  });

  it('todo cambio queda en la bitácora de auditoría, visible solo para Propietario y administradores', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const invitado = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');
    await pedir('PATCH', `/organizaciones/${org}`, dueno.token, { descripcionOrganizacion: 'Auditada' });
    const invitacion = await pedir('POST', `/organizaciones/${org}/invitaciones`, admin.token, { idUsuario: invitado.idUsuario, rolOrganizacion: 'EDITOR' });
    await pedir('POST', `/organizaciones/invitaciones/${invitacion.body.idInvitacion}/aceptar`, invitado.token);
    await pedir('PATCH', `/organizaciones/${org}/miembros/${invitado.idUsuario}`, admin.token, { rolOrganizacion: 'LECTURA' });
    await pedir('DELETE', `/organizaciones/${org}/miembros/${invitado.idUsuario}`, admin.token);
    await pedir('POST', `/organizaciones/${org}/transferir`, dueno.token, { idUsuario: admin.idUsuario, confirmar: true });
    await pedir('POST', `/organizaciones/${org}/archivar`, admin.token);

    const r = await pedir('GET', `/organizaciones/${org}/bitacora?limit=50`, admin.token);
    expect(r.status).toBe(200);
    expect(r.body.data.map((e: { accion: string }) => e.accion).reverse()).toEqual([
      'ORG_CREADA',
      'ORG_EDITADA',
      'ORG_INVITACION_ENVIADA',
      'ORG_INVITACION_ACEPTADA',
      'ORG_ROL_CAMBIADO',
      'ORG_MIEMBRO_QUITADO',
      'ORG_PROPIEDAD_TRANSFERIDA',
      'ORG_ARCHIVADA',
    ]);
    expect(r.body.data[0].usuario.idUsuario).toBe(admin.idUsuario);
    expect((await pedir('GET', `/organizaciones/${org}/bitacora`, invitado.token)).status).toBe(404);
  });

  it('mis organizaciones lista solo aquellas donde soy miembro, con mi rol', async () => {
    const dueno = await usuario();
    const yo = await usuario();
    const org = await crearOrg(dueno);
    await crearOrg(dueno);
    await agregar(org, yo, 'EDITOR');

    const r = await pedir('GET', '/organizaciones/mias', yo.token);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ idOrganizacion: org, miRol: 'EDITOR', puedePublicar: true, totalMiembros: 2 });
  });

  // ─── Chat de la organización ─────────────────────────────────────────────

  it('todos los miembros, Lectura incluido, leen y escriben en #general; un ajeno no', async () => {
    const dueno = await usuario();
    const lector = await usuario();
    const ajeno = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, lector, 'LECTURA');

    const enviado = await pedir('POST', `/organizaciones/${org}/chat/mensajes`, lector.token, { contenido: '  Hola equipo  ' });
    expect(enviado.status).toBe(201);
    expect(enviado.body).toMatchObject({ contenido: 'Hola equipo', remitente: { idUsuario: lector.idUsuario } });
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(expect.any(Number), [dueno.idUsuario], expect.objectContaining({ contenido: 'Hola equipo' }));

    const leidos = await pedir('GET', `/organizaciones/${org}/chat/mensajes`, dueno.token);
    expect(leidos.body.map((m: { contenido: string }) => m.contenido)).toEqual(['Hola equipo']);

    expect((await pedir('POST', `/organizaciones/${org}/chat/mensajes`, dueno.token, { contenido: '' })).status).toBe(400);
    expect((await pedir('GET', `/organizaciones/${org}/chat`, ajeno.token)).status).toBe(404);
    expect((await pedir('GET', `/organizaciones/${org}/chat/mensajes`, ajeno.token)).status).toBe(404);
    expect((await pedir('POST', `/organizaciones/${org}/chat/mensajes`, ajeno.token, { contenido: 'intruso' })).status).toBe(404);
  });

  it('en una pública, un no miembro tampoco entra al chat', async () => {
    const dueno = await usuario();
    const visitante = await usuario();
    const org = await crearOrg(dueno, { visibilidad: 'PUBLICA' });
    expect((await pedir('GET', `/organizaciones/${org}/chat/mensajes`, visitante.token)).status).toBe(403);
    expect((await pedir('POST', `/organizaciones/${org}/chat/mensajes`, visitante.token, { contenido: 'hola' })).status).toBe(403);
  });

  // ─── Proyectos de la organización ────────────────────────────────────────

  const proyectoBody = (extra: Record<string, unknown> = {}) => ({
    tituloProyecto: `Proyecto ${randomUUID().slice(0, 8)}`,
    descripcionProyecto: 'Descripción del proyecto con más de veinte caracteres.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    modalidadProyecto: 'VIRTUAL',
    accion: 'BORRADOR',
    roles: [{ nombreRol: 'Desarrollo', cupos: 6 }],
    ...extra,
  });

  async function crearProyecto(token: string, extra: Record<string, unknown> = {}) {
    const r = await pedir('POST', '/proyectos', token, proyectoBody(extra));
    if (r.status === 201) scope.projectIds!.push(r.body.idProyecto);
    return r;
  }

  it('crear un proyecto a nombre de la organización exige Propietario, Administrador o Editor activo', async () => {
    const dueno = await usuario();
    const admin = await usuario();
    const editor = await usuario();
    const lector = await usuario();
    const ajeno = await usuario();
    const otraOrg = await crearOrg(await usuario());
    const org = await crearOrg(dueno);
    await agregar(org, admin, 'ADMINISTRADOR');
    await agregar(org, editor, 'EDITOR');
    await agregar(org, lector, 'LECTURA');

    for (const publica of [dueno, admin, editor]) {
      const r = await crearProyecto(publica.token, { idOrganizacion: org });
      expect(r.status).toBe(201);
      expect(await prisma.proyectoOrganizacion.count({ where: { idProyecto: r.body.idProyecto, idOrganizacion: org } })).toBe(1);
    }
    for (const sinPermiso of [lector, ajeno]) {
      expect((await pedir('POST', '/proyectos', sinPermiso.token, proyectoBody({ idOrganizacion: org }))).status).toBe(403);
      expect((await pedir('POST', '/proyectos', sinPermiso.token, proyectoBody({ organizacionesIds: [org] }))).status).toBe(403);
    }
    // Ni una organización ajena, ni mezclar una propia con una ajena.
    expect((await pedir('POST', '/proyectos', editor.token, proyectoBody({ idOrganizacion: otraOrg }))).status).toBe(403);
    expect((await pedir('POST', '/proyectos', editor.token, proyectoBody({ organizacionesIds: [org, otraOrg] }))).status).toBe(403);
    // Personal: sin organización.
    const personal = await crearProyecto(lector.token);
    expect(personal.status).toBe(201);
    expect(await prisma.proyectoOrganizacion.count({ where: { idProyecto: personal.body.idProyecto } })).toBe(0);
  });

  it('los miembros elegidos entran como participantes activos y ocupan cupos: 6 cupos y 4 miembros dejan 2', async () => {
    const dueno = await usuario();
    const editor = await usuario();
    const miembros = [await usuario(), await usuario(), await usuario(), await usuario()];
    const org = await crearOrg(dueno);
    await agregar(org, editor, 'EDITOR');
    for (const m of miembros) await agregar(org, m, 'EDITOR');

    const r = await crearProyecto(editor.token, {
      idOrganizacion: org,
      participantes: miembros.map((m) => ({ idUsuario: m.idUsuario, indiceRol: 0 })),
    });
    expect(r.status).toBe(201);
    const participaciones = await prisma.participacionProyecto.findMany({ where: { rolProyecto: { idProyecto: r.body.idProyecto } } });
    expect(participaciones.map((p) => p.idUsuario).sort()).toEqual(miembros.map((m) => m.idUsuario).sort());
    expect(participaciones.every((p) => p.estadoParticipacion === 'ACTIVO' && p.idPostulacion === null)).toBe(true);

    await prisma.proyecto.update({ where: { idProyecto: r.body.idProyecto }, data: { estadoProyecto: 'PUBLICADO' } });
    const lista = await pedir('GET', `/proyectos?page=1&q=${encodeURIComponent(proyectoTitulo(r))}`, dueno.token);
    expect(lista.status).toBe(200);
    const tarjeta = lista.body.data.find((p: { idProyecto: number }) => p.idProyecto === r.body.idProyecto);
    expect(tarjeta.roles).toEqual([{ cupos: 6, cuposDisponibles: 2 }]);
    expect(tarjeta.organizaciones[0].organizacion).toMatchObject({ idOrganizacion: org });
    expect(tarjeta.organizaciones[0].organizacion.nombreOrganizacion).toEqual(expect.any(String));
  });

  const proyectoTitulo = (r: Respuesta) => r.body.tituloProyecto as string;

  it('los participantes se validan: miembros de la organización con rol Editor o superior, sin repetir, dentro de los cupos', async () => {
    const dueno = await usuario();
    const editor = await usuario();
    const lector = await usuario();
    const ajeno = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, editor, 'EDITOR');
    await agregar(org, lector, 'LECTURA');
    const cuposDos = [{ nombreRol: 'Pocos', cupos: 2 }];

    const intento = (participantes: unknown, extra: Record<string, unknown> = {}) =>
      pedir('POST', '/proyectos', dueno.token, proyectoBody({ idOrganizacion: org, participantes, ...extra }));

    expect((await intento([{ idUsuario: lector.idUsuario, indiceRol: 0 }])).status).toBe(400);
    expect((await intento([{ idUsuario: ajeno.idUsuario, indiceRol: 0 }])).status).toBe(400);
    expect((await intento([{ idUsuario: dueno.idUsuario, indiceRol: 0 }])).status).toBe(400);
    expect((await intento([{ idUsuario: editor.idUsuario, indiceRol: 0 }, { idUsuario: editor.idUsuario, indiceRol: 0 }])).status).toBe(400);
    expect((await intento([{ idUsuario: editor.idUsuario, indiceRol: 3 }])).status).toBe(400);
    const admin = await usuario();
    const otro = await usuario();
    await agregar(org, admin, 'ADMINISTRADOR');
    await agregar(org, otro, 'EDITOR');
    expect((await intento([{ idUsuario: editor.idUsuario, indiceRol: 0 }, { idUsuario: admin.idUsuario, indiceRol: 0 }, { idUsuario: otro.idUsuario, indiceRol: 0 }], { roles: cuposDos })).status).toBe(400);
    expect((await pedir('POST', '/proyectos', dueno.token, proyectoBody({ participantes: [{ idUsuario: editor.idUsuario, indiceRol: 0 }] }))).status).toBe(400);

    const proyectosCreados = await prisma.proyectoOrganizacion.count({ where: { idOrganizacion: org } });
    expect(proyectosCreados).toBe(0);
  });

  it('un miembro que no participa solo lee el proyecto de la organización; solo los participantes registran horas', async () => {
    const dueno = await usuario();
    const editor = await usuario();
    const participante = await usuario();
    const lector = await usuario();
    const ajeno = await usuario();
    const org = await crearOrg(dueno);
    await agregar(org, editor, 'EDITOR');
    await agregar(org, participante, 'EDITOR');
    await agregar(org, lector, 'LECTURA');

    const r = await crearProyecto(editor.token, { idOrganizacion: org, participantes: [{ idUsuario: participante.idUsuario, indiceRol: 0 }] });
    const idProyecto = r.body.idProyecto as number;
    await prisma.proyecto.update({ where: { idProyecto }, data: { estadoProyecto: 'EN_PROGRESO' } });
    const sprint = await createIntegrationSprint(prisma, idProyecto, { estado: 'ACTIVO' });
    scope.sprintIds!.push(sprint.idSprint);
    const tarea = await createIntegrationTask(prisma, idProyecto, editor.idUsuario, sprint.idSprint);
    scope.taskIds!.push(tarea.idTarea);
    const participacion = await prisma.participacionProyecto.findFirstOrThrow({ where: { idUsuario: participante.idUsuario, rolProyecto: { idProyecto } } });
    const asignacion = await createIntegrationTaskAssignment(prisma, tarea.idTarea, participante.idUsuario, editor.idUsuario, { idParticipacion: participacion.idParticipacion });
    scope.assignmentIds!.push(asignacion.idAsignacion);

    // Lectura: ve el tablero y el avance...
    const tablero = await pedir('GET', `/proyectos/${idProyecto}/tareas`, lector.token);
    expect(tablero.status).toBe(200);
    expect(tablero.body.map((t: { idTarea: number }) => t.idTarea)).toEqual([tarea.idTarea]);
    expect((await pedir('GET', `/proyectos/${idProyecto}/avance`, lector.token)).status).toBe(200);
    // ...pero un usuario fuera de la organización no ve nada.
    expect((await pedir('GET', `/proyectos/${idProyecto}/tareas`, ajeno.token)).status).toBe(403);
    expect((await pedir('GET', `/proyectos/${idProyecto}/avance`, ajeno.token)).status).toBe(403);

    // Lectura no crea ni mueve tareas, ni registra horas; tampoco un Editor que no participa.
    for (const sinParticipar of [lector, (await (async () => { const e = await usuario(); await agregar(org, e, 'EDITOR'); return e; })())]) {
      expect((await pedir('POST', `/proyectos/${idProyecto}/tareas`, sinParticipar.token, { tituloTarea: 'Nueva' })).status).toBe(403);
      expect((await pedir('PATCH', `/proyectos/${idProyecto}/tareas/${tarea.idTarea}/estado`, sinParticipar.token, { estadoTarea: 'HECHO' })).status).toBe(403);
      expect((await pedir('POST', `/proyectos/${idProyecto}/tareas/${tarea.idTarea}/horas`, sinParticipar.token, { horas: 1, fecha: '2031-03-10' })).status).toBe(403);
    }
    // Aunque alguien forzara una asignación a nombre de Lectura, su falta de participación lo sigue frenando.
    await prisma.asignacionTarea.update({ where: { idAsignacion: asignacion.idAsignacion }, data: { desasignadaEn: new Date() } });
    const forzada = await createIntegrationTaskAssignment(prisma, tarea.idTarea, lector.idUsuario, editor.idUsuario);
    scope.assignmentIds!.push(forzada.idAsignacion);
    expect((await pedir('POST', `/proyectos/${idProyecto}/tareas/${tarea.idTarea}/horas`, lector.token, { horas: 1, fecha: '2031-03-10' })).status).toBe(403);
    await prisma.asignacionTarea.update({ where: { idAsignacion: forzada.idAsignacion }, data: { desasignadaEn: new Date() } });
    const ultima = await createIntegrationTaskAssignment(prisma, tarea.idTarea, participante.idUsuario, editor.idUsuario, { idParticipacion: participacion.idParticipacion });
    scope.assignmentIds!.push(ultima.idAsignacion);

    expect(await prisma.registroTiempoTarea.count({ where: { idUsuario: lector.idUsuario } })).toBe(0);
    expect((await prisma.tarea.findUniqueOrThrow({ where: { idTarea: tarea.idTarea } })).estadoTarea).toBe('POR_HACER');

    // El participante sí registra horas.
    const horas = await pedir('POST', `/proyectos/${idProyecto}/tareas/${tarea.idTarea}/horas`, participante.token, { horas: 1.5, fecha: '2031-03-10' });
    expect(horas.status).toBe(201);
  });
});
