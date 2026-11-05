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

    expect(await db.tarea.groupBy({ by: ['estadoTarea'] }).then((g) => g.map((x) => x.estadoTarea).sort())).toEqual(['EN_PROGRESO', 'EN_REVISION', 'HECHO', 'POR_HACER']);
  }, 120_000);
});
