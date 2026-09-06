import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';

/**
 * T36 (06 v2 §39/§48): el grafo de módulos y la tabla de rutas reales.
 *
 * El contrato no es «que arranque»: es que el grafo QUE SE DISEÑÓ sea el grafo
 * que existe. Un ciclo escondido tras `forwardRef` compila igual de bien y
 * destruye la razón por la que las fronteras se dibujaron donde están, así que
 * aquí se comprueban las aristas prohibidas una por una.
 *
 * El repositorio NO instala `@nestjs/testing` (ver la nota de
 * `test/s7-environment.spec.ts:105` y `test/tasks-queries.controller.spec.ts`),
 * así que la verificación es por introspección de metadatos del decorador
 * `@Module`, que es donde vive el grafo real, y no por compilación de un
 * contenedor de pruebas.
 */

type ModuleEntry = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference;

const SRC_ROOT = path.resolve(__dirname, '..', 'src');

function isDynamicModule(entry: unknown): entry is DynamicModule {
  return typeof entry === 'object' && entry !== null && 'module' in entry;
}

async function resolveModuleEntry(entry: ModuleEntry): Promise<Type<unknown> | DynamicModule> {
  const awaited = await entry;
  if (typeof awaited === 'object' && awaited !== null && 'forwardRef' in awaited) {
    return (awaited as ForwardReference).forwardRef() as Type<unknown>;
  }
  return awaited as Type<unknown> | DynamicModule;
}

function metadataOf(moduleClass: Type<unknown>, key: string): unknown[] {
  return (Reflect.getMetadata(key, moduleClass) ?? []) as unknown[];
}

function moduleImportsOf(moduleClass: Type<unknown>): ModuleEntry[] {
  return metadataOf(moduleClass, MODULE_METADATA.IMPORTS) as ModuleEntry[];
}

function moduleProvidersOf(moduleClass: Type<unknown>): unknown[] {
  return metadataOf(moduleClass, MODULE_METADATA.PROVIDERS);
}

/** Nombres de los módulos que `moduleClass` importa, resueltos a su clase. */
async function importedModuleNames(moduleClass: Type<unknown>): Promise<string[]> {
  const names: string[] = [];
  for (const entry of moduleImportsOf(moduleClass)) {
    const resolved = await resolveModuleEntry(entry);
    names.push(isDynamicModule(resolved) ? resolved.module.name : resolved.name);
  }
  return names;
}

interface ModuleGraph {
  /** Cuántas veces aparece cada módulo como import en todo el grafo. */
  registrations: Map<string, number>;
  /** Registraciones DINÁMICAS (`Module.forRoot()`, `registerAsync()`, …). */
  dynamicRegistrations: Map<string, number>;
  /** Clases distintas vistas bajo cada nombre de módulo. */
  classesByName: Map<string, Set<Type<unknown>>>;
  /** Clases de módulo alcanzables desde la raíz. */
  modules: Map<string, Type<unknown>>;
  /** Aristas módulo → módulos importados, por nombre. */
  edges: Map<string, string[]>;
}

async function collectModuleGraph(root: Type<unknown>): Promise<ModuleGraph> {
  const registrations = new Map<string, number>();
  const dynamicRegistrations = new Map<string, number>();
  const classesByName = new Map<string, Set<Type<unknown>>>();
  const modules = new Map<string, Type<unknown>>();
  const edges = new Map<string, string[]>();

  const visit = async (entry: ModuleEntry): Promise<void> => {
    const resolved = await resolveModuleEntry(entry);
    const moduleClass = isDynamicModule(resolved) ? resolved.module : resolved;
    const extra = isDynamicModule(resolved) ? ((resolved.imports ?? []) as ModuleEntry[]) : [];
    registrations.set(moduleClass.name, (registrations.get(moduleClass.name) ?? 0) + 1);
    if (isDynamicModule(resolved)) {
      dynamicRegistrations.set(
        moduleClass.name,
        (dynamicRegistrations.get(moduleClass.name) ?? 0) + 1,
      );
    }
    classesByName.set(
      moduleClass.name,
      (classesByName.get(moduleClass.name) ?? new Set()).add(moduleClass),
    );
    if (modules.has(moduleClass.name)) return;
    modules.set(moduleClass.name, moduleClass);

    const children: string[] = [];
    for (const child of [...moduleImportsOf(moduleClass), ...extra]) {
      const resolvedChild = await resolveModuleEntry(child);
      const childClass = isDynamicModule(resolvedChild) ? resolvedChild.module : resolvedChild;
      children.push(childClass.name);
      await visit(child);
    }
    edges.set(moduleClass.name, children);
  };

  await visit(root);
  // La raíz no es «importada» por nadie: su conteo no describe un registro.
  registrations.delete(root.name);
  return { registrations, dynamicRegistrations, classesByName, modules, edges };
}

