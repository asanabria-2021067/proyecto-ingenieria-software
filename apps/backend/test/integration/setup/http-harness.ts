import 'reflect-metadata';
import { Module, ValidationPipe, type INestApplication, type Provider, type Type } from '@nestjs/common';
import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@prisma/client';
import type { AddressInfo } from 'node:net';
import { JwtStrategy } from '../../../src/auth/jwt.strategy';
import { ProjectWriteGuard } from '../../../src/common/guards/project-write.guard';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { SYNTHETIC_JWT_SECRET } from '../../helpers/synthetic-jwt-secret';

const cookieParser = require('cookie-parser') as () => unknown;

/**
 * Arnés HTTP real para suites de integración: levanta con `NestFactory` los
 * controladores recibidos tal como los sirve `main.ts` —prefijo `/api`,
 * cookies y el mismo `ValidationPipe` global— con el `JwtAuthGuard` y la
 * `JwtStrategy` reales contra la base de integración, y el `ProjectWriteGuard`
 * real para las rutas de escritura.
 *
 * El proyecto no instala `@nestjs/testing` ni supertest y el transform de
 * Vitest no emite `design:paramtypes` (mismo motivo que
 * `test/helpers/auth-http-harness.ts`), así que las dependencias de cada
 * controlador se declaran explícitamente y los servicios llegan ya
 * construidos como `useValue`. Escucha solo en loopback con puerto efímero.
 */

export interface HarnessController {
  controller: Type<unknown>;
  /** Tokens del constructor del controlador, en orden. */
  deps: Type<unknown>[];
  /**
   * Tipos de los parámetros de cada handler, en orden. El `ValidationPipe`
   * solo valida un `@Body()`/`@Query()` cuyo tipo conoce, y ese dato tampoco
   * lo emite el transform de Vitest.
   */
  handlers?: Record<string, unknown[]>;
}

export interface IntegrationHttpHarness {
  url: string;
  app: INestApplication;
  close: () => Promise<void>;
}

function declareParamTypes(target: Type<unknown>, deps: unknown[]): void {
  if (!Reflect.getMetadata(PARAMTYPES_METADATA, target)) {
    Reflect.defineMetadata(PARAMTYPES_METADATA, deps, target);
  }
}

export async function startIntegrationHttpHarness(options: {
  prisma: PrismaClient;
  controllers: HarnessController[];
  providers: Provider[];
}): Promise<IntegrationHttpHarness> {
  const prisma = options.prisma as unknown as PrismaService;
  for (const { controller, deps, handlers } of options.controllers) {
    declareParamTypes(controller, deps);
    for (const [handler, types] of Object.entries(handlers ?? {})) {
      if (!Reflect.getMetadata(PARAMTYPES_METADATA, controller.prototype, handler)) {
        Reflect.defineMetadata(PARAMTYPES_METADATA, types, controller.prototype, handler);
      }
    }
  }
  declareParamTypes(ProjectWriteGuard, [Reflector, ProjectIdResolverService, ProjectPolicyService, PrismaService]);

  const resolver = new ProjectIdResolverService(prisma);

  @Module({
    controllers: options.controllers.map((entry) => entry.controller),
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: ProjectIdResolverService, useValue: resolver },
      { provide: ProjectPolicyService, useValue: new ProjectPolicyService(resolver) },
      // Registra la estrategia `jwt` de passport que usa el JwtAuthGuard real.
      { provide: JwtStrategy, useValue: new JwtStrategy(prisma) },
      ...options.providers,
    ],
  })
  class IntegrationHttpHarnessModule {}

  const app = await NestFactory.create(IntegrationHttpHarnessModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Misma configuración que apps/backend/src/main.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/api`, app, close: () => app.close() };
}

/** Access token con la misma forma que emite AuthService (`tipo: 'access'`). */
export function accessTokenFor(user: { idUsuario: number; correo: string }): string {
  return new JwtService({}).sign(
    { sub: user.idUsuario, correo: user.correo, tipo: 'access' },
    { secret: SYNTHETIC_JWT_SECRET, expiresIn: '5m' },
  );
}

export async function requestJson(
  url: string,
  init: { method?: 'GET' | 'POST'; token?: string; body?: unknown } = {},
  // El cuerpo es JSON arbitrario de la API; cada suite afirma su forma.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // cuerpo no JSON
  }
  return { status: response.status, body: parsed };
}
