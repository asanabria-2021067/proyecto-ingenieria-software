import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationParticipation,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationUser,
} from './setup/fixtures';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { getJwtSecret } from '../../src/config/jwt-secret';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PerfilSocialService } from '../../src/social/perfil-social.service';
import { DisponibilidadSemanalService } from '../../src/perfil-portafolio/disponibilidad-semanal.service';
import { EnlacesPerfilService } from '../../src/perfil-portafolio/enlaces-perfil.service';
import { HabilidadConfirmacionesService } from '../../src/perfil-portafolio/habilidad-confirmaciones.service';
import { PerfilPortafolioController } from '../../src/perfil-portafolio/perfil-portafolio.controller';
import { PortafolioPublicoController } from '../../src/perfil-portafolio/portafolio-publico.controller';
import { PortafolioService } from '../../src/perfil-portafolio/portafolio.service';
import { SemestreResumenService } from '../../src/perfil-portafolio/semestre-resumen.service';
import { ReplaceDisponibilidadDto, ReplaceEnlacesDto, UpdatePortafolioDto } from '../../src/perfil-portafolio/dto/perfil-portafolio.dto';

const cookieParser = require('cookie-parser') as () => unknown;

function definirParamtypes() {
  const tabla: [unknown, unknown[]][] = [
    [PerfilPortafolioController, [PortafolioService, HabilidadConfirmacionesService, DisponibilidadSemanalService, EnlacesPerfilService, SemestreResumenService]],
    [PortafolioPublicoController, [PortafolioService]],
    [JwtStrategy, [PrismaService]],
  ];
  for (const [clase, deps] of tabla) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, clase as object)) Reflect.defineMetadata(PARAMTYPES_METADATA, deps, clase as object);
  }
  const metodos: [string, unknown[]][] = [
    ['actualizarPortafolio', [Object, UpdatePortafolioDto]],
    ['reemplazarDisponibilidad', [Object, ReplaceDisponibilidadDto]],
    ['reemplazarEnlaces', [Object, ReplaceEnlacesDto]],
  ];
  for (const [metodo, tipos] of metodos) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, PerfilPortafolioController.prototype, metodo)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, tipos, PerfilPortafolioController.prototype, metodo);
    }
  }
}

