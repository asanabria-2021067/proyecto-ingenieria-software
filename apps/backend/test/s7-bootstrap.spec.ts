import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { StorageModule } from '../src/storage/storage.module';
import {
  ClosurePdfValidationService,
  PDF_PARSE_MAX_CONCURRENCY,
  PDF_PARSE_TIMEOUT_MS,
} from '../src/storage/closure-pdf-validation.service';
import { ClosureCryptoService } from '../src/storage/closure-crypto.service';
import { ClosureTicketService } from '../src/storage/closure-ticket.service';
import { CloudinaryClosureStorageAdapter } from '../src/storage/cloudinary-closure-storage.adapter';
import { CLOUDINARY_CLOSURE_PORT } from '../src/storage/closure-storage.port';

/**
 * Regresión de ARRANQUE del contenedor de inyección (06 v2 §39/§48).
 *
 * Existe por un defecto real que llegó hasta el despliegue: los dos
 * presupuestos numéricos de `ClosurePdfValidationService` se emitían como
 * `design:paramtypes = [Number, Number]`, el contenedor intentaba resolver un
 * proveedor llamado `Number` y la aplicación abortaba con
 * `UnknownDependenciesException` antes de atender la primera petición.
 *
 * Nada de lo que ya existía podía verlo:
 *
 *  - `nest build` compila igual: la inyección no se resuelve en compilación.
 *  - Las suites construyen los services A MANO (`new ClosurePdfValidationService()`),
 *    así que los valores por defecto funcionaban y Nest nunca intervenía.
 *  - `s7-modules-and-routes.spec.ts` (T36-A) introspecciona los metadatos de
 *    `@Module`: demuestra que el grafo es acíclico y que cada provider se
 *    declara una vez, pero NO que el contenedor sepa instanciarlos.
 *
 * Por eso esta prueba levanta un contenedor de Nest REAL con
 * `NestFactory.createApplicationContext` y le pide los providers por token. Si
 * alguien vuelve a introducir una dependencia irresoluble en `StorageModule`,
 * la creación del contexto falla aquí y no en producción.
 *
 * El repositorio no instala `@nestjs/testing` (ver `test/s7-environment.spec.ts`
 * y `test/tasks-queries.controller.spec.ts`), así que se usa la factoría real
 * de Nest, que además es exactamente lo que ejecuta `main.ts`.
 *
 * `AppModule` completo no sirve para esta regresión: arrastra Prisma —que
 * conecta en `onModuleInit`— y el store de Redis, de modo que exigiría I/O
 * externo. Se importa el `StorageModule` REAL, que es la composición donde
 * vivía el defecto, con el `ConfigModule` que sus providers necesitan.
 */

/**
 * Configuración SINTÉTICA. `ignoreEnvFile` impide leer el `.env` real: esta
 * prueba no necesita ningún secreto y no debe poder tocarlos.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          closure: {
            disponible: false,
            faltantes: ['CLOSURE_KEKS'],
            motivos: [],
          },
        }),
      ],
    }),
    StorageModule,
  ],
})
class BootstrapFixtureModule {}

describe('S7 arranque del contenedor de inyección', () => {
  let context: INestApplicationContext | null = null;
  let loggerSilenciado: typeof Logger.prototype.error;

  beforeEach(() => {
    // Nest registra el fallo de resolución por consola antes de propagarlo;
    // en una prueba que espera éxito ese ruido no aporta nada.
    loggerSilenciado = Logger.prototype.error;
    Logger.prototype.error = () => undefined;
  });

  afterEach(async () => {
    Logger.prototype.error = loggerSilenciado;
    // Cerrar SIEMPRE: un contexto vivo dejaría el proceso de vitest colgado.
    if (context) {
      await context.close();
      context = null;
    }
  });

  it('el contenedor real resuelve StorageModule y sus cuatro providers sin UnknownDependenciesException', async () => {
    // El propio `createApplicationContext` es la aserción principal: si un
    // provider no se puede construir, esta llamada RECHAZA.
    context = await NestFactory.createApplicationContext(BootstrapFixtureModule, {
      logger: false,
      abortOnError: false,
    });
    expect(context).toBeDefined();

    // Resolución por TOKEN a través de la inyección real, no construcción manual.
    const validator = context.get(ClosurePdfValidationService);
    expect(validator).toBeInstanceOf(ClosurePdfValidationService);

    // El resto del módulo también debe resolver: un fallo aquí sería el mismo
    // tipo de defecto en otro provider.
    expect(context.get(ClosureCryptoService)).toBeInstanceOf(ClosureCryptoService);
    expect(context.get(ClosureTicketService)).toBeInstanceOf(ClosureTicketService);
    expect(context.get(CloudinaryClosureStorageAdapter)).toBeInstanceOf(
      CloudinaryClosureStorageAdapter,
    );
    // El puerto se declara con `useExisting`: debe apuntar al mismo adaptador.
    expect(context.get(CLOUDINARY_CLOSURE_PORT)).toBe(
      context.get(CloudinaryClosureStorageAdapter),
    );

    // ── Los presupuestos por defecto se CONSERVAN.
    //
    //    `@Optional()` hace que Nest inyecte `undefined`, con lo que entran en
    //    juego los valores por defecto de TypeScript. Si en su lugar llegara
    //    `undefined` hasta las propiedades, o un 0 accidental, el semáforo y el
    //    presupuesto de parseo dejarían de proteger el proceso.
    const presupuestos = validator as unknown as {
      timeoutMs: number;
      maxConcurrency: number;
    };
    expect(presupuestos.timeoutMs).toBe(PDF_PARSE_TIMEOUT_MS);
    expect(presupuestos.maxConcurrency).toBe(PDF_PARSE_MAX_CONCURRENCY);
    expect(Number.isInteger(presupuestos.timeoutMs)).toBe(true);
    expect(Number.isInteger(presupuestos.maxConcurrency)).toBe(true);
    expect(presupuestos.timeoutMs).toBeGreaterThan(0);
    expect(presupuestos.maxConcurrency).toBeGreaterThan(0);

    // Los overrides explícitos siguen funcionando: son parámetros de ajuste,
    // no dependencias, y las pruebas los usan para estrechar los presupuestos.
    const ajustado = new ClosurePdfValidationService(1_234, 1);
    const ajustadoPresupuestos = ajustado as unknown as {
      timeoutMs: number;
      maxConcurrency: number;
    };
    expect(ajustadoPresupuestos.timeoutMs).toBe(1_234);
    expect(ajustadoPresupuestos.maxConcurrency).toBe(1);
  }, 30_000);
});

/**
 * Segunda mitad de la regresión, y la que realmente atrapa ESTE defecto.
 *
 * Vitest transpila con esbuild, que NO emite `design:paramtypes`. Por eso un
 * contenedor de Nest levantado dentro de la suite construye el servicio sin
 * problema aunque el constructor declare parámetros primitivos: la metadata que
 * causa el fallo ni siquiera existe en ese entorno. Solo `nest build` —tsc con
 * `emitDecoratorMetadata`— la emite, y por eso el defecto únicamente se
 * manifestaba en el artefacto desplegado.
 *
 * La comprobación se hace, entonces, sobre `dist/`: el artefacto que se
 * despliega. Para cada clase marcada con `@Injectable`, todo parámetro de
 * constructor cuyo tipo emitido sea un primitivo —`Number`, `String`,
 * `Boolean`— o `Object` es irresoluble como token de inyección y debe estar
 * declarado `@Optional()` o `@Inject()`. Si no lo está, Nest aborta al arrancar.
 *
 * El escaneo corre en un PROCESO APARTE: cargar el artefacto tiene efectos de
 * importación —clientes, gateways, y sobre todo `main.js`, que levantaría el
 * servidor— que no deben ocurrir dentro del worker de vitest.
 */
