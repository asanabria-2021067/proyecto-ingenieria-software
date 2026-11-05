import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { EMOJIS_REACCION } from '../../src/chat/dto/toggle-reaction.dto';
import { calcularCoincidencia } from '../../src/common/coincidencia-habilidades';
import { semestreDe } from '../../src/horas-semestre/semestre';
import { describeIntegration } from './setup/database';

/**
 * DEMO (Fase 4): prisma/seed-demo-final.ts contra PostgreSQL real. Corre en una
 * base propia y desechable (CREATE DATABASE + migrate deploy + DROP DATABASE al
 * final; un schema aparte no sirve porque las migraciones instalan extensiones)
 * para no dejar datos de demo en la base compartida de las demas suites.
 */
const PROHIBIDAS = ['pru26200', 'pru26201', 'pru26202', 'pru26203', 'pru26204', 'pru26205', 'lid26299'];
const TABLAS = [
  'usuario', 'perfil_estudiante', 'registro_horas_semestre', 'asociacion', 'junta_asociacion', 'organizacion', 'usuario_organizacion',
  'invitacion_organizacion', 'conversacion', 'conversacion_participante', 'mensaje_chat', 'proyecto', 'participacion_proyecto', 'sprint',
  'tarea', 'asignacion_tarea', 'registro_tiempo_tarea', 'horas_participacion', 'tarea_checklist_item',
  'rol_proyecto', 'postulacion', 'requisito_habilidad_rol', 'habilidad', 'usuario_habilidad',
  'pregunta_rol', 'respuesta_postulacion', 'evento_postulacion', 'tarea_enlace', 'tarea_responsable', 'portafolio_publico', 'disponibilidad_semanal',
];