describeIntegration('perfil y portafolio — contrato HTTP (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  const marca = `${Date.now()}`;
  const ids = { ana: 0, beto: 0, carla: 0, proyecto: 0, carrera: 0, habilidad: 0 };
  const tokens: Record<string, string> = {};

  const llamar = (metodo: string, ruta: string, quien?: string, body?: unknown) =>
    fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(quien ? { authorization: `Bearer ${tokens[quien]}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    await prisma.$connect();
    definirParamtypes();
    const prismaService = prisma as unknown as PrismaService;
    const perfilSocial = new PerfilSocialService(prismaService, {} as never, {} as never);
    const confirmaciones = new HabilidadConfirmacionesService(prismaService);
    const portafolio = new PortafolioService(prismaService, perfilSocial, confirmaciones);
    const disponibilidad = new DisponibilidadSemanalService(prismaService);
    const enlaces = new EnlacesPerfilService(prismaService, { preview: async () => ({ url: '', titulo: 'Titulo', descripcion: null, sitio: 'Sitio' }) } as never);
    const semestre = new SemestreResumenService(prismaService, {} as never);

    @Module({
      imports: [PassportModule],
      controllers: [PerfilPortafolioController, PortafolioPublicoController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        JwtStrategy,
        { provide: PortafolioService, useValue: portafolio },
        { provide: HabilidadConfirmacionesService, useValue: confirmaciones },
        { provide: DisponibilidadSemanalService, useValue: disponibilidad },
        { provide: EnlacesPerfilService, useValue: enlaces },
        { provide: SemestreResumenService, useValue: semestre },
      ],
    })
    class HarnessModule {}

    app = await NestFactory.create(HarnessModule, { logger: false });
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    const carrera = await prisma.carrera.create({ data: { nombreCarrera: `Carrera portafolio ${marca}` } });
    ids.carrera = carrera.idCarrera;
    const crear = async (clave: 'ana' | 'beto' | 'carla', nombre: string, carne: string) => {
      const u = await createIntegrationUser(prisma, { nombre, apellido: 'Prueba' });
      ids[clave] = u.idUsuario;
      await prisma.perfilEstudiante.create({ data: { idUsuario: u.idUsuario, carne, idCarrera: carrera.idCarrera, horasBecaRequeridas: 80 } });
      tokens[clave] = new JwtService({ secret: getJwtSecret() }).sign({ sub: u.idUsuario, correo: u.correo, tipo: 'access' });
    };
    await crear('ana', 'Ana', `9${marca}1`);
    await crear('beto', 'Beto', `9${marca}2`);
    await crear('carla', 'Carla', `9${marca}3`);

    const habilidad = await prisma.habilidad.create({ data: { nombreHabilidad: `Habilidad portafolio ${marca}` } });
    ids.habilidad = habilidad.idHabilidad;
    await prisma.usuarioHabilidad.create({ data: { idUsuario: ids.ana, idHabilidad: habilidad.idHabilidad, nivelHabilidad: 'AVANZADO' } });

    // Ana y Beto compartieron un proyecto ya cerrado; Carla no comparte nada.
    const proyecto = await createIntegrationProject(prisma, ids.beto, { tituloProyecto: `Proyecto cerrado ${marca}`, estadoProyecto: 'CERRADO' });
    ids.proyecto = proyecto.idProyecto;
    const rol = await createIntegrationProjectRole(prisma, proyecto.idProyecto, { nombreRol: 'Desarrolladora' });
    await createIntegrationParticipation(prisma, ids.ana, rol.idRolProyecto, { estadoParticipacion: 'COMPLETADO' });
  }, 60_000);

  afterAll(async () => {
    try {
      const usuarios = [ids.ana, ids.beto, ids.carla].filter((id) => id > 0);
      await prisma.confirmacionHabilidad.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.portafolioPublico.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.disponibilidadSemanal.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.enlacePerfil.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuarioHabilidad.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.participacionProyecto.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (ids.proyecto) {
        await prisma.rolProyecto.deleteMany({ where: { idProyecto: ids.proyecto } });
        await prisma.proyecto.deleteMany({ where: { idProyecto: ids.proyecto } });
      }
      await prisma.perfilEstudiante.deleteMany({ where: { idUsuario: { in: usuarios } } });
      await prisma.usuario.deleteMany({ where: { idUsuario: { in: usuarios } } });
      if (ids.habilidad) await prisma.habilidad.deleteMany({ where: { idHabilidad: ids.habilidad } });
      if (ids.carrera) await prisma.carrera.deleteMany({ where: { idCarrera: ids.carrera } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('la ruta publica responde 200 solo con un token valido y activo; desactivar o regenerar la cierra al instante', async () => {
    expect((await llamar('GET', '/perfil/me/portafolio')).status).toBe(401);
    expect((await (await llamar('GET', '/perfil/me/portafolio', 'ana')).json())).toEqual({ activo: false, indexable: false, token: null });

    const activado = await (await llamar('PUT', '/perfil/me/portafolio', 'ana', { activo: true })).json();
    expect(activado.activo).toBe(true);
    expect(activado.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Sin sesion ni cookies.
    const publica = await fetch(`${url}/publico/portafolio/${activado.token}`);
    expect(publica.status).toBe(200);
    expect(publica.headers.get('cache-control')).toBe('no-store');
    expect(publica.headers.get('x-robots-tag')).toContain('noindex');
    expect(publica.headers.get('set-cookie')).toBeNull();
    const cuerpo = await publica.json();
    expect(Object.keys(cuerpo).sort()).toEqual(['carrera', 'habilidades', 'indexable', 'nombre', 'proyectos']);
    expect(cuerpo.nombre).toBe('Ana Prueba');
    expect(cuerpo.habilidades).toEqual([{ nombre: `Habilidad portafolio ${marca}`, nivel: 'AVANZADO', confirmaciones: 0 }]);
    expect(cuerpo.proyectos).toEqual([{ titulo: `Proyecto cerrado ${marca}`, rol: 'Desarrolladora' }]);
    const texto = JSON.stringify(cuerpo);
    expect(texto).not.toContain('@example.test');
    expect(texto).not.toContain(`9${marca}1`); // carne
    expect(texto).not.toMatch(/horas|correo|carne|telefono/i);

    // Tokens ajenos o inventados: 404.
    expect((await fetch(`${url}/publico/portafolio/${'x'.repeat(43)}`)).status).toBe(404);
    expect((await fetch(`${url}/publico/portafolio/${ids.ana}`)).status).toBe(404);

    // Regenerar: el enlace anterior muere de inmediato.
    const nuevo = await (await llamar('POST', '/perfil/me/portafolio/regenerar', 'ana')).json();
    expect(nuevo.token).not.toBe(activado.token);
    expect((await fetch(`${url}/publico/portafolio/${activado.token}`)).status).toBe(404);
    expect((await fetch(`${url}/publico/portafolio/${nuevo.token}`)).status).toBe(200);

    // Desactivar: 404 de inmediato.
    await llamar('PUT', '/perfil/me/portafolio', 'ana', { activo: false });
    expect((await fetch(`${url}/publico/portafolio/${nuevo.token}`)).status).toBe(404);
  });

  it('las demas GET del perfil siguen exigiendo sesion', async () => {
    for (const ruta of [`/perfil/${ids.ana}/habilidades`, `/perfil/${ids.ana}/disponibilidad`, `/perfil/${ids.ana}/enlaces`, '/perfil/me/semestre']) {
      expect((await llamar('GET', ruta)).status, ruta).toBe(401);
    }
  });

  it('confirmaciones: solo companeros de proyecto, una vez por habilidad, no las propias y se pueden retirar', async () => {
    const ruta = `/perfil/${ids.ana}/habilidades/${ids.habilidad}/confirmacion`;
    expect((await llamar('PUT', ruta, 'ana')).status).toBe(403); // propia
    expect((await llamar('PUT', ruta, 'carla')).status).toBe(403); // sin proyecto compartido
    expect((await llamar('PUT', ruta, 'beto')).status).toBe(200);
    expect((await llamar('PUT', ruta, 'beto')).status).toBe(409); // restriccion unica

    const vistaBeto = await (await llamar('GET', `/perfil/${ids.ana}/habilidades`, 'beto')).json();
    expect(vistaBeto[0]).toMatchObject({ confirmaciones: 1, confirmadaPorMi: true, puedoConfirmar: false });
    const vistaAna = await (await llamar('GET', `/perfil/${ids.ana}/habilidades`, 'ana')).json();
    expect(vistaAna[0]).toMatchObject({ confirmaciones: 1, puedoConfirmar: false });

    expect((await llamar('DELETE', ruta, 'carla')).status).toBe(404); // no era suya
    expect((await llamar('DELETE', ruta, 'beto')).status).toBe(200);
    expect((await llamar('PUT', ruta, 'beto')).status).toBe(200); // vuelve a poder confirmar
    await llamar('DELETE', ruta, 'beto');
  });

  it('disponibilidad: solo la propia persona la edita y los demas la leen con zona horaria de Guatemala', async () => {
    const guardada = await llamar('PUT', '/perfil/me/disponibilidad', 'ana', { bloques: [{ dia: 0, hora: 9 }, { dia: 0, hora: 9 }, { dia: 4, hora: 16 }] });
    expect(await guardada.json()).toEqual({ zonaHoraria: 'America/Guatemala', bloques: [{ dia: 0, hora: 9 }, { dia: 4, hora: 16 }] });
    const ajena = await (await llamar('GET', `/perfil/${ids.ana}/disponibilidad`, 'carla')).json();
    expect(ajena.bloques).toHaveLength(2);
    // Un bloque fuera de rango o campos extra se rechazan.
    expect((await llamar('PUT', '/perfil/me/disponibilidad', 'ana', { bloques: [{ dia: 7, hora: 9 }] })).status).toBe(400);
    expect((await llamar('PUT', '/perfil/me/disponibilidad', 'ana', { bloques: [{ dia: 1, hora: 24 }] })).status).toBe(400);
    expect((await llamar('PUT', '/perfil/me/disponibilidad', 'ana', { idUsuario: ids.beto, bloques: [] })).status).toBe(400);
    // El PUT de Carla solo toca lo de Carla.
    await llamar('PUT', '/perfil/me/disponibilidad', 'carla', { bloques: [{ dia: 2, hora: 8 }] });
    expect((await (await llamar('GET', `/perfil/${ids.ana}/disponibilidad`, 'beto')).json()).bloques).toHaveLength(2);
    // La restriccion de la base tambien protege contra valores fuera de rango.
    await expect(prisma.disponibilidadSemanal.create({ data: { idUsuario: ids.ana, diaSemana: 9, hora: 1 } })).rejects.toThrow();
  });

  it('enlaces: solo https, maximo 5 y solo la propia persona edita', async () => {
    expect((await llamar('PUT', '/perfil/me/enlaces', 'ana', { urls: ['http://inseguro.dev'] })).status).toBe(400);
    expect((await llamar('PUT', '/perfil/me/enlaces', 'ana', { urls: ['https://127.0.0.1/x'] })).status).toBe(400);
    expect((await llamar('PUT', '/perfil/me/enlaces', 'ana', { urls: Array.from({ length: 6 }, (_, i) => `https://s${i}.dev`) })).status).toBe(400);
    const ok = await llamar('PUT', '/perfil/me/enlaces', 'ana', { urls: ['https://github.com/ana', 'https://ana.dev'] });
    expect(ok.status).toBe(200);
    expect((await ok.json()).map((e: { tipo: string }) => e.tipo)).toEqual(['GITHUB', 'SITIO']);
    expect((await (await llamar('GET', `/perfil/${ids.ana}/enlaces`, 'beto')).json())).toHaveLength(2);
    await llamar('PUT', '/perfil/me/enlaces', 'beto', { urls: [] });
    expect((await (await llamar('GET', `/perfil/${ids.ana}/enlaces`, 'carla')).json())).toHaveLength(2);
  });

  it('un usuario que no esta en el directorio (inactivo) responde 404 al resto', async () => {
    await prisma.usuario.update({ where: { idUsuario: ids.carla }, data: { estado: 'INACTIVO' } });
    try {
      for (const ruta of [`/perfil/${ids.carla}/habilidades`, `/perfil/${ids.carla}/disponibilidad`, `/perfil/${ids.carla}/enlaces`]) {
        expect((await llamar('GET', ruta, 'beto')).status, ruta).toBe(404);
      }
    } finally {
      await prisma.usuario.update({ where: { idUsuario: ids.carla }, data: { estado: 'ACTIVO' } });
    }
  });
});
