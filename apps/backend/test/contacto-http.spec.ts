import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { AddressInfo } from 'node:net';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
});
import { AppModule } from '../src/app.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { getJwtSecret } from '../src/config/jwt-secret';
import { ContactoController } from '../src/contacto/contacto.controller';
import { ContactoService, MENSAJE_CONTACTO_ENVIADO } from '../src/contacto/contacto.service';
import { CreateContactoDto } from '../src/contacto/dto/create-contacto.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import { appThrottlerOptions } from './helpers/auth-http-harness';

const cookieParser = require('cookie-parser') as () => unknown;

const VALIDO = {
  nombre: 'Ana Pérez',
  correo: 'per23123@uvg.edu.gt',
  asunto: 'Consulta',
  mensaje: 'Necesito ayuda con mi cuenta.',
};

const LIMITE_CONTACTO = 5;

function definirParamtypes() {
  if (!Reflect.getMetadata(PARAMTYPES_METADATA, ContactoController)) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, [ContactoService], ContactoController);
  }
  if (!Reflect.getMetadata(PARAMTYPES_METADATA, JwtStrategy)) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, [PrismaService], JwtStrategy);
  }
  if (!Reflect.getMetadata(PARAMTYPES_METADATA, ContactoController.prototype, 'enviar')) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, [CreateContactoDto, Object], ContactoController.prototype, 'enviar');
  }
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(estadoUsuario: string | null = 'ACTIVO') {
  definirParamtypes();
  const contacto = { enviar: vi.fn().mockResolvedValue({ mensaje: MENSAJE_CONTACTO_ENVIADO }) };
  const prisma = {
    usuario: { findUnique: vi.fn().mockResolvedValue(estadoUsuario ? { estado: estadoUsuario, sesionVersion: 0 } : null) },
  };

  @Module({
    imports: [PassportModule, ThrottlerModule.forRoot(appThrottlerOptions(AppModule))],
    controllers: [ContactoController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      JwtStrategy,
      { provide: ContactoService, useValue: contacto },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  })
  class ContactoHarnessModule {}

  app = await NestFactory.create(ContactoHarnessModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/api/contacto`, contacto };
}

function enviar(url: string, body: unknown, cookie?: string) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function token(idUsuario: number) {
  return new JwtService({ secret: getJwtSecret() }).sign({ sub: idUsuario, correo: 'per23123@uvg.edu.gt', tipo: 'access' });
}

describe('POST /contacto — contrato HTTP', () => {
  it('es público: sin sesión responde 201 y envía sin usuario', async () => {
    const { url, contacto } = await start();

    const res = await enviar(url, VALIDO);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ mensaje: MENSAJE_CONTACTO_ENVIADO });
    expect(contacto.enviar).toHaveBeenCalledWith(expect.objectContaining(VALIDO), null);
  });

  it('con sesión válida envía el id del usuario autenticado', async () => {
    const { url, contacto } = await start();

    const res = await enviar(url, VALIDO, `access_token=${token(7)}`);

    expect(res.status).toBe(201);
    expect(contacto.enviar).toHaveBeenCalledWith(expect.objectContaining(VALIDO), 7);
  });

  it('una sesión inválida o de una cuenta no activa no bloquea: se envía como anónimo', async () => {
    const invalida = await start();
    expect((await enviar(invalida.url, VALIDO, 'access_token=no-es-un-jwt')).status).toBe(201);
    expect(invalida.contacto.enviar).toHaveBeenCalledWith(expect.anything(), null);
    await app?.close();

    const inactiva = await start('BLOQUEADO');
    expect((await enviar(inactiva.url, VALIDO, `access_token=${token(9)}`)).status).toBe(201);
    expect(inactiva.contacto.enviar).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('responde 400 con el error de cada campo inválido y no envía nada', async () => {
    const { url, contacto } = await start();

    const res = await enviar(url, { nombre: '', correo: 'no-es-correo', asunto: '   ', mensaje: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
    const { message } = (await res.json()) as { message: string[] };
    expect(message).toEqual(
      expect.arrayContaining([
        'El nombre es obligatorio',
        'El correo no tiene un formato válido',
        'El asunto es obligatorio',
        'El mensaje no puede exceder 2000 caracteres',
      ]),
    );
    expect(contacto.enviar).not.toHaveBeenCalled();
  });

  it('rechaza campos que no son del formulario', async () => {
    const { url, contacto } = await start();

    const res = await enviar(url, { ...VALIDO, idUsuario: 1 });

    expect(res.status).toBe(400);
    expect(contacto.enviar).not.toHaveBeenCalled();
  });

  it(`aplica el mismo límite que login y registro: ${LIMITE_CONTACTO} por minuto`, async () => {
    const { url, contacto } = await start();

    const estados: number[] = [];
    for (let i = 0; i <= LIMITE_CONTACTO; i += 1) {
      estados.push((await enviar(url, VALIDO)).status);
    }

    expect(estados).toEqual([...Array(LIMITE_CONTACTO).fill(201), 429]);
    expect(contacto.enviar).toHaveBeenCalledTimes(LIMITE_CONTACTO);
  });
});