/** Devuelve el primer ciclo de importación encontrado, o null. */
function findImportCycle(edges: Map<string, string[]>): string[] | null {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const walk = (node: string): void => {
    if (cycle) return;
    colour.set(node, GREY);
    stack.push(node);
    for (const child of edges.get(node) ?? []) {
      if (cycle) return;
      const state = colour.get(child) ?? WHITE;
      if (state === GREY) {
        cycle = [...stack.slice(stack.indexOf(child)), child];
        return;
      }
      if (state === WHITE) walk(child);
    }
    stack.pop();
    colour.set(node, BLACK);
  };

  for (const node of edges.keys()) {
    if ((colour.get(node) ?? WHITE) === WHITE) walk(node);
    if (cycle) break;
  }
  return cycle;
}

function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listTypeScriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Una operación HTTP registrada: método + ruta completa. */
interface RouteEntry {
  method: string;
  path: string;
  /** Ruta con cada `:segmento` sustituido por `:p`. */
  normalized: string;
  controller: string;
  handler: string;
  /** Posición dentro de su controller: Nest registra en orden de declaración. */
  order: number;
}

const METHOD_NAMES = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'ALL',
  'OPTIONS',
  'HEAD',
  'SEARCH',
];

function joinPath(prefix: string, suffix: string): string {
  const clean = (value: string): string => value.replace(/^\/+|\/+$/g, '');
  const parts = [clean(prefix), clean(suffix)].filter((part) => part.length > 0);
  return `/${parts.join('/')}`;
}

/** Sustituye todo segmento `:algo` por `:p`: Express no distingue el nombre. */
function normalizePath(routePath: string): string {
  return routePath
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':p' : segment))
    .join('/');
}

function collectRoutes(modules: Map<string, Type<unknown>>): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const moduleClass of modules.values()) {
    const controllers = metadataOf(moduleClass, MODULE_METADATA.CONTROLLERS) as Type<unknown>[];
    for (const controller of controllers) {
      const prefixMeta = Reflect.getMetadata('path', controller);
      const prefixes = Array.isArray(prefixMeta) ? prefixMeta : [prefixMeta ?? ''];
      const prototype = controller.prototype as Record<string, unknown>;
      const handlers = Object.getOwnPropertyNames(prototype).filter(
        (name) => name !== 'constructor' && typeof prototype[name] === 'function',
      );
      let order = 0;
      for (const handler of handlers) {
        const fn = prototype[handler] as (...args: unknown[]) => unknown;
        const methodIndex = Reflect.getMetadata('method', fn);
        if (methodIndex === undefined) continue;
        const pathMeta = Reflect.getMetadata('path', fn);
        const suffixes = Array.isArray(pathMeta) ? pathMeta : [pathMeta ?? '/'];
        for (const prefix of prefixes) {
          for (const suffix of suffixes) {
            const full = joinPath(String(prefix), String(suffix));
            routes.push({
              method: METHOD_NAMES[methodIndex as number] ?? String(methodIndex),
              path: full,
              normalized: normalizePath(full),
              controller: controller.name,
              handler,
              order,
            });
          }
        }
        order += 1;
      }
    }
  }
  return routes;
}

/**
 * Entorno sintético mínimo para importar el grafo. Nunca lee el `.env` real ni
 * expone ningún secreto: son valores inventados para este proceso.
 */
function applySyntheticEnvironment(): void {
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.JWT_SECRET = 'synthetic-jwt-secret-for-module-graph';
  process.env.REDIS_HOST = 'redis.test.local';
  process.env.REDIS_PORT = '6380';
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic';
}

