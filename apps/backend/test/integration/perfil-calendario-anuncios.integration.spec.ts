import 'reflect-metadata';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { accessTokenFor, requestJson, startIntegrationHttpHarness, type IntegrationHttpHarness } from './setup/http-harness';
import { JuntaGuard } from '../../src/associations/junta.guard';
import { AnunciosController } from '../../src/anuncios/anuncios.controller';
import { AsociacionAnunciosController, OrganizacionAnunciosController } from '../../src/anuncios/anuncios-entidad.controller';
import { AnunciosEntidadService } from '../../src/anuncios/anuncios-entidad.service';
import { AnunciosService } from '../../src/anuncios/anuncios.service';
import { CreateAnuncioEntidadDto } from '../../src/anuncios/dto/create-anuncio-entidad.dto';
import { GetEventsRangeQueryDto } from '../../src/events/dto/get-events-range-query.dto';
import { EventsService } from '../../src/events/events.service';
import { MyEventsController } from '../../src/events/my-events.controller';
import { OrganizationEventsController } from '../../src/events/organization-events.controller';
import { HorasSemestreService } from '../../src/horas-semestre/horas-semestre.service';
import { ChatService } from '../../src/chat/chat.service';
import { PerfilSocialController } from '../../src/social/perfil-social.controller';
import { PerfilSocialService } from '../../src/social/perfil-social.service';
import type { ChatGateway } from '../../src/chat/chat.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { ChatStoragePort } from '../../src/storage/chat-storage.port';

/**
 * MEJ-26/27/28/33/34/63/64/65/66 contra PostgreSQL real, por HTTP con JwtAuthGuard y JuntaGuard reales:
 * anuncios de organizaciones (miembros) y asociaciones (estudiantes de sus carreras), calendario de la
 * organización y .ics, mensaje directo entre amigos, CV y actividad respetando permisos.
 */