describe('S7 metadata de inyección del artefacto compilado', () => {
  const DIST = path.resolve(__dirname, '..', 'dist');

  it('ningún provider compilado deja un parámetro primitivo sin marcar como opcional', () => {
    expect(
      fs.existsSync(DIST),
      'No existe dist/. Esta regresión audita el ARTEFACTO desplegado: ejecuta `npm run build` antes.',
    ).toBe(true);

    const scanner = `
      require('reflect-metadata');
      const fs = require('node:fs');
      const path = require('node:path');
      const DIST = ${JSON.stringify(DIST)};
      // main.js arranca el servidor al importarse; queda fuera por completo.
      const EXCLUIDOS = new Set(['main.js']);
      const NO_INYECTABLES = new Set(['Number', 'String', 'Boolean', 'Object']);
      const listar = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return listar(full);
        if (!e.isFile() || !e.name.endsWith('.js')) return [];
        return EXCLUIDOS.has(path.relative(DIST, full)) ? [] : [full];
      });
      const infractores = [];
      let providers = 0;
      for (const archivo of listar(DIST)) {
        let modulo;
        try { modulo = require(archivo); } catch { continue; }
        for (const [nombre, exportado] of Object.entries(modulo)) {
          if (typeof exportado !== 'function') continue;
          if (Reflect.getMetadata('__injectable__', exportado) !== true) continue;
          providers += 1;
          const tipos = Reflect.getMetadata('design:paramtypes', exportado) || [];
          const opcionales = new Set(Reflect.getMetadata('optional:paramtypes', exportado) || []);
          const declarados = new Set(
            (Reflect.getMetadata('self:paramtypes', exportado) || []).map((d) => d.index),
          );
          tipos.forEach((tipo, indice) => {
            const t = tipo && tipo.name;
            if (!t || !NO_INYECTABLES.has(t)) return;
            if (opcionales.has(indice) || declarados.has(indice)) return;
            infractores.push(
              nombre + ' (' + path.relative(DIST, archivo) + ') parámetro ' + indice + ': ' + t +
              ' no es resoluble y no está marcado @Optional() ni @Inject()'
            );
          });
        }
      }
      // Marcador: al importar el artefacto, Nest escribe avisos en stdout.
      process.stdout.write('\\n__SCAN__' + JSON.stringify({ infractores, providers }) + '\\n');
    `;

    const salida = execFileSync(process.execPath, ['-e', scanner], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60_000,
      // Entorno sintético: ningún módulo del artefacto debe leer secretos reales.
      // Entorno SINTÉTICO completo: `dist/app.module.js` valida el entorno al
      // importarse, así que necesita valores presentes. Ninguno es real y
      // ninguno se lee del `.env` del repositorio.
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FRONTEND_URL: 'http://localhost:3000',
        JWT_SECRET: 'synthetic-jwt-secret-for-bootstrap-scan',
        REDIS_HOST: 'redis.test.local',
        REDIS_PORT: '6380',
        DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
        DIRECT_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
      },
    });
    const marcada = salida
      .split('\n')
      .reverse()
      .find((linea) => linea.startsWith('__SCAN__'));
    expect(marcada, `El escaneo no emitió resultado. Salida:\n${salida.slice(-800)}`).toBeDefined();
    const { infractores, providers } = JSON.parse(
      (marcada as string).slice('__SCAN__'.length),
    ) as { infractores: string[]; providers: number };

    // Si esta lista deja de estar vacía, la aplicación NO arranca.
    expect(infractores).toEqual([]);
    // Guardarraíl del propio guardarraíl: si no se auditó ningún provider, no
    // se está probando nada.
    expect(providers).toBeGreaterThan(20);
  }, 90_000);
});