/**
 * Inventario canónico de operaciones ACTIVAS de 06 v2 §41 (E001–E121 sin las
 * tres retiradas), con los nombres de parámetro ya normalizados a `:p`.
 */
const CANONICAL_OPERATIONS: Array<[string, string]> = [
    ['GET', '/proyectos/:p/admin'], // E001
    ['GET', '/proyectos/:p/owner'], // E002
    ['GET', '/proyectos/:p/avance'], // E003
    ['GET', '/proyectos/:p/postulaciones'], // E004
    ['POST', '/proyectos'], // E005
    ['PUT', '/proyectos/:p'], // E006
    ['PATCH', '/proyectos/:p'], // E007
    ['PATCH', '/proyectos/:p/estado'], // E008
    ['POST', '/proyectos/:p/enviar-revision'], // E009
    ['POST', '/proyectos/:p/reenviar'], // E010
    ['POST', '/proyectos/:p/hitos'], // E011
    ['DELETE', '/proyectos/:p'], // E012
    ['POST', '/proyectos/:p/solicitar-cierre'], // E013
    ['POST', '/proyectos/:p/aprobar-cierre'], // E014
    ['POST', '/proyectos/:p/rechazar-cierre'], // E015
    ['GET', '/proyectos/:p/roles'], // E016
    ['POST', '/proyectos/:p/roles'], // E017
    ['PATCH', '/proyectos/:p/roles/:p'], // E018
    ['DELETE', '/proyectos/:p/roles/:p'], // E019
    ['POST', '/proyectos/:p/roles/:p/participacion'], // E020
    ['DELETE', '/proyectos/:p/roles/:p/participacion'], // E021
    ['GET', '/proyectos/:p/etiquetas'], // E022
    ['POST', '/proyectos/:p/etiquetas'], // E023
    ['PATCH', '/proyectos/:p/etiquetas/:p'], // E024
    ['DELETE', '/proyectos/:p/etiquetas/:p'], // E025
    ['PUT', '/proyectos/:p/tareas/:p/etiquetas/:p'], // E026
    ['DELETE', '/proyectos/:p/tareas/:p/etiquetas/:p'], // E027
    ['POST', '/comentarios'], // E028
    ['GET', '/comentarios/proyecto/:p'], // E029
    ['GET', '/comentarios/hito/:p'], // E030
    ['PATCH', '/comentarios/:p'], // E031
    ['DELETE', '/comentarios/:p'], // E032
    ['GET', '/proyectos/:p/tareas/:p/comentarios'], // E033
    ['POST', '/proyectos/:p/tareas/:p/comentarios'], // E034
    ['PATCH', '/proyectos/:p/tareas/:p/comentarios/:p'], // E035
    ['DELETE', '/proyectos/:p/tareas/:p/comentarios/:p'], // E036
    ['GET', '/mensajes-revision/proyectos/:p'], // E037
    ['POST', '/mensajes-revision/proyectos/:p'], // E038
    ['PATCH', '/mensajes-revision/proyectos/:p/marcar-leidos'], // E039
    ['GET', '/revisiones/admin/bandeja'], // E040
    ['GET', '/revisiones/proyectos/:p'], // E041
    ['POST', '/revisiones/proyectos/:p/reclamar'], // E042
    ['POST', '/revisiones/proyectos/:p/resolver'], // E043
    ['GET', '/proyectos/:p/tareas'], // E044
    ['GET', '/proyectos/:p/tareas/:p'], // E045
    ['POST', '/proyectos/:p/tareas'], // E046
    ['PATCH', '/proyectos/:p/tareas/:p'], // E047
    ['PATCH', '/proyectos/:p/tareas/:p/estado'], // E048
    ['DELETE', '/proyectos/:p/tareas/:p'], // E049
    ['POST', '/proyectos/:p/tareas/:p/asignar'], // E050
    ['DELETE', '/proyectos/:p/tareas/:p/asignar'], // E051
    ['POST', '/proyectos/:p/tareas/:p/asignaciones/:p/cerrar'], // E052
    ['POST', '/proyectos/:p/tareas/:p/asignaciones/:p/avance'], // E053
    ['PATCH', '/proyectos/:p/tareas/:p/asignaciones/:p/avance/:p'], // E054
    ['GET', '/proyectos/:p/tareas/:p/horas'], // E055
    ['POST', '/proyectos/:p/tareas/:p/horas'], // E056
    ['PATCH', '/proyectos/:p/tareas/:p/horas/:p'], // E057
    ['DELETE', '/proyectos/:p/tareas/:p/horas/:p'], // E058
    ['GET', '/proyectos/:p/tareas/:p/horas/resumen'], // E059
    ['POST', '/proyectos/:p/sprints'], // E060
    ['POST', '/proyectos/:p/sprints/:p/finalizar'], // E061
    ['POST', '/proyectos/:p/sprints/:p/cerrar'], // E062
    ['GET', '/proyectos/:p/sprints/:p/resumen-cierre'], // E064
    ['GET', '/proyectos/:p/sprints/analytics'], // E065
    ['GET', '/proyectos/:p/sprints'], // E066
    ['GET', '/proyectos/:p/sprints/:p'], // E067
    ['GET', '/proyectos/:p/sprints/:p/analytics'], // E068
    ['GET', '/proyectos/:p/sprints/:p/resumen-cierre/miembros/:p'], // E069
    ['POST', '/proyectos/:p/sprints/:p/asignaciones/:p/ajuste-horas'], // E070
    ['DELETE', '/proyectos/:p/sprints/:p/asignaciones/:p/ajuste-horas'], // E071
    ['GET', '/proyectos/:p/sprints/:p/asignaciones/:p/ajuste-horas'], // E072
    ['POST', '/proyectos/:p/solicitudes-salida'], // E073
    ['POST', '/proyectos/:p/solicitudes-salida/:p/aprobar'], // E074
    ['POST', '/proyectos/:p/solicitudes-salida/:p/rechazar'], // E075
    ['GET', '/proyectos/:p/salida/estado'], // E076
    ['GET', '/proyectos/:p/salida/preparacion'], // E077
    ['POST', '/proyectos/:p/salida/preparacion/continuar'], // E078
    ['POST', '/proyectos/:p/salida/preparacion/cancelar'], // E079
    ['GET', '/proyectos/:p/miembros/postulaciones-pendientes'], // E080
    ['GET', '/proyectos/:p/equipo'], // E081
    ['GET', '/proyectos/:p/equipo/:p'], // E082
    ['GET', '/proyectos/:p/miembros/resumen'], // E083
    ['GET', '/proyectos/:p/miembros/solicitudes-salida-pendientes'], // E084
    ['POST', '/postulaciones'], // E085
    ['GET', '/postulaciones'], // E086
    ['GET', '/postulaciones/mis-postulaciones'], // E087
    ['GET', '/postulaciones/:p'], // E088
    ['PATCH', '/postulaciones/:p/estado'], // E089
    ['DELETE', '/postulaciones/:p'], // E090
    ['GET', '/proyectos/:p/bitacora'], // E091
    ['GET', '/usuarios/me/dashboard'], // E092
    ['GET', '/proyectos/:p/liderazgo/contexto'], // E093
    ['GET', '/proyectos/:p/liderazgo/candidatos'], // E094
    ['GET', '/proyectos/:p/liderazgo/historial'], // E095
    ['GET', '/proyectos/:p/liderazgo/apelaciones'], // E096
    ['POST', '/proyectos/:p/liderazgo/apelaciones'], // E097
    ['POST', '/proyectos/:p/liderazgo/apelaciones/:p/cancelar'], // E098
    ['GET', '/admin/liderazgo/apelaciones'], // E099
    ['POST', '/admin/proyectos/:p/liderazgo/apelaciones/:p/aceptar'], // E100
    ['POST', '/admin/proyectos/:p/liderazgo/apelaciones/:p/denegar'], // E101
    ['POST', '/admin/proyectos/:p/liderazgo/cambiar'], // E102
    ['GET', '/proyectos/:p/cierre/readiness'], // E103
    ['POST', '/proyectos/:p/cierre/preparacion'], // E104
    ['POST', '/proyectos/:p/cierre/informe-automatico'], // E105
    ['POST', '/proyectos/:p/cierre/documentos/firma'], // E106
    ['POST', '/proyectos/:p/cierre/documentos'], // E107
    ['DELETE', '/proyectos/:p/cierre/documentos/:p'], // E108
    ['GET', '/proyectos/:p/cierre/documentos/:p/url'], // E109
    ['GET', '/proyectos/:p/cierre/documentos/:p/contenido'], // E110
    ['GET', '/proyectos/:p/cierre/revisiones'], // E111
    ['GET', '/proyectos/:p/cierre/revisiones/:p'], // E112
    ['POST', '/proyectos/:p/cierre/reenviar'], // E113
    ['POST', '/proyectos/:p/cierre/correccion-documental'], // E114
    ['POST', '/admin/storage/cierre/barrido'], // E115
    ['GET', '/admin/proyectos'], // E116
    ['GET', '/admin/proyectos/:p'], // E117
    ['GET', '/proyectos/:p/historico'], // E118
    ['GET', '/proyectos/:p/sprints/:p/contribuciones-eliminadas'], // E119
];