describeIntegration('perfil, calendario y anuncios de entidades (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let http: IntegrationHttpHarness;
  const marca = randomUUID().slice(0, 8);
  const u: Record<string, { idUsuario: number; token: string }> = {};
  const ids = { orgPublica: 0, orgPrivada: 0, asociacion: 0, carreraA: 0, carreraB: 0, proyecto: 0, compartido: 0, cerrado: 0 };
  const proyectoIds: number[] = [];
  const get = (ruta: string, quien: string) => requestJson(`${http.url}${ruta}`, { token: u[quien].token });
  const post = (ruta: string, quien: string, body?: unknown) => requestJson(`${http.url}${ruta}`, { method: 'POST', token: u[quien].token, body });
  const patch = (ruta: string, quien: string) =>
    fetch(`${http.url}${ruta}`, { method: 'PATCH', headers: { authorization: `Bearer ${u[quien].token}` } }).then((r) => r.status);
  const anuncio = { titulo: `Aviso ${marca}`, mensaje: 'Reunión el viernes', nivel: 'INFO', fechaInicio: new Date(Date.now() - 3600_000).toISOString(), fechaFin: new Date(Date.now() + 86400_000).toISOString() };
  const rango = () => `desde=${new Date(Date.now() - 86400_000).toISOString()}&hasta=${new Date(Date.now() + 10 * 86400_000).toISOString()}`;

  async function nuevo(nombre: string, idCarrera?: number) {
    const x = await createIntegrationUser(prisma, { nombre, apellido: `Mej ${marca}` });
    if (idCarrera !== undefined) await prisma.perfilEstudiante.create({ data: { idUsuario: x.idUsuario, carne: `${marca}${x.idUsuario}`, idCarrera } });
    u[nombre] = { idUsuario: x.idUsuario, token: accessTokenFor(x) };
  }

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const db = prisma as unknown as PrismaService;
    const gateway = { notifyConversationCreated: vi.fn(), removeFromConversation: vi.fn(), broadcastMessage: vi.fn() };
    const chat = new ChatService(db, gateway as unknown as ChatGateway, {} as ChatStoragePort);

    ids.carreraA = (await prisma.carrera.create({ data: { nombreCarrera: `Carrera A ${marca}` } })).idCarrera;
    ids.carreraB = (await prisma.carrera.create({ data: { nombreCarrera: `Carrera B ${marca}` } })).idCarrera;
    for (const n of ['owner', 'lector', 'outsider', 'presidente', 'vocal', 'ajeno']) await nuevo(n);
    await nuevo('estA', ids.carreraA);
    await nuevo('estB', ids.carreraB);
    await nuevo('amiga', ids.carreraA);
    await nuevo('amigo', ids.carreraA);
    await nuevo('soloAmigo');

    const crearOrg = (visibilidad: 'PUBLICA' | 'PRIVADA') =>
      prisma.organizacion.create({ data: { nombreOrganizacion: `Org ${visibilidad} ${marca}`, visibilidad, creadaPor: u.owner.idUsuario } }).then((o) => o.idOrganizacion);
    ids.orgPublica = await crearOrg('PUBLICA');
    ids.orgPrivada = await crearOrg('PRIVADA');
    await prisma.usuarioOrganizacion.createMany({
      data: [
        { idOrganizacion: ids.orgPublica, idUsuario: u.owner.idUsuario, rolOrganizacion: 'PROPIETARIO' },
        { idOrganizacion: ids.orgPublica, idUsuario: u.lector.idUsuario, rolOrganizacion: 'LECTURA' },
        { idOrganizacion: ids.orgPrivada, idUsuario: u.owner.idUsuario, rolOrganizacion: 'PROPIETARIO' },
        { idOrganizacion: ids.orgPublica, idUsuario: u.estA.idUsuario, rolOrganizacion: 'LECTURA' },
      ],
    });

    ids.asociacion = (await prisma.asociacion.create({ data: { nombre: `Aso ${marca}`, carreras: { create: { idCarrera: ids.carreraA } } } })).idAsociacion;
    await prisma.juntaAsociacion.createMany({
      data: [
        { idAsociacion: ids.asociacion, idUsuario: u.presidente.idUsuario, cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR' },
        { idAsociacion: ids.asociacion, idUsuario: u.vocal.idUsuario, cargo: 'VOCAL', nivelPermiso: 'LECTURA' },
      ],
    });

    // Proyecto de la organización con un evento abierto y otro solo para invitados.
    const p = await createIntegrationProject(prisma, u.owner.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    ids.proyecto = p.idProyecto;
    proyectoIds.push(p.idProyecto);
    await prisma.proyectoOrganizacion.create({ data: { idProyecto: p.idProyecto, idOrganizacion: ids.orgPublica } });
    const inicio = new Date(Date.now() + 2 * 86400_000);
    const fin = new Date(inicio.getTime() + 3600_000);
    await prisma.eventoProyecto.createMany({
      data: [
        { idProyecto: p.idProyecto, idCreador: u.owner.idUsuario, tituloEvento: `Abierto ${marca}`, fechaInicio: inicio, fechaFin: fin },
        { idProyecto: p.idProyecto, idCreador: u.owner.idUsuario, tituloEvento: `Privado ${marca}`, fechaInicio: inicio, fechaFin: fin, invitados: [u.owner.idUsuario] },
      ],
    });

    // Proyecto activo compartido por amiga y amigo; y uno cerrado donde amigo (estB no) completó con horas.
    const compartido = await createIntegrationProject(prisma, u.amiga.idUsuario, { estadoProyecto: 'EN_PROGRESO' });
    ids.compartido = compartido.idProyecto;
    proyectoIds.push(compartido.idProyecto);
    const rol = await createIntegrationProjectRole(prisma, compartido.idProyecto, { nombreRol: 'Dev', cupos: 2 });
    await createIntegrationParticipation(prisma, u.amigo.idUsuario, rol.idRolProyecto);
    const cerrado = await createIntegrationProject(prisma, u.owner.idUsuario, { estadoProyecto: 'CERRADO' });
    ids.cerrado = cerrado.idProyecto;
    proyectoIds.push(cerrado.idProyecto);
    const rolCerrado = await createIntegrationProjectRole(prisma, cerrado.idProyecto, { nombreRol: 'Analista' });
    const part = await createIntegrationParticipation(prisma, u.amigo.idUsuario, rolCerrado.idRolProyecto, { estadoParticipacion: 'COMPLETADO' });
    await prisma.horasParticipacion.create({
      data: { idParticipacion: part.idParticipacion, periodoInicio: new Date('2026-02-01'), periodoFin: new Date('2026-02-28'), horasReportadas: 12, horasAprobadas: 10, estadoHoras: 'APROBADA', fechaAprobacion: new Date() },
    });
    const amistad = (a: string, b: string) => ({ idUsuarioSolicitante: u[a].idUsuario, idUsuarioReceptor: u[b].idUsuario, estado: 'ACEPTADA' as const });
    await prisma.amistad.createMany({ data: [amistad('amiga', 'amigo'), amistad('amiga', 'soloAmigo')] });

    // El transform de Vitest no emite design:paramtypes; el guard real necesita su dependencia declarada.
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, JuntaGuard)) Reflect.defineMetadata(PARAMTYPES_METADATA, [PrismaService], JuntaGuard);
    const events = new EventsService(db);
    const entidad = new AnunciosEntidadService(db);
    const anuncios = new AnunciosService(db);
    const horas = new HorasSemestreService(db);
    const perfil = new PerfilSocialService(db, horas, chat);
    http = await startIntegrationHttpHarness({
      prisma,
      controllers: [
        { controller: AnunciosController, deps: [AnunciosService] },
        { controller: OrganizacionAnunciosController, deps: [AnunciosEntidadService], handlers: { crear: [Number, CreateAnuncioEntidadDto, Object] } },
        { controller: AsociacionAnunciosController, deps: [AnunciosEntidadService], handlers: { crear: [Number, CreateAnuncioEntidadDto, Object] } },
        { controller: MyEventsController, deps: [EventsService], handlers: { exportIcs: [Object, GetEventsRangeQueryDto, Object], findInRange: [Object, GetEventsRangeQueryDto] } },
        { controller: OrganizationEventsController, deps: [EventsService], handlers: { findInRange: [Number, Object, GetEventsRangeQueryDto], exportIcs: [Number, Object, GetEventsRangeQueryDto, Object] } },
        { controller: PerfilSocialController, deps: [PerfilSocialService] },
      ],
      providers: [
        { provide: AnunciosService, useValue: anuncios },
        { provide: AnunciosEntidadService, useValue: entidad },
        { provide: EventsService, useValue: events },
        { provide: PerfilSocialService, useValue: perfil },
        { provide: JuntaGuard, useValue: new JuntaGuard(db) },
      ],
    });
  });

  afterAll(async () => {
    await http?.close();
    const userIds = Object.values(u).map((x) => x.idUsuario);
    const orgs = [ids.orgPublica, ids.orgPrivada];
    const conversaciones = await prisma.conversacion.findMany({ where: { idProyecto: { in: proyectoIds } }, select: { idConversacion: true } });
    const idsConv = conversaciones.map((c) => c.idConversacion);
    await prisma.conversacionParticipante.deleteMany({ where: { idConversacion: { in: idsConv } } });
    await prisma.conversacion.deleteMany({ where: { idConversacion: { in: idsConv } } });
    await prisma.anuncioCierre.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.anuncio.deleteMany({ where: { OR: [{ idOrganizacion: { in: orgs } }, { idAsociacion: ids.asociacion }] } });
    await prisma.eventoProyecto.deleteMany({ where: { idProyecto: { in: proyectoIds } } });
    await prisma.proyectoOrganizacion.deleteMany({ where: { idOrganizacion: { in: orgs } } });
    const roles = await prisma.rolProyecto.findMany({ where: { idProyecto: { in: proyectoIds } }, select: { idRolProyecto: true } });
    const participaciones = await prisma.participacionProyecto.findMany({ where: { idRolProyecto: { in: roles.map((r) => r.idRolProyecto) } }, select: { idParticipacion: true } });
    await prisma.horasParticipacion.deleteMany({ where: { idParticipacion: { in: participaciones.map((p) => p.idParticipacion) } } });
    await prisma.participacionProyecto.deleteMany({ where: { idParticipacion: { in: participaciones.map((p) => p.idParticipacion) } } });
    await prisma.rolProyecto.deleteMany({ where: { idProyecto: { in: proyectoIds } } });
    await prisma.proyecto.deleteMany({ where: { idProyecto: { in: proyectoIds } } });
    await prisma.amistad.deleteMany({ where: { OR: [{ idUsuarioSolicitante: { in: userIds } }, { idUsuarioReceptor: { in: userIds } }] } });
    await prisma.usuarioOrganizacion.deleteMany({ where: { idOrganizacion: { in: orgs } } });
    await prisma.organizacion.deleteMany({ where: { idOrganizacion: { in: orgs } } });
    await prisma.juntaAsociacion.deleteMany({ where: { idAsociacion: ids.asociacion } });
    await prisma.asociacionCarrera.deleteMany({ where: { idAsociacion: ids.asociacion } });
    await prisma.asociacion.deleteMany({ where: { idAsociacion: ids.asociacion } });
    await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await prisma.carrera.deleteMany({ where: { idCarrera: { in: [ids.carreraA, ids.carreraB] } } });
    await prisma.$disconnect();
  });

  // ─── MEJ-66 anuncios ─────────────────────────────────────────────────────

  it('organizacion: publican Propietario/Admin; Lectura y ajenos no; solo miembros los ven en vigentes', async () => {
    expect((await post(`/organizaciones/${ids.orgPublica}/anuncios`, 'lector', anuncio)).status).toBe(403);
    expect((await post(`/organizaciones/${ids.orgPublica}/anuncios`, 'outsider', anuncio)).status).toBe(403);
    const creado = await post(`/organizaciones/${ids.orgPublica}/anuncios`, 'owner', anuncio);
    expect(creado.status).toBe(201);

    expect((await get(`/organizaciones/${ids.orgPublica}/anuncios`, 'lector')).body.map((a: { idAnuncio: number }) => a.idAnuncio)).toContain(creado.body.idAnuncio);
    expect((await get(`/organizaciones/${ids.orgPublica}/anuncios`, 'outsider')).status).toBe(403);
    expect((await get(`/organizaciones/${ids.orgPrivada}/anuncios`, 'outsider')).status).toBe(404);

    const vigentesMiembro = await get('/anuncios/vigentes', 'lector');
    expect(vigentesMiembro.body.find((a: { idAnuncio: number }) => a.idAnuncio === creado.body.idAnuncio)).toMatchObject({ origen: `Org PUBLICA ${marca}` });
    const vigentesAjeno = await get('/anuncios/vigentes', 'outsider');
    expect(vigentesAjeno.body.map((a: { idAnuncio: number }) => a.idAnuncio)).not.toContain(creado.body.idAnuncio);

    expect(await patch(`/organizaciones/${ids.orgPublica}/anuncios/${creado.body.idAnuncio}/despublicar`, 'lector')).toBe(403);
    expect(await patch(`/organizaciones/${ids.orgPublica}/anuncios/${creado.body.idAnuncio}/despublicar`, 'owner')).toBe(200);
    expect((await get('/anuncios/vigentes', 'lector')).body.map((a: { idAnuncio: number }) => a.idAnuncio)).not.toContain(creado.body.idAnuncio);
  });

  it('asociacion: publica la junta con permiso; Vocal y no-junta 403; lo ven solo estudiantes de sus carreras', async () => {
    expect((await post(`/asociaciones/${ids.asociacion}/anuncios`, 'vocal', anuncio)).status).toBe(403);
    expect((await post(`/asociaciones/${ids.asociacion}/anuncios`, 'estA', anuncio)).status).toBe(403);
    expect((await get(`/asociaciones/${ids.asociacion}/anuncios`, 'ajeno')).status).toBe(403);
    const creado = await post(`/asociaciones/${ids.asociacion}/anuncios`, 'presidente', anuncio);
    expect(creado.status).toBe(201);
    expect((await get(`/asociaciones/${ids.asociacion}/anuncios`, 'vocal')).status).toBe(200);

    const delEstudiante = await get('/anuncios/vigentes', 'estA');
    expect(delEstudiante.body.find((a: { idAnuncio: number }) => a.idAnuncio === creado.body.idAnuncio)).toMatchObject({ origen: `Aso ${marca}` });
    for (const otro of ['estB', 'outsider']) {
      expect((await get('/anuncios/vigentes', otro)).body.map((a: { idAnuncio: number }) => a.idAnuncio)).not.toContain(creado.body.idAnuncio);
    }
    expect(await patch(`/asociaciones/${ids.asociacion}/anuncios/${creado.body.idAnuncio}/despublicar`, 'vocal')).toBe(403);
    expect(await patch(`/asociaciones/${ids.asociacion}/anuncios/${creado.body.idAnuncio}/despublicar`, 'presidente')).toBe(200);
  });

  // ─── MEJ-34 / MEJ-33 calendario ──────────────────────────────────────────

  it('calendario de la organizacion: solo miembros y solo eventos abiertos al proyecto', async () => {
    const miembro = await get(`/organizaciones/${ids.orgPublica}/calendario?${rango()}`, 'lector');
    expect(miembro.status).toBe(200);
    expect(miembro.body.map((e: { tituloEvento: string }) => e.tituloEvento)).toEqual([`Abierto ${marca}`]);
    expect((await get(`/organizaciones/${ids.orgPublica}/calendario?${rango()}`, 'outsider')).status).toBe(403);
    expect((await get(`/organizaciones/${ids.orgPrivada}/calendario?${rango()}`, 'outsider')).status).toBe(404);
  });

  it('exporta .ics del usuario y de la organizacion como text/calendar', async () => {
    const propio = await fetch(`${http.url}/usuarios/me/eventos/ics?${rango()}`, { headers: { authorization: `Bearer ${u.owner.token}` } });
    expect(propio.status).toBe(200);
    expect(propio.headers.get('content-type')).toContain('text/calendar');
    const cuerpo = await propio.text();
    expect(cuerpo).toContain('BEGIN:VCALENDAR');
    expect(cuerpo).toContain(`SUMMARY:Abierto ${marca}`);
    expect(cuerpo).toContain('X-WR-CALNAME:Mi calendario');

    const org = await fetch(`${http.url}/organizaciones/${ids.orgPublica}/calendario/ics?${rango()}`, { headers: { authorization: `Bearer ${u.lector.token}` } });
    expect(org.status).toBe(200);
    const cuerpoOrg = await org.text();
    expect(cuerpoOrg).toContain(`SUMMARY:Abierto ${marca}`);
    expect(cuerpoOrg).toContain(`X-WR-CALNAME:Org PUBLICA ${marca}`);
    const ajeno = await fetch(`${http.url}/organizaciones/${ids.orgPublica}/calendario/ics?${rango()}`, { headers: { authorization: `Bearer ${u.outsider.token}` } });
    expect(ajeno.status).toBe(403);
    expect((await fetch(`${http.url}/usuarios/me/eventos/ics?${rango()}`)).status).toBe(401);
  });

  // ─── MEJ-28 mensaje directo ──────────────────────────────────────────────

  it('mensaje directo: solo amigos; usa el proyecto activo compartido y reutiliza la conversacion', async () => {
    expect((await post(`/social/amistades/${u.amigo.idUsuario}/mensaje`, 'outsider')).status).toBe(403);
    expect((await post(`/social/amistades/${u.soloAmigo.idUsuario}/mensaje`, 'amiga')).status).toBe(409);
    const primera = await post(`/social/amistades/${u.amigo.idUsuario}/mensaje`, 'amiga');
    expect(primera.status).toBe(200);
    expect(primera.body).toMatchObject({ idProyecto: ids.compartido });
    const desdeElOtro = await post(`/social/amistades/${u.amiga.idUsuario}/mensaje`, 'amigo');
    expect(desdeElOtro.body.idConversacion).toBe(primera.body.idConversacion);
  });

  // ─── MEJ-26 / 27 / 63 / 64 perfil ────────────────────────────────────────

  it('resumen del perfil: la organizacion privada no se revela a quien no es miembro', async () => {
    await prisma.usuarioOrganizacion.create({ data: { idOrganizacion: ids.orgPrivada, idUsuario: u.amigo.idUsuario, rolOrganizacion: 'EDITOR' } });
    const visto = await get(`/social/usuarios/${u.amigo.idUsuario}/resumen`, 'outsider');
    expect(visto.status).toBe(200);
    expect(visto.body.organizaciones).toEqual([]);
    expect(visto.body.asociaciones).toEqual([{ idAsociacion: ids.asociacion, nombre: `Aso ${marca}`, logoUrl: null }]);
    expect(visto.body.horasSemestre).toMatchObject({ becaAcreditadas: expect.any(Number) });
    const propio = await get(`/social/usuarios/${u.amigo.idUsuario}/resumen`, 'amigo');
    expect(propio.body.organizaciones.map((o: { rol: string }) => o.rol)).toEqual(['EDITOR']);
  });

  it('CV: proyectos cerrados con rol y horas acreditadas, en JSON y PDF; usuario inexistente 404', async () => {
    const cv = await get(`/social/usuarios/${u.amigo.idUsuario}/cv`, 'amiga');
    expect(cv.status).toBe(200);
    expect(cv.body.proyectos).toHaveLength(1);
    expect(cv.body.proyectos[0]).toMatchObject({ idProyecto: ids.cerrado, rol: 'Analista', horasAcreditadas: 10 });
    expect(cv.body.totalHorasAcreditadas).toBe(10);

    const pdf = await fetch(`${http.url}/social/usuarios/${u.amigo.idUsuario}/cv/pdf`, { headers: { authorization: `Bearer ${u.amiga.token}` } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
    expect((await get('/social/usuarios/999999999/cv', 'amiga')).status).toBe(404);
  });

  it('actividad reciente: muestra proyectos visibles y oculta organizaciones privadas ajenas', async () => {
    const act = await get(`/social/usuarios/${u.amigo.idUsuario}/actividad`, 'outsider');
    expect(act.status).toBe(200);
    const titulos = act.body.map((i: { titulo: string }) => i.titulo);
    expect(titulos).not.toContain(`Org PRIVADA ${marca}`);
    expect(act.body.some((i: { tipo: string; idProyecto: number }) => i.tipo === 'PROYECTO' && i.idProyecto === ids.compartido)).toBe(true);
    const propia = await get(`/social/usuarios/${u.amigo.idUsuario}/actividad`, 'amigo');
    expect(propia.body.map((i: { titulo: string }) => i.titulo)).toContain(`Org PRIVADA ${marca}`);
  });
});