describeIntegration('DEMO seed-demo-final', () => {
  const baseName = `seed_demo_final_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const url = new URL(process.env.INTEGRATION_DATABASE_URL!);
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  url.pathname = `/${baseName}`;
  const dbUrl = url.toString();
  const envBase: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl };
  delete envBase.DEMO_PASSWORD;
  delete envBase.DEMO_COORDINADOR_PASSWORD;
  let db: PrismaClient;

  const node = (script: string[], env: NodeJS.ProcessEnv) =>
    execFileSync(process.execPath, [...script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const correrSeed = (password: string | null = 'Contrasena-Demo-1', extra: NodeJS.ProcessEnv = {}, passwordCoordinador: string | null = 'Contrasena-Coord-1') =>
    node([join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed-demo-final.ts'], { ...envBase, ...extra, ...(password && { DEMO_PASSWORD: password }), ...(passwordCoordinador && { DEMO_COORDINADOR_PASSWORD: passwordCoordinador }) });
  const conteos = async () => {
    const filas: Record<string, number> = {};
    for (const t of TABLAS) filas[t] = Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${t}"`))[0].n);
    return filas;
  };
  const snapshotProhibidas = async () => ({
    usuarios: await db.usuario.findMany({ where: { perfil: { carne: { in: PROHIBIDAS } } }, orderBy: { idUsuario: 'asc' } }),
    registros: await db.registroHorasSemestre.findMany({ where: { usuario: { perfil: { carne: { in: PROHIBIDAS } } } }, orderBy: { idRegistro: 'asc' } }),
    membresias: await db.usuarioOrganizacion.count({ where: { usuario: { perfil: { carne: { in: PROHIBIDAS } } } } }),
  });

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${baseName}"`);
    node([join(process.cwd(), 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], envBase);
    db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await db.$connect();
  }, 180_000);

  afterAll(async () => {
    try {
      await db?.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${baseName}" WITH (FORCE)`);
    } finally {
      await admin.$disconnect();
    }
  });

  it('falla con mensaje claro sin DEMO_PASSWORD y sin el presidente, y no crea nada', async () => {
    expect(() => correrSeed(null)).toThrow(/DEMO_PASSWORD/);
    expect(() => correrSeed('Contrasena-Demo-1', {}, null)).toThrow(/DEMO_COORDINADOR_PASSWORD/);
    expect(() => correrSeed()).toThrow(/carlos\.mendoza@uvg\.edu\.gt/);
    expect(await db.usuario.count()).toBe(0);
  }, 60_000);

  it('corre dos veces con conteos estables, sin tocar cuentas prohibidas y sin exponer la contrasena', async () => {
    const carrera = await db.carrera.create({ data: { nombreCarrera: 'Ingeniería en Ciencias de la Computación y TI' } });
    const carlos = await db.usuario.create({ data: { correo: 'carlos.mendoza@uvg.edu.gt', contrasena: 'hash-previo', nombre: 'Carlos', apellido: 'Mendoza' } });
    await db.perfilEstudiante.create({ data: { idUsuario: carlos.idUsuario, carne: 'REAL-CARLOS', idCarrera: carrera.idCarrera } });
    const { anio, periodo } = semestreDe(new Date());
    // Registro previo con otras cifras: el script solo debe corregir esos cuatro campos.
    await db.registroHorasSemestre.create({ data: { idUsuario: carlos.idUsuario, anio, periodo, metaBeca: 80, becaDeclarada: 3 } });
    for (const [i, carne] of PROHIBIDAS.entries()) {
      const u = await db.usuario.create({ data: { correo: `${carne}@uvg.edu.gt`, contrasena: 'hash-previo', nombre: 'Prohibida', apellido: String(i) } });
      await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne, idCarrera: carrera.idCarrera } });
      await db.registroHorasSemestre.create({ data: { idUsuario: u.idUsuario, anio: 2026, periodo: 2, metaBeca: 80, becaDeclarada: 80 } }); // meta cumplida: no cuentan como en riesgo de la asociacion
    }
    const antesProhibidas = await snapshotProhibidas();

    const antesDry = await conteos();
    const dry = correrSeed('Contrasena-Demo-1', { DRY_RUN: '1' });
    expect(dry).toContain('usuarios: creados 15');
    expect(dry).toContain('transaccion revertida');
    expect(await conteos()).toEqual(antesDry);
    expect((await db.registroHorasSemestre.findFirstOrThrow({ where: { usuario: { correo: 'carlos.mendoza@uvg.edu.gt' } } })).metaBeca).toBe(80);

    const password = 'Contrasena-Demo-1';
    const primera = correrSeed(password);
    expect(primera).toContain('usuarios: creados 15, actualizados 0');
    expect(primera).toContain('proyectos: creados 5, actualizados 0');
    expect(primera).not.toContain(password);
    for (const l of ['preguntas_rol: creados 3', 'postulaciones_release9: creados 2', 'respuestas_postulacion: creados 3', 'eventos_postulacion: creados 6', 'tareas_release9: creados 3', 'tarea_responsables: creados 1', 'tarea_enlaces: creados 2', 'chat_hilo_respuestas: creados 2', 'portafolio_publico: creados 1', 'disponibilidad_semanal: creados 6'])
      expect(primera).toContain(`${l}, actualizados 0`);
    expect(primera).not.toContain('Contrasena-Coord-1');
    const trasPrimera = await conteos();

    const segunda = correrSeed(password);
    expect(segunda).not.toContain(password);
    expect(segunda).not.toContain('Contrasena-Coord-1');
    const lineas = segunda.split('\n').filter((l) => l.includes(': creados'));
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) expect(l, l).toMatch(/creados 0, actualizados 0$/);
    expect(await conteos()).toEqual(trasPrimera);

    expect(await snapshotProhibidas()).toEqual(antesProhibidas);
    const demo = await db.usuario.findFirstOrThrow({ where: { correo: 'demo.cs01@uvg.edu.gt' } });
    expect(demo.contrasena).toMatch(/^\$2[aby]\$10\$/);
    expect(demo.contrasena).not.toContain(password);

    const junta = await db.juntaAsociacion.findMany({ orderBy: { cargo: 'asc' }, include: { usuario: true } });
    expect(junta.map((j) => j.cargo)).toEqual(['PRESIDENTE', 'VICEPRESIDENTE', 'VOCAL']);
    expect(junta.find((j) => j.cargo === 'PRESIDENTE')?.usuario.correo).toBe('carlos.mendoza@uvg.edu.gt');
    const reg = await db.registroHorasSemestre.findMany({ where: { usuario: { correo: 'carlos.mendoza@uvg.edu.gt' } } });
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ metaBeca: 50, becaDeclarada: 20, metaExtension: 40, extensionDeclarada: 10 });
    expect(await db.perfilEstudiante.findFirstOrThrow({ where: { usuario: { correo: 'carlos.mendoza@uvg.edu.gt' } } })).toMatchObject({ carne: 'REAL-CARLOS' });

    const conMetas = await db.registroHorasSemestre.count({ where: { usuario: { correo: { startsWith: 'demo.cs' } }, OR: [{ metaBeca: { not: null } }, { metaExtension: { not: null } }] } });
    const sinMetas = await db.registroHorasSemestre.count({ where: { usuario: { correo: { startsWith: 'demo.cs' } }, metaBeca: null, metaExtension: null } });
    expect(conMetas).toBeGreaterThanOrEqual(10);
    expect(sinMetas).toBeGreaterThanOrEqual(1);
    expect(new Set((await db.registroHorasSemestre.findMany({ where: { usuario: { correo: { startsWith: 'demo.cs' } }, metaBeca: { not: null } } })).map((r) => r.metaBeca)).size).toBeGreaterThan(1);

    // Semestre anterior: al menos 5 cuentas demo con horas para el comparativo.
    const previo = periodo === 2 ? { anio, periodo: 1 } : { anio: anio - 1, periodo: 2 };
    const conHistorial = await db.registroHorasSemestre.findMany({ where: { ...previo, usuario: { correo: { startsWith: 'demo.cs' } } } });
    expect(conHistorial.length).toBeGreaterThanOrEqual(5);
    for (const r of conHistorial) expect(r.becaDeclarada + r.extensionDeclarada).toBeGreaterThan(0);

    // Rol con requisitos en un proyecto en progreso de una cuenta demo y 2 postulantes pendientes con coincidencia parcial.
    const rol = await db.rolProyecto.findFirstOrThrow({
      where: { requisitos: { some: {} }, proyecto: { estadoProyecto: 'EN_PROGRESO', creador: { correo: { startsWith: 'demo.cs' } } } },
      include: { requisitos: true, postulaciones: { include: { postulante: { include: { habilidades: true } } } } },
    });
    const pendientes = rol.postulaciones.filter((p) => p.estadoPostulacion === 'PENDIENTE');
    expect(pendientes).toHaveLength(2);
    const porcentajes = pendientes
      .map((p) => {
        const niveles = new Map(p.postulante.habilidades.map((h) => [h.idHabilidad, h.nivelHabilidad]));
        return calcularCoincidencia(rol.requisitos, niveles)!.porcentaje;
      })
      .sort();
    expect(porcentajes).toEqual([33, 67]);

    const tareaCarlos = await db.tarea.findFirstOrThrow({
      where: { estadoTarea: 'EN_PROGRESO', asignaciones: { some: { desasignadaEn: null, usuario: { correo: 'carlos.mendoza@uvg.edu.gt' } } }, sprint: { estado: 'ACTIVO' }, proyecto: { estadoProyecto: 'EN_PROGRESO' } },
      include: { checklist: { orderBy: { orden: 'asc' } } },
    });
    expect(tareaCarlos.checklist.map((i) => i.completado)).toEqual([true, false, false]);
    // Chat #general de «Tutorías» y «Hackathon»: 5 a 8 mensajes escalonados, con mencion, respuesta y reaccion; Carlos escribe en el del Hackathon.
    for (const titulo of ['Demo - App de tutorías entre pares', 'Demo - Hackathon de Computación']) {
      const mensajes = await db.mensajeChat.findMany({
        where: { conversacion: { esCanal: true, nombreCanal: 'general', proyecto: { tituloProyecto: titulo } } },
        include: { reacciones: true },
        orderBy: { enviadoEn: 'asc' },
      });
      expect(mensajes.length, titulo).toBeGreaterThanOrEqual(5);
      expect(mensajes.length, titulo).toBeLessThanOrEqual(8);
      expect(mensajes.some((m) => /@\[[^\]]+\]\(\d+\)/.test(m.contenido)), titulo).toBe(true);
      expect(mensajes.some((m) => m.idMensajeCitado !== null), titulo).toBe(true);
      expect(mensajes.some((m) => m.reacciones.length > 0), titulo).toBe(true);
      expect(new Set(mensajes.map((m) => m.enviadoEn.getTime())).size, titulo).toBe(mensajes.length);
      const ahora = Date.now();
      for (const m of mensajes) expect(ahora - m.enviadoEn.getTime()).toBeLessThan(7 * 86_400_000);
    }
    // Toda reaccion sembrada debe poder alternarse desde el chip (ToggleReactionDto).
    for (const r of await db.reaccionMensajeChat.findMany()) expect(EMOJIS_REACCION, r.emoji).toContain(r.emoji);
    expect(await db.mensajeChat.count({ where: { remitente: { correo: 'carlos.mendoza@uvg.edu.gt' }, conversacion: { proyecto: { tituloProyecto: 'Demo - Hackathon de Computación' } } } })).toBeGreaterThan(0);

    // Calendario del Laboratorio: 3 eventos futuros (reunion, taller, entrega) dentro de 60 dias y sin invitados.
    const ahora = new Date();
    const eventos = await db.eventoProyecto.findMany({
      where: { eliminadoEn: null, invitados: { isEmpty: true }, proyecto: { organizaciones: { some: { organizacion: { nombreOrganizacion: 'Laboratorio de Innovación Abierta (Demo)' } } } } },
    });
    expect(eventos.map((e) => e.tipoEvento).sort()).toEqual(['ENTREGA', 'REUNION', 'TALLER']);
    for (const e of eventos) {
      expect(e.tituloEvento).toMatch(/^Demo - /);
      expect(e.fechaInicio.getTime()).toBeGreaterThan(ahora.getTime());
      expect(e.fechaInicio.getTime()).toBeLessThan(ahora.getTime() + 60 * 86_400_000);
    }

    // Hitos de «Tutorías»: uno atrasado y sin terminar (alerta roja) y uno proximo.
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    const hitos = await db.hito.findMany({ where: { proyecto: { tituloProyecto: 'Demo - App de tutorías entre pares' } } });
    expect(hitos.filter((h) => h.estadoHito !== 'COMPLETADO' && h.fechaLimite! < hoy)).toHaveLength(1);
    expect(hitos.filter((h) => h.estadoHito !== 'COMPLETADO' && h.fechaLimite! > hoy)).toHaveLength(1);

    // demo.cs05 es miembro de las dos organizaciones.
    const orgsCs05 = await db.usuarioOrganizacion.findMany({ where: { usuario: { correo: 'demo.cs05@uvg.edu.gt' }, estadoMembresia: 'ACTIVA' }, include: { organizacion: true } });
    expect(orgsCs05.map((m) => m.organizacion.nombreOrganizacion).sort()).toEqual(['Comunidad de Ciencia de Datos (Demo)', 'Laboratorio de Innovación Abierta (Demo)']);
    expect(await db.usuarioOrganizacion.findFirstOrThrow({ where: { usuario: { correo: 'demo.cs05@uvg.edu.gt' }, organizacion: { nombreOrganizacion: 'Comunidad de Ciencia de Datos (Demo)' } } })).toMatchObject({ rolOrganizacion: 'LECTURA' });
    expect(await db.usuarioOrganizacion.count({ where: { organizacion: { nombreOrganizacion: 'Comunidad de Ciencia de Datos (Demo)' } } })).toBeLessThanOrEqual(8);

    // Coordinador de Computacion: alcance en esa carrera, un proyecto en revision y un cierre pendiente dentro de su alcance.
    const coordinador = await db.usuario.findUniqueOrThrow({
      where: { correo: 'demo.coordinador@uvg.edu.gt' },
      include: { rolesAcceso: { include: { rolAcceso: true } }, alcancesCoordinador: true },
    });
    expect(coordinador.contrasena).toMatch(/^\$2[aby]\$10\$/);
    expect(coordinador.contrasena).not.toContain('Contrasena-Coord-1');
    expect(coordinador.rolesAcceso.map((r) => r.rolAcceso.nombrePerfil)).toEqual(['coordinador_academico']);
    expect(coordinador.alcancesCoordinador.map((a) => a.idCarrera)).toEqual([carrera.idCarrera]);
    const cubiertos = { creador: { perfil: { idCarrera: carrera.idCarrera } } };
    expect(await db.revisionProyecto.count({ where: { estadoRevision: 'PENDIENTE', proyecto: { estadoProyecto: 'EN_REVISION', ...cubiertos } } })).toBe(1);
    expect(await db.revisionCierreProyecto.count({ where: { estadoRevision: 'ENVIADA', proyecto: { estadoProyecto: 'EN_SOLICITUD_CIERRE', ...cubiertos } } })).toBe(1);

    // Entrega 9: preguntas del rol (MEJ-97), linea de tiempo (MEJ-100) y rechazo con motivo (MEJ-99).
    const rolUx = await db.rolProyecto.findFirstOrThrow({ where: { nombreRol: 'Diseñador/a UX' }, include: { preguntas: true, postulaciones: { include: { respuestas: true, eventos: true } } } });
    expect(rolUx.preguntas).toHaveLength(2);
    expect(rolUx.postulaciones).toHaveLength(1);
    expect(rolUx.postulaciones[0].respuestas).toHaveLength(2);
    expect(rolUx.postulaciones[0].eventos.map((e) => e.tipo).sort()).toEqual(['ENVIADA', 'EN_REVISION', 'VISTA']);
    const rechazada = await db.postulacion.findFirstOrThrow({ where: { estadoPostulacion: 'RECHAZADA', rolProyecto: { nombreRol: 'Logística del evento' } }, include: { eventos: true } });
    expect(rechazada.motivoRechazo).toBe('HORARIO');
    expect(rechazada.eventos.map((e) => e.tipo).sort()).toEqual(['ENVIADA', 'RECHAZADA', 'VISTA']);

    // MEJ-117: sprint activo con objetivo.
    expect((await db.sprint.findFirstOrThrow({ where: { estado: 'ACTIVO', proyecto: { tituloProyecto: 'Demo - App de tutorías entre pares' } } })).objetivo).toBeTruthy();

    // MEJ-106/107/109: tarea con 2 subtareas, 2 enlaces https y 2 responsables (principal + uno adicional).
    const conSubtareas = await db.tarea.findFirstOrThrow({
      where: { tituloTarea: 'Tutorías: diseñar la pantalla de búsqueda' },
      include: { subtareas: true, enlaces: true, responsables: true, asignaciones: { where: { desasignadaEn: null } } },
    });
    expect(conSubtareas.subtareas).toHaveLength(2);
    expect(conSubtareas.subtareas.every((t) => t.idProyecto === conSubtareas.idProyecto && t.idTareaPadre === conSubtareas.idTarea)).toBe(true);
    expect(conSubtareas.enlaces).toHaveLength(2);
    for (const e of conSubtareas.enlaces) expect(e.url).toMatch(/^https:\/\//);
    expect(conSubtareas.asignaciones.length + conSubtareas.responsables.length).toBe(2);

    // MEJ-131: hilo de 2 respuestas bajo un mensaje del chat del Hackathon.
    const raiz = await db.mensajeChat.findFirstOrThrow({ where: { idMensajePadre: null, hilo: { some: {} }, conversacion: { proyecto: { tituloProyecto: 'Demo - Hackathon de Computación' } } }, include: { hilo: true } });
    expect(raiz.hilo).toHaveLength(2);

    // MEJ-146/148: portafolio publico activo de una cuenta demo con token opaco, y su disponibilidad semanal.
    const portafolio = await db.portafolioPublico.findMany({ include: { usuario: true } });
    expect(portafolio).toHaveLength(1);
    expect(portafolio[0]).toMatchObject({ activo: true, indexable: false });
    expect(portafolio[0].usuario.correo).toMatch(/^demo\.cs\d+@uvg\.edu\.gt$/);
    expect(portafolio[0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await db.disponibilidadSemanal.count({ where: { idUsuario: portafolio[0].idUsuario } })).toBe(6);

    expect(await db.tarea.groupBy({ by: ['estadoTarea'] }).then((g) => g.map((x) => x.estadoTarea).sort())).toEqual(['EN_PROGRESO', 'EN_REVISION', 'HECHO', 'POR_HACER']);

    // DEMO-11: avisos de inicio de sesion leidos solo en demo.cs01-15 y «Mensaje eliminado» de Valeria limpiados solo en el #general del Hackathon.
    const u = async (correo: string) => (await db.usuario.findUniqueOrThrow({ where: { correo } })).idUsuario;
    const [valeria, daniela, andres, cs15, carlosId, pru] = await Promise.all([u('demo.cs01@uvg.edu.gt'), u('demo.cs03@uvg.edu.gt'), u('demo.cs04@uvg.edu.gt'), u('demo.cs15@uvg.edu.gt'), u('carlos.mendoza@uvg.edu.gt'), u('pru26200@uvg.edu.gt')]);
    const hackathonGeneral = await db.conversacion.findFirstOrThrow({ where: { esCanal: true, nombreCanal: 'general', proyecto: { tituloProyecto: 'Demo - Hackathon de Computación' } } });
    const tutoriasGeneral = await db.conversacion.findFirstOrThrow({ where: { esCanal: true, nombreCanal: 'general', proyecto: { tituloProyecto: 'Demo - App de tutorías entre pares' } } });
    const idConv = hackathonGeneral.idConversacion;
    const leidaPrevia = new Date('2026-01-01T00:00:00Z');
    const aviso = (idUsuario: number, tipoNotificacion: 'NUEVO_INICIO_SESION' | 'TAREA_ASIGNADA', leidaEn: Date | null) =>
      db.notificacion.create({ data: { idUsuario, tipoNotificacion, tituloNotificacion: 'Aviso de prueba', leidaEn } });
    const [login1, login2, otroTipo, yaLeida, loginPru, loginCarlos] = await Promise.all([
      aviso(daniela, 'NUEVO_INICIO_SESION', null), aviso(daniela, 'NUEVO_INICIO_SESION', null), aviso(daniela, 'TAREA_ASIGNADA', null),
      aviso(cs15, 'NUEVO_INICIO_SESION', leidaPrevia), aviso(pru, 'NUEVO_INICIO_SESION', null), aviso(carlosId, 'NUEVO_INICIO_SESION', null),
    ]);
    const msg = (idRemitente: number, contenido: string, extra: { padre?: number; cita?: number; muerto?: boolean; idConversacion?: number } = {}) =>
      db.mensajeChat.create({
        data: { idConversacion: extra.idConversacion ?? idConv, idRemitente, contenido, idMensajePadre: extra.padre, idMensajeCitado: extra.cita, eliminadoEn: extra.muerto ? new Date() : null },
      });
    const muerto = (idRemitente: number, extra: { padre?: number; idConversacion?: number } = {}) => msg(idRemitente, 'Mensaje eliminado', { ...extra, muerto: true });
    const vivos = () => db.mensajeChat.count({ where: { idConversacion: idConv, eliminadoEn: null } });
    const existe = async (idMensaje: number) => (await db.mensajeChat.findUnique({ where: { idMensaje } })) !== null;
    const fila = (idMensaje: number) => db.mensajeChat.findUniqueOrThrow({ where: { idMensaje } });
    const lineasCreadosActualizados = (salida: string) => salida.split('\n').filter((l) => l.includes(': creados'));

    // El canal parte con 8 mensajes vivos: se marcan 5 ajenos como eliminados para dejar margen (3 vivos) y probar el tope de 8.
    const ultimoSeed = (await db.mensajeChat.aggregate({ where: { idConversacion: idConv }, _max: { idMensaje: true } }))._max.idMensaje!;
    const semillas = await db.mensajeChat.findMany({ where: { idConversacion: idConv, eliminadoEn: null, idRemitente: { not: valeria } }, orderBy: { idMensaje: 'asc' }, take: 5 });
    await db.mensajeChat.updateMany({ where: { idMensaje: { in: semillas.map((s) => s.idMensaje) } }, data: { eliminadoEn: new Date() } });
    expect(await vivos()).toBe(3);

    // Pendientes por dependencias vivas (en orden de id: el primero se restaura, el resto excede el tope).
    const conHiloVivo = await muerto(valeria);
    const respVivaHilo = await msg(daniela, 'Respuesta viva en hilo', { padre: conHiloVivo.idMensaje });
    const citado = await muerto(valeria);
    const citadorVivo = await msg(andres, 'Cita viva', { cita: citado.idMensaje });
    const citado2 = await muerto(valeria);
    const citadorVivo2 = await msg(andres, 'Otra cita viva', { cita: citado2.idMensaje });
    // B2: la respuesta muerta tiene encuesta / respuestas propias / una cita viva; el padre no debe borrarse ni fallar el seed.
    const padreEnc = await muerto(valeria);
    const hijoEnc = await muerto(daniela, { padre: padreEnc.idMensaje });
    await db.encuestaChat.create({ data: { idMensaje: hijoEnc.idMensaje, pregunta: '¿Prueba?' } });
    const padreNieto = await muerto(valeria);
    const hijoConNieto = await muerto(daniela, { padre: padreNieto.idMensaje });
    const nieto = await muerto(daniela, { padre: hijoConNieto.idMensaje });
    const padreCitaHijo = await muerto(valeria);
    const hijoCitado = await muerto(daniela, { padre: padreCitaHijo.idMensaje });
    const citadorHijo = await msg(andres, 'Cita viva al hijo', { cita: hijoCitado.idMensaje });
    // Borrables: simple con reaccion, hilo muerto de otra usuaria y B1 (respuesta muerta de Valeria dentro de un hilo muerto de Valeria).
    const simple = await muerto(valeria);
    await db.reaccionMensajeChat.create({ data: { idMensaje: simple.idMensaje, idUsuario: daniela, emoji: EMOJIS_REACCION[0] } });
    const conHiloMuerto = await muerto(valeria);
    const hijoDaniela = await muerto(daniela, { padre: conHiloMuerto.idMensaje });
    const padreB1 = await muerto(valeria);
    const hijoB1 = await muerto(valeria, { padre: padreB1.idMensaje });
    // No son de Valeria en el canal: no se tocan.
    const deDaniela = await muerto(daniela);
    const otroCanal = await muerto(valeria, { idConversacion: tutoriasGeneral.idConversacion });
    expect(await vivos()).toBe(7);

    const limpieza = correrSeed(password);
    expect(limpieza).toContain('limpieza_mensajes_eliminados: creados 0, actualizados 5');
    expect(limpieza).toContain('limpieza_mensajes_pendientes: 5');
    expect(limpieza).toContain('notificaciones_inicio_sesion_leidas: creados 0, actualizados 2');
    expect(limpieza).not.toContain(password);
    const leida = async (id: number) => (await db.notificacion.findUniqueOrThrow({ where: { idNotificacion: id } })).leidaEn;
    expect(await leida(login1.idNotificacion)).not.toBeNull();
    expect(await leida(login2.idNotificacion)).not.toBeNull();
    expect(await leida(otroTipo.idNotificacion)).toBeNull();
    expect((await leida(yaLeida.idNotificacion))?.getTime()).toBe(leidaPrevia.getTime());
    expect(await leida(loginPru.idNotificacion)).toBeNull();
    expect(await leida(loginCarlos.idNotificacion)).toBeNull();
    const idsDemo = (await db.usuario.findMany({ where: { correo: { startsWith: 'demo.cs' } } })).map((x) => x.idUsuario);
    expect(await db.notificacion.count({ where: { idUsuario: { in: idsDemo }, tipoNotificacion: 'NUEVO_INICIO_SESION', leidaEn: null } })).toBe(0);

    // Borrados definitivos (incluye B1 sin fallar a medias) y su reaccion.
    for (const b of [simple, conHiloMuerto, hijoDaniela, padreB1, hijoB1]) expect(await existe(b.idMensaje), String(b.idMensaje)).toBe(false);
    expect(await db.reaccionMensajeChat.count({ where: { idMensaje: simple.idMensaje } })).toBe(0);
    // Tope: solo cabia uno (7 vivos + 1 = 8); se restaura el de menor id y el resto queda intacto.
    const restaurado = await fila(conHiloVivo.idMensaje);
    expect(restaurado.eliminadoEn).toBeNull();
    expect(restaurado.contenido).not.toBe('Mensaje eliminado');
    expect((await fila(respVivaHilo.idMensaje)).idMensajePadre).toBe(conHiloVivo.idMensaje);
    expect(await vivos()).toBe(8);
    for (const p of [citado, citado2, padreEnc, padreNieto, padreCitaHijo]) expect((await fila(p.idMensaje)).eliminadoEn, String(p.idMensaje)).not.toBeNull();
    // B2: ninguna respuesta con dependencias se borra y las citas vivas siguen apuntando a su mensaje.
    for (const h of [hijoEnc, hijoConNieto, nieto, hijoCitado]) expect(await existe(h.idMensaje), String(h.idMensaje)).toBe(true);
    expect(await db.encuestaChat.count({ where: { idMensaje: hijoEnc.idMensaje } })).toBe(1);
    expect((await fila(citadorVivo.idMensaje)).idMensajeCitado).toBe(citado.idMensaje);
    expect((await fila(citadorVivo2.idMensaje)).idMensajeCitado).toBe(citado2.idMensaje);
    expect((await fila(citadorHijo.idMensaje)).idMensajeCitado).toBe(hijoCitado.idMensaje);
    expect(await existe(deDaniela.idMensaje)).toBe(true);
    expect(await existe(otroCanal.idMensaje)).toBe(true);

    // Segunda corrida: nada cambia (los pendientes siguen igual y no hay cambios).
    const trasLimpieza = await conteos();
    const repetida = correrSeed(password);
    expect(lineasCreadosActualizados(repetida).length).toBeGreaterThan(0);
    for (const l of lineasCreadosActualizados(repetida)) expect(l, l).toMatch(/creados 0, actualizados 0$/);
    expect(await conteos()).toEqual(trasLimpieza);
    expect(await vivos()).toBe(8);

    // Relleno: por debajo de 5 vivos se agregan mensajes normales sin repetir un texto que ya existe en el canal.
    await db.encuestaChat.deleteMany({ where: { mensaje: { idConversacion: idConv, idMensaje: { gt: ultimoSeed } } } });
    await db.mensajeChat.updateMany({ where: { idConversacion: idConv, idMensaje: { gt: ultimoSeed } }, data: { idMensajeCitado: null, idMensajePadre: null } });
    await db.mensajeChat.deleteMany({ where: { idConversacion: idConv, idMensaje: { gt: ultimoSeed } } });
    expect(await vivos()).toBe(3);
    const textoExistente = 'Revisé el cronograma del evento y todo va en orden.';
    await msg(daniela, textoExistente, { muerto: true });
    const simple2 = await muerto(valeria);
    const relleno = correrSeed(password);
    expect(relleno).toContain('limpieza_mensajes_eliminados: creados 0, actualizados 1');
    expect(relleno).toContain('limpieza_mensajes_relleno: creados 2, actualizados 0');
    expect(relleno).not.toContain('limpieza_mensajes_pendientes');
    expect(await existe(simple2.idMensaje)).toBe(false);
    expect(await vivos()).toBe(5);
    const nuevos = await db.mensajeChat.findMany({ where: { idConversacion: idConv, eliminadoEn: null, idMensaje: { gt: simple2.idMensaje } } });
    expect(nuevos).toHaveLength(2);
    expect(new Set(nuevos.map((n) => n.contenido)).size).toBe(2);
    for (const n of nuevos) {
      expect(n.idRemitente).toBe(valeria);
      expect(n.contenido).not.toBe(textoExistente);
      expect(n.contenido).not.toBe('Mensaje eliminado');
    }

    // DRY_RUN con eliminados presentes: no escribe nada (ni borra, ni restaura, ni marca leidos).
    await muerto(valeria);
    const paraRestaurar = await muerto(valeria);
    await msg(andres, 'Cita viva en dry run', { cita: paraRestaurar.idMensaje });
    const pendienteDry = await aviso(daniela, 'NUEVO_INICIO_SESION', null);
    const antesDry2 = await conteos();
    const sinLeerAntes = await db.notificacion.count({ where: { leidaEn: null } });
    const dry2 = correrSeed(password, { DRY_RUN: '1' });
    expect(dry2).toContain('limpieza_mensajes_eliminados: creados 0, actualizados 2');
    expect(dry2).toContain('notificaciones_inicio_sesion_leidas: creados 0, actualizados 1');
    expect(dry2).toContain('transaccion revertida');
    expect(await conteos()).toEqual(antesDry2);
    expect(await db.notificacion.count({ where: { leidaEn: null } })).toBe(sinLeerAntes);
    expect(await leida(pendienteDry.idNotificacion)).toBeNull();
    expect((await fila(paraRestaurar.idMensaje)).eliminadoEn).not.toBeNull();
    expect(await db.mensajeChat.count({ where: { idConversacion: idConv, idRemitente: valeria, eliminadoEn: { not: null } } })).toBe(2);

    // Corrida real y despues una idempotente.
    correrSeed(password);
    expect(await db.mensajeChat.count({ where: { idConversacion: idConv, idRemitente: valeria, eliminadoEn: { not: null } } })).toBe(0);
    expect((await fila(paraRestaurar.idMensaje)).eliminadoEn).toBeNull();
    expect(await leida(pendienteDry.idNotificacion)).not.toBeNull();
    expect(await vivos()).toBeLessThanOrEqual(8);
    const final = await conteos();
    const ultima = correrSeed(password);
    for (const l of lineasCreadosActualizados(ultima)) expect(l, l).toMatch(/creados 0, actualizados 0$/);
    expect(await conteos()).toEqual(final);
  }, 600_000);
});