describe('S7 grafo de módulos y rutas (T36)', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    applySyntheticEnvironment();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('T36-A: el AppModule completo resuelve todos los providers sin ciclos ni forwardRef', async () => {
    // `AppModule` se importa perezosamente: su ConfigModule valida el entorno
    // en tiempo de import, así que el entorno sintético debe existir antes.
    const { AppModule } = await import('../src/app.module');
    const graph = await collectModuleGraph(AppModule as Type<unknown>);

    // ── El grafo COMPLETO es acíclico. Sin esto, «no hay forwardRef» sería
    //    una afirmación vacía: Nest simplemente no arrancaría.
    expect(findImportCycle(graph.edges)).toBeNull();

    // ── Los veintisiete providers del alcance de §39 están declarados, y cada
    //    uno EXACTAMENTE en un módulo alcanzable desde la raíz.
    const scope = [
      'ProjectPolicyService',
      'ProjectTransactionService',
      'ProjectReadPolicyService',
      'ProjectIdResolverService',
      'ProjectWriteGuard',
      'ProjectEligibilityService',
      'ClosureCryptoService',
      'ClosureTicketService',
      'ClosurePdfValidationService',
      'CloudinaryClosureStorageAdapter',
      'TaskHourAdjustmentsService',
      'LeadershipService',
      'LeadershipReadService',
      'ProjectClosureService',
      'ProjectCloseReadinessService',
      'ProjectClosureDocumentsService',
      'ProjectClosureReviewService',
      'ProjectClosureReportService',
      'ClosureCleanupService',
      'HistoricalProjectReadService',
      'TimeRecordsService',
      'SprintsService',
      'HoursRecognitionService',
      'ProjectHoursSummaryService',
      'TasksService',
      'ProjectsService',
      'BitacoraEventosService',
    ];
    expect(scope).toHaveLength(27);

    const declaringModules = new Map<string, string[]>();
    for (const [name, moduleClass] of graph.modules) {
      for (const provider of moduleProvidersOf(moduleClass)) {
        const token =
          typeof provider === 'function'
            ? (provider as Type<unknown>).name
            : ((provider as { provide?: unknown }).provide as { name?: string } | string | undefined);
        const key =
          typeof token === 'string'
            ? token
            : typeof token === 'object' && token !== null && 'name' in token
              ? (token.name as string)
              : undefined;
        if (!key) continue;
        declaringModules.set(key, [...(declaringModules.get(key) ?? []), name]);
      }
    }

    for (const provider of scope) {
      const declaredIn = declaringModules.get(provider) ?? [];
      expect(declaredIn.length, `${provider} declarado en ${declaredIn.length} módulo(s)`).toBe(1);
    }

    // ── El guard se PROVEE una sola vez, y desde Policy.
    expect(declaringModules.get('ProjectWriteGuard')).toEqual(['ProjectPolicyModule']);

    // ── Cero `forwardRef` EN USO en todo `src/`: un ciclo no se esconde, se
    //    corrige. Se busca la llamada real y la importación del símbolo, no la
    //    palabra suelta, para que un comentario pueda explicar la decisión.
    for (const file of listTypeScriptFiles(SRC_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, `${file}: llamada a forwardRef`).not.toMatch(/\bforwardRef\s*\(/);
      expect(source, `${file}: importa forwardRef`).not.toMatch(
        /import\s*\{[^}]*\bforwardRef\b[^}]*\}\s*from/,
      );
    }

    // ── Aristas PROHIBIDAS del grafo congelado (§39/§48).
    const { ProjectPolicyModule } = await import('../src/common/project-policy/project-policy.module');
    const policyImports = await importedModuleNames(ProjectPolicyModule as Type<unknown>);
    expect(policyImports).not.toContain('NotificationsModule');
    for (const dominio of [
      'SprintsModule',
      'TasksModule',
      'ProjectsModule',
      'TimeRecordsModule',
      'ProjectClosureModule',
    ]) {
      expect(policyImports, `Policy no importa ${dominio}`).not.toContain(dominio);
    }

    const { TimeRecordsModule } = await import('../src/time-records/time-records.module');
    const { SprintsModule } = await import('../src/sprints/sprints.module');
    expect(await importedModuleNames(TimeRecordsModule as Type<unknown>)).not.toContain(
      'SprintsModule',
    );
    expect(await importedModuleNames(SprintsModule as Type<unknown>)).not.toContain(
      'TimeRecordsModule',
    );

    const { ProjectsModule } = await import('../src/projects/projects.module');
    expect(await importedModuleNames(ProjectsModule as Type<unknown>)).not.toContain(
      'ProjectClosureModule',
    );

    const { EligibilityModule } = await import('../src/eligibility/eligibility.module');
    expect(await importedModuleNames(EligibilityModule as Type<unknown>)).not.toContain(
      'TasksModule',
    );

    const { NotificationsModule } = await import('../src/notifications/notifications.module');
    expect(await importedModuleNames(NotificationsModule as Type<unknown>)).not.toContain(
      'ProjectPolicyModule',
    );

    // ── Dentro de Closure: Documents NO inyecta Report (§48).
    const documentsSource = fs.readFileSync(
      path.join(SRC_ROOT, 'project-closure', 'project-closure-documents.service.ts'),
      'utf8',
    );
    const constructorBlock = documentsSource.match(/constructor\s*\([\s\S]*?\)\s*\{/)?.[0] ?? '';
    expect(constructorBlock).not.toContain('ProjectClosureReportService');

    // ── Los seis módulos nuevos están registrados EXACTAMENTE una vez.
    //
    //    «Una vez» es una vez en el CONTENEDOR, no una vez en la lista de
    //    imports de alguien: que diecinueve módulos importen Policy es
    //    justamente lo que se diseñó, y Nest lo instancia una sola vez. Lo que
    //    duplicaría un módulo es registrarlo con dos configuraciones dinámicas
    //    distintas, o que existieran dos clases con el mismo nombre.
    for (const nuevo of [
      'ProjectPolicyModule',
      'EligibilityModule',
      'StorageModule',
      'TaskHourAdjustmentsModule',
      'LeadershipModule',
      'ProjectClosureModule',
    ]) {
      expect(graph.modules.has(nuevo), `${nuevo} alcanzable desde AppModule`).toBe(true);
      expect(
        graph.classesByName.get(nuevo)?.size,
        `${nuevo} definido por más de una clase`,
      ).toBe(1);
      expect(
        graph.dynamicRegistrations.get(nuevo) ?? 0,
        `${nuevo} registrado dinámicamente`,
      ).toBe(0);
    }
  }, 30_000);
  it('T36-B: el registro de rutas no tiene duplicados tras normalizar parámetros y las tres rutas retiradas responden 404', async () => {
    const { AppModule } = await import('../src/app.module');
    const graph = await collectModuleGraph(AppModule as Type<unknown>);
    const routes = collectRoutes(graph.modules);

    // ── Ningún par método + ruta NORMALIZADA aparece dos veces. Normalizar es
    //    lo que hace útil la comprobación: para Express `:id` y `:projectId`
    //    son el mismo segmento, así que dos handlers que solo difieran en el
    //    nombre del parámetro colisionan en tiempo de ejecución.
    const byNormalized = new Map<string, RouteEntry[]>();
    for (const route of routes) {
      const key = `${route.method} ${route.normalized}`;
      byNormalized.set(key, [...(byNormalized.get(key) ?? []), route]);
    }
    const duplicados = [...byNormalized.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(([key, entries]) => `${key} → ${entries.map((e) => `${e.controller}.${e.handler}`).join(', ')}`);
    expect(duplicados).toEqual([]);

    // ── Los tres handlers trasladados existen UNA sola vez y viven en el
    //    controller de cierre, conservando método y URL (§39 estrategia A).
    for (const ruta of ['solicitar-cierre', 'aprobar-cierre', 'rechazar-cierre']) {
      const encontrados = routes.filter(
        (route) => route.method === 'POST' && route.path.endsWith(`/${ruta}`),
      );
      expect(encontrados, `POST …/${ruta}`).toHaveLength(1);
      expect(encontrados[0].controller).toBe('ProjectClosureController');
    }

    // ── Las rutas literales se registran ANTES del parámetro que podría
    //    capturarlas: si `:sprintId` llegara primero, `analytics` nunca se
    //    alcanzaría.
    const literales = ['analytics', 'resumen', 'contexto', 'mis-postulaciones', 'bandeja', 'me'];
    for (const literal of literales) {
      const conLiteral = routes.filter((route) => route.path.split('/').includes(literal));
      for (const literalRoute of conLiteral) {
        const segmentos = literalRoute.path.split('/');
        const indice = segmentos.indexOf(literal);
        // Una ruta del MISMO controller y método cuya forma normalizada es
        // idéntica salvo que en esa posición lleva un parámetro.
        const capturadoras = routes.filter((candidate) => {
          if (candidate.controller !== literalRoute.controller) return false;
          if (candidate.method !== literalRoute.method) return false;
          const otros = candidate.path.split('/');
          if (otros.length !== segmentos.length) return false;
          if (!otros[indice]?.startsWith(':')) return false;
          return otros.every(
            (segmento, posicion) => posicion === indice || segmento === segmentos[posicion],
          );
        });
        for (const capturadora of capturadoras) {
          expect(
            literalRoute.order,
            `${literalRoute.method} ${literalRoute.path} debe registrarse antes de ${capturadora.path}`,
          ).toBeLessThan(capturadora.order);
        }
      }
    }

    // ── Las tres rutas retiradas NO están registradas: un método+ruta ausente
    //    del router es exactamente lo que produce el 404 (E063, E120, E121).
    const retiradas = [
      { method: 'PATCH', normalized: '/proyectos/:p/sprints/:p/horas/:p' },
      { method: 'POST', normalized: '/evidencias' },
      { method: 'GET', normalized: '/evidencias' },
    ];
    for (const retirada of retiradas) {
      const viva = routes.find(
        (route) => route.method === retirada.method && route.normalized === retirada.normalized,
      );
      expect(viva, `${retirada.method} ${retirada.normalized} sigue registrada`).toBeUndefined();
    }
    // Y ningún controller conserva el prefijo de evidencias.
    expect(routes.filter((route) => route.path.startsWith('/evidencias'))).toEqual([]);

    // ── El inventario canónico de §41 está COMPLETO. Sus 118 operaciones
    //    activas (121 filas E001–E121 menos E063, E120 y E121) deben estar
    //    registradas. El catálogo describe el alcance de Sprint 7, no la
    //    aplicación entera: auth, chat, social, catálogos y notificaciones no
    //    figuran en él, así que se comprueba INCLUSIÓN, no igualdad de conteo.
    const registradas = new Set(routes.map((route) => `${route.method} ${route.normalized}`));
    const ausentes = CANONICAL_OPERATIONS.filter(
      ([method, normalized]) => !registradas.has(`${method} ${normalized}`),
    ).map(([method, normalized]) => `${method} ${normalized}`);
    expect(ausentes).toEqual([]);
    expect(CANONICAL_OPERATIONS).toHaveLength(118);
  }, 30_000);
  it('C158: toda ruta de escritura participante declara su policy explícita y la cobertura son 66 usos', async () => {
    const { AppModule } = await import('../src/app.module');
    const { PROJECT_WRITE_METADATA_KEY } = await import(
      '../src/common/guards/project-write.metadata'
    );
    const graph = await collectModuleGraph(AppModule as Type<unknown>);
    const routes = collectRoutes(graph.modules);

    // ── El inventario de cobertura de §41: sesenta y seis usos explícitos.
    //    Se cuenta sobre el código fuente, no sobre la metadata resuelta, para
    //    que el número describa decisiones escritas por alguien.
    const declaraciones = listTypeScriptFiles(SRC_ROOT).reduce((total, file) => {
      const matches = fs.readFileSync(file, 'utf8').match(/@ProjectWrite\(/g);
      return total + (matches?.length ?? 0);
    }, 0);
    expect(declaraciones).toBe(66);

    // ── Ninguna ruta participante depende del default restrictivo.
    //
    //    §32 conserva ese default por compatibilidad, pero §41 exige que toda
    //    ruta afectada lo declare: un default silencioso es una decisión que
    //    nadie tomó. Quedan fuera únicamente las categorías congeladas —
    //    lecturas, creación de proyecto, acuse personal y barrido— más las
    //    rutas ya retiradas, que no existen.
    const MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const EXCLUIDAS: Array<[string, string]> = [
      // Creación de proyecto: todavía no hay proyecto sobre el que decidir.
      ['POST', '/proyectos'],
      // E039 — acuse personal de mensajes de revisión: escritura por usuario,
      // sin lock de proyecto y sin cambio de dominio ni de Sprint (§32).
      ['PATCH', '/mensajes-revision/proyectos/:p/marcar-leidos'],
      // Barrido técnico de almacenamiento: no es una escritura de dominio.
      ['POST', '/admin/storage/cierre/barrido'],
    ];
    const esExcluida = (route: RouteEntry): boolean =>
      EXCLUIDAS.some(([method, normalized]) => route.method === method && route.normalized === normalized);

    // Solo se exige a las rutas del inventario canónico: auth, chat, social y
    // catálogos no son escrituras participantes de un proyecto.
    const canonicas = new Set(
      CANONICAL_OPERATIONS.map(([method, normalized]) => `${method} ${normalized}`),
    );

    const sinPolicy: string[] = [];
    for (const route of routes) {
      if (!MUTANTES.has(route.method)) continue;
      if (!canonicas.has(`${route.method} ${route.normalized}`)) continue;
      if (esExcluida(route)) continue;

      const controller = [...graph.modules.values()]
        .flatMap((moduleClass) => metadataOf(moduleClass, MODULE_METADATA.CONTROLLERS) as Type<unknown>[])
        .find((candidate) => candidate.name === route.controller);
      if (!controller) continue;
      const handler = (controller.prototype as Record<string, unknown>)[route.handler];
      const enHandler = Reflect.getMetadata(PROJECT_WRITE_METADATA_KEY, handler as object);
      const enController = Reflect.getMetadata(PROJECT_WRITE_METADATA_KEY, controller);
      if (enHandler === undefined && enController === undefined) {
        sinPolicy.push(`${route.method} ${route.path} (${route.controller}.${route.handler})`);
      }
    }
    expect(sinPolicy).toEqual([]);

    // ── Toda metadata declarada está completa: sin `source`, `states` o
    //    `sprint` el guard no puede rechazar temprano y la policy del service
    //    no tendría con qué repetir la decisión.
    for (const route of routes) {
      const controller = [...graph.modules.values()]
        .flatMap((moduleClass) => metadataOf(moduleClass, MODULE_METADATA.CONTROLLERS) as Type<unknown>[])
        .find((candidate) => candidate.name === route.controller);
      if (!controller) continue;
      const handler = (controller.prototype as Record<string, unknown>)[route.handler];
      const metadata = Reflect.getMetadata(PROJECT_WRITE_METADATA_KEY, handler as object) as
        | { source?: unknown; states?: unknown; sprint?: unknown }
        | undefined;
      if (metadata === undefined) continue;
      expect(metadata.source, `${route.path}: source`).toBeDefined();
      expect(Array.isArray(metadata.states), `${route.path}: states`).toBe(true);
      expect(metadata.sprint, `${route.path}: sprint`).toBeDefined();
    }
  }, 30_000);
});
