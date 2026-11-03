import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { HorasSemestreService } from '../../src/horas-semestre/horas-semestre.service';
import { semestreDe } from '../../src/horas-semestre/semestre';
import type { PrismaService } from '../../src/prisma/prisma.service';

describeIntegration('HRS registro de horas por semestre', () => {
  let db: PrismaClient;
  let service: HorasSemestreService;
  const userIds: number[] = [];
  const proyectoIds: number[] = [];

  beforeAll(async () => {
    db = createIntegrationPrismaClient();
    await db.$connect();
    service = new HorasSemestreService(db as unknown as PrismaService);
  });

  afterAll(async () => {
    await db.horasParticipacion.deleteMany({ where: { participacion: { idUsuario: { in: userIds } } } });
    await db.participacionProyecto.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.rolProyecto.deleteMany({ where: { idProyecto: { in: proyectoIds } } });
    await db.proyecto.deleteMany({ where: { idProyecto: { in: proyectoIds } } });
    await db.usuarioRolAcceso.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.registroHorasSemestre.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.perfilEstudiante.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.usuario.deleteMany({ where: { idUsuario: { in: userIds } } });
    await db.$disconnect();
  });

  async function estudiante() {
    const u = await createIntegrationUser(db);
    userIds.push(u.idUsuario);
    await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `hrs-${randomUUID()}`.slice(0, 20) } });
    return u;
  }

  it('sin registro necesita registro; al guardar el del semestre actual deja de necesitarlo', async () => {
    const u = await estudiante();
    expect((await service.getActual(u.idUsuario)).necesitaRegistro).toBe(true);

    const registro = await service.actualizarActual(u.idUsuario, { metaBeca: 80, becaDeclarada: 12 });
    const { anio, periodo } = semestreDe(new Date());
    expect(registro).toMatchObject({ idUsuario: u.idUsuario, anio, periodo, metaBeca: 80, becaDeclarada: 12 });
    expect((await service.getActual(u.idUsuario)).necesitaRegistro).toBe(false);
  });

  it('editar de nuevo actualiza el mismo registro sin duplicarlo ni borrar los demas campos', async () => {
    const u = await estudiante();
    await service.actualizarActual(u.idUsuario, { metaBeca: 80, metaExtension: 20 });
    await service.actualizarActual(u.idUsuario, { becaDeclarada: 5 });
    const filas = await db.registroHorasSemestre.findMany({ where: { idUsuario: u.idUsuario } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ metaBeca: 80, metaExtension: 20, becaDeclarada: 5 });
  });

  it('el historial conserva los semestres anteriores', async () => {
    const u = await estudiante();
    await db.registroHorasSemestre.create({
      data: { idUsuario: u.idUsuario, anio: 2024, periodo: 2, metaBeca: 50, becaDeclarada: 7 },
    });
    await service.actualizarActual(u.idUsuario, { metaBeca: 60 });
    const historial = await service.getHistorial(u.idUsuario);
    expect(historial.map((h) => h.metaBeca)).toEqual([60, 50]);
  });

  it('la vista central lista al estudiante con su meta y falta', async () => {
    const u = await estudiante();
    const admin = await createIntegrationUser(db);
    userIds.push(admin.idUsuario);
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil: 'administrador' }, update: {}, create: { nombrePerfil: 'administrador' } });
    await db.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    await service.actualizarActual(u.idUsuario, { metaBeca: 100, becaDeclarada: 30 });
    await expect(service.todasLasFilas(u.idUsuario, {})).rejects.toThrow();
    const { filas } = await service.todasLasFilas(admin.idUsuario, {});
    const fila = filas.find((f) => f.idUsuario === u.idUsuario);
    expect(fila).toMatchObject({ metaBeca: 100, becaDeclarada: 30, becaAcreditada: 0, faltaBeca: 70 });
  });

  it('ordena en riesgo, luego menor a mayor avance, luego sin metas, y la paginacion por cursor no pierde ni repite filas', async () => {
    const marca = `ord${randomUUID().slice(0, 8)}`;
    const crear = async (declaradas?: number) => {
      const u = await createIntegrationUser(db);
      userIds.push(u.idUsuario);
      await db.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne: `${marca}-${userIds.length}` } });
      if (declaradas !== undefined) {
        await db.registroHorasSemestre.create({ data: { idUsuario: u.idUsuario, anio: 2024, periodo: 1, metaBeca: 100, becaDeclarada: declaradas } });
      }
      return u.idUsuario;
    };
    // semestre 2024-1 ya terminado: se espera 100 %, en riesgo si lleva menos de 80 %
    const [a, b, c, d, e, f] = [await crear(10), await crear(5), await crear(90), await crear(85), await crear(), await crear()];
    const esperado = [b, a, d, c, e, f];
    const q = { anio: 2024, periodo: 1 as const, busqueda: marca };

    const todas = await service.recorrerTodas(q);
    expect(todas.filas.map((x) => x.idUsuario)).toEqual(esperado);

    const vistas: number[] = [];
    let cursor: number | undefined;
    do {
      const pagina = await service.paginaCentral({ ...q, limit: 2, cursor });
      vistas.push(...pagina.filas.map((x) => x.idUsuario));
      cursor = pagina.siguienteCursor ?? undefined;
    } while (cursor !== undefined);
    expect(vistas).toEqual(esperado);

    const enRiesgo = await service.recorrerTodas({ ...q, enRiesgo: true });
    expect(enRiesgo.filas.map((x) => x.idUsuario)).toEqual([b, a]);
  });

  it('el comparativo del semestre actual coincide con los totales por carrera (misma poblacion y formula)', async () => {
    const admin = await createIntegrationUser(db);
    userIds.push(admin.idUsuario);
    const rol = await db.rolAcceso.upsert({ where: { nombrePerfil: 'administrador' }, update: {}, create: { nombrePerfil: 'administrador' } });
    await db.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rol.idRolAcceso } });
    const proyecto = await createIntegrationProject(db, admin.idUsuario);
    proyectoIds.push(proyecto.idProyecto);
    const rolProyecto = await createIntegrationProjectRole(db, proyecto.idProyecto);
    const aprobar = async (idUsuario: number, horas: number) => {
      const part = await createIntegrationParticipation(db, idUsuario, rolProyecto.idRolProyecto);
      await db.horasParticipacion.create({
        data: {
          idParticipacion: part.idParticipacion,
          periodoInicio: new Date(),
          periodoFin: new Date(),
          horasReportadas: horas,
          horasAprobadas: horas,
          estadoHoras: 'APROBADA',
          fechaAprobacion: new Date(),
        },
      });
    };
    const activo = await estudiante();
    const bloqueado = await estudiante();
    await db.usuario.update({ where: { idUsuario: bloqueado.idUsuario }, data: { estado: 'BLOQUEADO' } });
    const sinPerfil = await createIntegrationUser(db);
    userIds.push(sinPerfil.idUsuario);
    await service.actualizarActual(activo.idUsuario, { metaBeca: 50, becaDeclarada: 7 });
    await aprobar(activo.idUsuario, 8);
    await aprobar(bloqueado.idUsuario, 20);
    await aprobar(sinPerfil.idUsuario, 25);

    const { semestres } = await service.comparativo(admin.idUsuario);
    const { porCarrera } = await service.totales(admin.idUsuario, {});
    const suma = (campo: 'becaAcreditada' | 'becaDeclarada' | 'extensionAcreditada' | 'metaBeca') =>
      porCarrera.reduce((t, g) => t + g[campo], 0);
    expect(semestres[0].becaAcreditada).toBe(suma('becaAcreditada'));
    expect(semestres[0].becaDeclarada).toBe(suma('becaDeclarada'));
    expect(semestres[0].extensionAcreditada).toBe(suma('extensionAcreditada'));
    expect(semestres[0].metaBeca).toBe(suma('metaBeca'));
    // las horas del bloqueado y de la cuenta sin perfil no entran en ninguna cifra
    const fila = (await service.todasLasFilas(admin.idUsuario, {})).filas.find((f) => f.idUsuario === activo.idUsuario);
    expect(fila).toMatchObject({ becaDeclarada: 7, becaAcreditada: 8 });
  });
});
