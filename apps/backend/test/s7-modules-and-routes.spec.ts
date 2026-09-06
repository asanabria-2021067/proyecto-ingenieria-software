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
});
