import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
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
  'tarea', 'asignacion_tarea', 'registro_tiempo_tarea', 'horas_participacion',
];

describeIntegration('DEMO seed-demo-final', () => {
  const baseName = `seed_demo_final_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const url = new URL(process.env.INTEGRATION_DATABASE_URL!);
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  url.pathname = `/${baseName}`;
  const dbUrl = url.toString();
  const envBase: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: dbUrl, DIRECT_URL: dbUrl };
  delete envBase.DEMO_PASSWORD;
  let db: PrismaClient;

  const node = (script: string[], env: NodeJS.ProcessEnv) =>
    execFileSync(process.execPath, [...script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const correrSeed = (password: string | null = 'Contrasena-Demo-1') =>
    node([join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed-demo-final.ts'], { ...envBase, ...(password && { DEMO_PASSWORD: password }) });
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
    expect(() => correrSeed()).toThrow(/carlos\.mendoza@uvg\.edu\.gt/);
    expect(await db.usuario.count()).toBe(0);
  }, 60_000);

  it('corre dos veces con conteos estables, sin tocar cuentas prohibidas y sin exponer la contrasena', async () => {
    const carrera = await db.carrera.create({ data: { nombreCarrera: 'Ingeniería en Ciencias de la Computación y TI' } });
    await db.usuario.create({ data: { correo: 'carlos.mendoza@uvg.edu.gt', contrasena: 'hash-previo', nombre: 'Carlos', apellido: 'Mendoza' } });
    for (const [i, carne] of PROHIBIDAS.entries()) {
      const u = await db.usuario.create({ data: { correo: `${carne}@uvg.edu.gt`, contrasena: 'hash-previo', nombre: 'Prohibida', apellido: String(i) } });
      await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne, idCarrera: carrera.idCarrera } });
      await db.registroHorasSemestre.create({ data: { idUsuario: u.idUsuario, anio: 2026, periodo: 2, metaBeca: 80, becaDeclarada: 1 } });
    }
    const antesProhibidas = await snapshotProhibidas();

    const password = 'Contrasena-Demo-1';
    const primera = correrSeed(password);
    expect(primera).toContain('usuarios: creados 15, actualizados 0');
    expect(primera).toContain('proyectos: creados 5, actualizados 0');
    expect(primera).not.toContain(password);
    const trasPrimera = await conteos();

    const segunda = correrSeed(password);
    expect(segunda).not.toContain(password);
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
    expect(await db.tarea.groupBy({ by: ['estadoTarea'] }).then((g) => g.map((x) => x.estadoTarea).sort())).toEqual(['EN_PROGRESO', 'EN_REVISION', 'HECHO', 'POR_HACER']);
  }, 120_000);
});
