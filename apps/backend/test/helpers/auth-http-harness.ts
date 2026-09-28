import 'reflect-metadata';
import { Module, type DynamicModule, type INestApplication, type Type } from '@nestjs/common';
import { MODULE_METADATA, PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, getOptionsToken, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AddressInfo } from 'node:net';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';

const cookieParser = require('cookie-parser') as () => unknown;

/**
 * G04: arnés HTTP real para las rutas de auth. El proyecto no instala
 * `@nestjs/testing` ni supertest y el transform de Vitest no emite
 * `design:paramtypes`, así que se levanta con `NestFactory` un módulo mínimo:
 * el `ThrottlerModule` con las opciones REALES de `AppModule`, el
 * `ThrottlerGuard` global y el controlador de auth con un `AuthService` falso.
 * Escucha solo en loopback con puerto efímero.
 */

/** Opciones de `ThrottlerModule.forRoot(...)` tal como las declara AppModule. */
export function appThrottlerOptions(appModule: Type<unknown>): ThrottlerModuleOptions {
  const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, appModule) ?? []) as unknown[];
  const throttler = imports.find(
    (entry): entry is DynamicModule => (entry as DynamicModule)?.module === ThrottlerModule,
  );
  const provider = throttler?.providers?.find(
    (candidate) => (candidate as { provide?: unknown }).provide === getOptionsToken(),
  ) as { useValue?: ThrottlerModuleOptions } | undefined;
  if (!provider?.useValue) {
    throw new Error('AppModule no registra ThrottlerModule.forRoot');
  }
  return provider.useValue;
}

export interface HarnessApp {
  url: string;
  app: INestApplication;
  close: () => Promise<void>;
}

export interface HarnessOptions {
  throttler: ThrottlerModuleOptions;
  authService: Partial<Record<keyof AuthService, unknown>>;
  /** Controladores alternativos (fixtures negativos); por defecto, el real. */
  controllers?: Type<unknown>[];
  /** Hook sobre la app Express antes de escuchar (p. ej. trust proxy). */
  configure?: (app: INestApplication) => void;
}

export async function startAuthHarness(options: HarnessOptions): Promise<HarnessApp> {
  const controllers = options.controllers ?? [AuthController];
  for (const controller of controllers) {
    if (!Reflect.getMetadata(PARAMTYPES_METADATA, controller)) {
      Reflect.defineMetadata(PARAMTYPES_METADATA, [AuthService], controller);
    }
  }

  @Module({
    imports: [ThrottlerModule.forRoot(options.throttler)],
    controllers,
    providers: [
      { provide: AuthService, useValue: options.authService },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  })
  class AuthHarnessModule {}

  const app = await NestFactory.create(AuthHarnessModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  options.configure?.(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/api`, app, close: () => app.close() };
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
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
