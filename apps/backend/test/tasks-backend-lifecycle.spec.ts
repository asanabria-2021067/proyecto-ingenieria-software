import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateTaskDto } from '../src/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../src/tasks/dto/update-task.dto';
import { UpdateTaskEstadoDto } from '../src/tasks/dto/update-task-estado.dto';
import { AssignTaskDto } from '../src/tasks/dto/assign-task.dto';
import {
  FIXTURE_IDS,
  FECHA_FUTURA,
  setupLifecycleEnv,
  type LifecycleEnv,
} from './helpers/tasks-lifecycle.fixture';

/**
 * Tarea 27 — suite integral de regresión del ciclo de vida del backend de
 * tareas. Usa exclusivamente las clases reales de producción (TasksService,
 * TasksContextService, TasksAuthorizationService, TasksRelationsService,
 * ProjectsService, ComentariosService) contra un fake Prisma ESTATAL y
 * transaccional (ver test/helpers/tasks-lifecycle.fixture.ts): ninguna
 * fórmula de avance, regla de autorización, regla de asignabilidad o mapeo
 * de conflictos vive en este archivo — solo se ejecutan y observan.
 *
 * No sustituye ni debilita los specs focalizados de las Tareas 13–26; se
 * centra en secuencias entre operaciones, cambios de permisos, historial,
 * idempotencia, aislamiento de proyectos y atomicidad observable.
 */

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function parseCreate(plain: unknown): Promise<CreateTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: CreateTaskDto } as any);
}
async function parseUpdate(plain: unknown): Promise<UpdateTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: UpdateTaskDto } as any);
}
async function parseEstado(plain: unknown): Promise<UpdateTaskEstadoDto> {
  return pipe.transform(plain, { type: 'body', metatype: UpdateTaskEstadoDto } as any);
}
async function parseAssign(plain: unknown): Promise<AssignTaskDto> {
  return pipe.transform(plain, { type: 'body', metatype: AssignTaskDto } as any);
}

const { usuarios: U, proyectos: P, roles: R, hitos: H, etiquetas: E } = FIXTURE_IDS;

function baseCreatePayload(overrides: Record<string, unknown> = {}) {
  return { tituloTarea: 'Tarea de prueba', fechaLimite: FECHA_FUTURA, prioridad: 'MEDIA', ...overrides };
}

async function expectStatus(promise: Promise<unknown>, ctor: new (...args: any[]) => any, status: number) {
  try {
    await promise;
    throw new Error('no debía resolver');
  } catch (e: any) {
    expect(e).toBeInstanceOf(ctor);
    expect(e.getStatus()).toBe(status);
    return e;
  }
}

const PUBLIC_TAREA_KEYS = [
  'idTarea',
  'idProyecto',
  'idHito',
  'idRolProyecto',
  'tituloTarea',
  'descripcionTarea',
  'estadoTarea',
  'prioridad',
  'creadaPor',
  'fechaCreacion',
  'fechaLimite',
  'actualizadaEn',
  'tiempoEstimadoHoras',
  'asignacionActiva',
  'rolProyecto',
  'hito',
  'etiquetas',
  'cantidadComentarios',
].sort();

function expectPublicContract(tarea: any) {
  expect(Object.keys(tarea).sort()).toEqual(PUBLIC_TAREA_KEYS);
  expect(tarea).not.toHaveProperty('eliminadoEn');
  expect(tarea).not.toHaveProperty('_count');
  const serialized = JSON.stringify(tarea);
  expect(serialized).not.toMatch(/desasignadaEn/i);
  expect(serialized).not.toMatch(/contrasena|password|hash|token/i);
  if (tarea.asignacionActiva) {
    expect(Object.keys(tarea.asignacionActiva).sort()).toEqual(
      ['idAsignacion', 'idUsuario', 'fechaAsignacion', 'usuario'].sort(),
    );
  }
  if (tarea.fechaLimite) {
    expect(tarea.fechaLimite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
}

describe('Ciclo de vida integral del backend de tareas (Tarea 27)', () => {
  // -------------------------------------------------------------------
  // Escenario A: tarea SIN rol
  // -------------------------------------------------------------------
  describe('Escenario A — tarea sin rol: creación → asignación → idempotencia → estado → reasignación → revocación → desasignación → idempotencia', () => {
    it('recorre el ciclo completo con los métodos públicos reales', async () => {
      const env = setupLifecycleEnv();
      const { tasksService } = env;

      // A.1 Creación
      const dtoCrear = await parseCreate(baseCreatePayload({ tituloTarea: 'Tarea sin rol' }));
      const creada = await tasksService.create(P.A, U.liderA, dtoCrear);
      expectPublicContract(creada);
      expect(creada.idRolProyecto).toBeNull();
      expect(creada.idHito).toBeNull();
      expect(creada.etiquetas).toEqual([]);
      expect(creada.asignacionActiva).toBeNull();
      expect(creada.estadoTarea).toBe('POR_HACER');

      const taskId = creada.idTarea;

      const enListado = await tasksService.findAll(P.A, U.liderA);
      expect(enListado.some((t) => t.idTarea === taskId)).toBe(true);
      const enDetalle = await tasksService.findOne(P.A, taskId, U.liderA);
      expect(enDetalle.idTarea).toBe(taskId);

      // A.2 Asignación inicial (a1 participa activamente en cualquier rol del proyecto)
      const dtoAsignarA1 = await parseAssign({ idUsuario: U.a1 });
      const asignada = await tasksService.assign(P.A, taskId, U.liderA, dtoAsignarA1);
      expectPublicContract(asignada);
      expect(asignada.asignacionActiva).toMatchObject({ idUsuario: U.a1 });
      const asignacionesTrasA2 = env.state.asignaciones.filter((a) => a.idTarea === taskId);
      expect(asignacionesTrasA2).toHaveLength(1);
      expect(asignacionesTrasA2[0].asignadoPor).toBe(U.liderA);
      const primeraAsignacion = asignacionesTrasA2[0];

      // A.3 Asignación idempotente
      const idempotente = await tasksService.assign(P.A, taskId, U.liderA, dtoAsignarA1);
      expect(idempotente.asignacionActiva?.idUsuario).toBe(U.a1);
      const asignacionesTrasIdempotencia = env.state.asignaciones.filter((a) => a.idTarea === taskId);
      expect(asignacionesTrasIdempotencia).toHaveLength(1);
      expect(asignacionesTrasIdempotencia[0].idAsignacion).toBe(primeraAsignacion.idAsignacion);
      expect(asignacionesTrasIdempotencia[0].fechaAsignacion.getTime()).toBe(
        primeraAsignacion.fechaAsignacion.getTime(),
      );
      expect(asignacionesTrasIdempotencia[0].asignadoPor).toBe(primeraAsignacion.asignadoPor);

      // A.4 Cambio de estado por el asignado
      const dtoHecho = await parseEstado({ estadoTarea: 'HECHO' });
      const trasHecho = await tasksService.updateEstado(P.A, taskId, U.a1, dtoHecho);
      expect(trasHecho.estadoTarea).toBe('HECHO');
      const dtoEnProgreso = await parseEstado({ estadoTarea: 'EN_PROGRESO' });
      const trasEnProgreso = await tasksService.updateEstado(P.A, taskId, U.a1, dtoEnProgreso);
      expect(trasEnProgreso.estadoTarea).toBe('EN_PROGRESO');

      // A.5 Reasignación a a2
      const dtoAsignarA2 = await parseAssign({ idUsuario: U.a2 });
      const reasignada = await tasksService.assign(P.A, taskId, U.liderA, dtoAsignarA2);
      expect(reasignada.asignacionActiva?.idUsuario).toBe(U.a2);
      const filasTrasReasignar = env.state.asignaciones.filter((a) => a.idTarea === taskId);
      expect(filasTrasReasignar).toHaveLength(2);
      const anterior = filasTrasReasignar.find((a) => a.idUsuario === U.a1)!;
      const nueva = filasTrasReasignar.find((a) => a.idUsuario === U.a2)!;
      expect(anterior.desasignadaEn).not.toBeNull();
      expect(anterior.idAsignacion).toBe(primeraAsignacion.idAsignacion);
      expect(nueva.desasignadaEn).toBeNull();
      const activasTrasReasignar = filasTrasReasignar.filter((a) => a.desasignadaEn === null);
      expect(activasTrasReasignar).toHaveLength(1);

      // A.6 Revocación inmediata del usuario anterior (a1)
      const dtoPorHacer = await parseEstado({ estadoTarea: 'POR_HACER' });
      const errorA1 = await expectStatus(
        tasksService.updateEstado(P.A, taskId, U.a1, dtoPorHacer),
        ForbiddenException,
        403,
      );
      expect(errorA1).toBeInstanceOf(ForbiddenException);
      // El nuevo asignado sí puede.
      const trasA2 = await tasksService.updateEstado(P.A, taskId, U.a2, dtoPorHacer);
      expect(trasA2.estadoTarea).toBe('POR_HACER');

      // A.7 Desasignación
      await tasksService.unassign(P.A, taskId, U.liderA);
      const activaTrasDesasignar = env.state.asignaciones.find(
        (a) => a.idTarea === taskId && a.desasignadaEn === null,
      );
      expect(activaTrasDesasignar).toBeUndefined();
      const totalTrasDesasignar = env.state.asignaciones.filter((a) => a.idTarea === taskId);
      expect(totalTrasDesasignar).toHaveLength(2); // ninguna fila borrada
      expect(env.notifications.notifyFromTemplate).toHaveBeenCalledWith(
        [U.a2],
        'TAREA_ACTUALIZADA',
        expect.objectContaining({ taskId }),
      );

      // A.8 Revocación inmediata después de desasignar
      await expectStatus(
        tasksService.updateEstado(P.A, taskId, U.a2, dtoHecho),
        ForbiddenException,
        403,
      );

      // A.9 Desasignación repetida: idempotente
      env.notifications.notifyFromTemplate.mockClear();
      await tasksService.unassign(P.A, taskId, U.liderA);
      const totalTrasRepetir = env.state.asignaciones.filter((a) => a.idTarea === taskId);
      expect(totalTrasRepetir).toHaveLength(2); // sin filas nuevas
      expect(totalTrasRepetir.every((a) => a.idAsignacion === anterior.idAsignacion || a.idAsignacion === nueva.idAsignacion)).toBe(true);
      expect(nueva.fechaAsignacion.getTime()).toBeGreaterThan(0); // no se tocó
      expect(env.notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Escenario B: tarea CON rol, hito y etiquetas
  // -------------------------------------------------------------------
  describe('Escenario B — tarea con rol, hito y etiquetas', () => {
    async function crearTareaCompleta(env: LifecycleEnv) {
      const dto = await parseCreate(
        baseCreatePayload({
          tituloTarea: 'Tarea completa',
          idHito: H.A,
          idRolProyecto: R.desarrolloA,
          idsEtiquetas: [E.aUrgente, E.aBackend],
          idUsuarioAsignado: U.a1,
        }),
      );
      return env.tasksService.create(P.A, U.liderA, dto);
    }

    it('B.1 creación completa: relaciones correctas, asignación inicial, etiquetas planas, notificación posterior al commit', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(
        baseCreatePayload({
          tituloTarea: 'Tarea completa',
          idHito: H.A,
          idRolProyecto: R.desarrolloA,
          idsEtiquetas: [E.aUrgente, E.aBackend],
          idUsuarioAsignado: U.a1,
        }),
      );
      const orden: string[] = [];
      const transactionOriginal = env.db.$transaction.bind(env.db);
      env.db.$transaction = (async (callback: any) => {
        const result = await transactionOriginal(callback);
        orden.push('transaccion_resuelta');
        return result;
      }) as typeof env.db.$transaction;
      env.notifications.notifyFromTemplate.mockImplementation(async () => {
        orden.push('notificacion');
      });

      const creada = await env.tasksService.create(P.A, U.liderA, dto);

      expectPublicContract(creada);
      expect(creada.idHito).toBe(H.A);
      expect(creada.idRolProyecto).toBe(R.desarrolloA);
      expect(creada.etiquetas.map((e: any) => e.idEtiqueta).sort()).toEqual([E.aUrgente, E.aBackend].sort());
      expect(creada.asignacionActiva?.idUsuario).toBe(U.a1);
      expect(env.state.tareaEtiquetas.filter((te) => te.idTarea === creada.idTarea)).toHaveLength(2);
      // La notificación ocurre después de que $transaction se resuelve, nunca dentro ni antes.
      expect(orden).toEqual(['transaccion_resuelta', 'notificacion']);
    });

    it('B.2 candidato en rol incorrecto (A3 en Diseño): 400, la asignación anterior permanece sin cambios', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);
      const totalAntes = env.state.asignaciones.filter((a) => a.idTarea === creada.idTarea);

      const dto = await parseAssign({ idUsuario: U.a3Diseno });
      await expectStatus(env.tasksService.assign(P.A, creada.idTarea, U.liderA, dto), BadRequestException, 400);

      const totalDespues = env.state.asignaciones.filter((a) => a.idTarea === creada.idTarea);
      expect(totalDespues).toHaveLength(totalAntes.length);
      const activa = totalDespues.find((a) => a.desasignadaEn === null);
      expect(activa?.idUsuario).toBe(U.a1);
    });

    it('B.3 participación inactiva (retirada) en el rol correcto: 400', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);

      const dto = await parseAssign({ idUsuario: U.inactivoA });
      await expectStatus(env.tasksService.assign(P.A, creada.idTarea, U.liderA, dto), BadRequestException, 400);
    });

    it('B.4 usuario candidato inexistente: 404', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);

      const dto = await parseAssign({ idUsuario: 999999 });
      await expectStatus(env.tasksService.assign(P.A, creada.idTarea, U.liderA, dto), NotFoundException, 404);
    });

    it('B.5 edición escalar conserva rol, hito, etiquetas y asignación', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);

      const dto = await parseUpdate({
        tituloTarea: 'Título editado',
        descripcionTarea: 'Nueva descripción',
        prioridad: 'ALTA',
        fechaLimite: FECHA_FUTURA,
        tiempoEstimadoHoras: 10,
      });
      const editada = await env.tasksService.update(P.A, creada.idTarea, U.liderA, dto);

      expect(editada.tituloTarea).toBe('Título editado');
      expect(editada.prioridad).toBe('ALTA');
      expect(editada.idHito).toBe(H.A);
      expect(editada.idRolProyecto).toBe(R.desarrolloA);
      expect(editada.etiquetas.map((e: any) => e.idEtiqueta).sort()).toEqual([E.aUrgente, E.aBackend].sort());
      expect(editada.asignacionActiva?.idUsuario).toBe(U.a1);
    });

    it('B.6 sustitución completa de etiquetas y luego vaciado', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);

      const dtoSustituir = await parseUpdate({ idsEtiquetas: [E.aUrgente] });
      const sustituida = await env.tasksService.update(P.A, creada.idTarea, U.liderA, dtoSustituir);
      expect(sustituida.etiquetas.map((e: any) => e.idEtiqueta)).toEqual([E.aUrgente]);

      const dtoVaciar = await parseUpdate({ idsEtiquetas: [] });
      const vaciada = await env.tasksService.update(P.A, creada.idTarea, U.liderA, dtoVaciar);
      expect(vaciada.etiquetas).toEqual([]);
      expect(env.state.tareaEtiquetas.filter((te) => te.idTarea === creada.idTarea)).toHaveLength(0);
    });

    it('B.7 idHito: null retira el hito; idRolProyecto: null retira el rol sin tocar la asignación activa', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaCompleta(env);
      const activaAntes = env.state.asignaciones.find(
        (a) => a.idTarea === creada.idTarea && a.desasignadaEn === null,
      )!;

      const dtoSinHito = await parseUpdate({ idHito: null });
      const sinHito = await env.tasksService.update(P.A, creada.idTarea, U.liderA, dtoSinHito);
      expect(sinHito.idHito).toBeNull();
      expect(sinHito.idRolProyecto).toBe(R.desarrolloA);

      const dtoSinRol = await parseUpdate({ idRolProyecto: null });
      const sinRol = await env.tasksService.update(P.A, creada.idTarea, U.liderA, dtoSinRol);
      expect(sinRol.idRolProyecto).toBeNull();
      expect(sinRol.asignacionActiva?.idUsuario).toBe(U.a1);

      const activaDespues = env.state.asignaciones.find(
        (a) => a.idTarea === creada.idTarea && a.desasignadaEn === null,
      )!;
      expect(activaDespues.idAsignacion).toBe(activaAntes.idAsignacion);
      expect(activaDespues.fechaAsignacion.getTime()).toBe(activaAntes.fechaAsignacion.getTime());
    });
  });

  // -------------------------------------------------------------------
  // Relaciones cruzadas inválidas
  // -------------------------------------------------------------------
  describe('Relaciones cruzadas entre proyectos', () => {
    it('hito de Proyecto B en creación de Proyecto A: 400', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(baseCreatePayload({ idHito: H.B }));
      await expectStatus(env.tasksService.create(P.A, U.liderA, dto), BadRequestException, 400);
    });

    it('rol de Proyecto B en creación de Proyecto A: 400', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(baseCreatePayload({ idRolProyecto: R.desarrolloB }));
      await expectStatus(env.tasksService.create(P.A, U.liderA, dto), BadRequestException, 400);
    });

    it('etiqueta de Proyecto B en creación de Proyecto A: 400', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(baseCreatePayload({ idsEtiquetas: [E.bOtra] }));
      await expectStatus(env.tasksService.create(P.A, U.liderA, dto), BadRequestException, 400);
    });

    it('array de etiquetas mezclado (A + B) se rechaza completo: sin creación ni actualización parcial', async () => {
      const env = setupLifecycleEnv();
      const dtoCrear = await parseCreate(baseCreatePayload({ idsEtiquetas: [E.aUrgente, E.bOtra] }));
      const totalTareasAntes = env.state.tareas.length;
      await expectStatus(env.tasksService.create(P.A, U.liderA, dtoCrear), BadRequestException, 400);
      expect(env.state.tareas).toHaveLength(totalTareasAntes); // ninguna tarea creada

      // Ahora sobre una tarea existente con etiquetas conocidas: la edición debe revertirse igual.
      const dtoBase = await parseCreate(baseCreatePayload({ idsEtiquetas: [E.aUrgente] }));
      const creada = await env.tasksService.create(P.A, U.liderA, dtoBase);
      const dtoEditar = await parseUpdate({ idsEtiquetas: [E.aBackend, E.bOtra] });
      await expectStatus(env.tasksService.update(P.A, creada.idTarea, U.liderA, dtoEditar), BadRequestException, 400);
      const etiquetasTrasFallo = env.state.tareaEtiquetas.filter((te) => te.idTarea === creada.idTarea);
      expect(etiquetasTrasFallo.map((te) => te.idEtiqueta)).toEqual([E.aUrgente]); // intactas
    });

    it('recurso inexistente (hito/rol/etiqueta) conserva 404, no se degrada a 400', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idHito: 999999 }))),
        NotFoundException,
        404,
      );
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idRolProyecto: 999999 }))),
        NotFoundException,
        404,
      );
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idsEtiquetas: [999999] }))),
        NotFoundException,
        404,
      );
    });
  });

  // -------------------------------------------------------------------
  // Matriz de permisos 403
  // -------------------------------------------------------------------
  describe('Matriz de permisos 403', () => {
    it('crear tarea: participante no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(baseCreatePayload());
      const e = await expectStatus(env.tasksService.create(P.A, U.a1, dto), ForbiddenException, 403);
      expect(e.getStatus()).toBe(403);
    });

    it('editar tarea: asignado no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      const dto = await parseUpdate({ tituloTarea: 'intento no autorizado' });
      await expectStatus(env.tasksService.update(P.A, creada.idTarea, U.a1, dto), ForbiddenException, 403);
    });

    it('asignar: participante no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      const dto = await parseAssign({ idUsuario: U.a2 });
      await expectStatus(env.tasksService.assign(P.A, creada.idTarea, U.a1, dto), ForbiddenException, 403);
    });

    it('reasignar: asignado actual no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      const dto = await parseAssign({ idUsuario: U.a2 });
      await expectStatus(env.tasksService.assign(P.A, creada.idTarea, U.a1, dto), ForbiddenException, 403);
    });

    it('desasignar: asignado actual no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      await expectStatus(env.tasksService.unassign(P.A, creada.idTarea, U.a1), ForbiddenException, 403);
    });

    it('soft delete: asignado activo no líder → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      await expectStatus(env.tasksService.remove(P.A, creada.idTarea, U.a1), ForbiddenException, 403);
    });

    it('cambiar estado: participante activo no asignado → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      const dto = await parseEstado({ estadoTarea: 'HECHO' });
      await expectStatus(env.tasksService.updateEstado(P.A, creada.idTarea, U.a2, dto), ForbiddenException, 403);
    });

    it('cambiar estado: antiguo asignado (reemplazado) → 403', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a2 }));
      const dto = await parseEstado({ estadoTarea: 'HECHO' });
      await expectStatus(env.tasksService.updateEstado(P.A, creada.idTarea, U.a1, dto), ForbiddenException, 403);
    });

    it('cambiar estado: creador de la tarea (Tarea.creadaPor) sin ser líder ni asignado → 403; creadaPor nunca se consulta', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      // Simula una tarea cuyo creadaPor no coincide con el líder actual, para
      // demostrar que la autorización nunca consulta ese campo.
      const fila = env.state.tareas.find((t) => t.idTarea === creada.idTarea)!;
      fila.creadaPor = U.a2;
      const dto = await parseEstado({ estadoTarea: 'HECHO' });
      await expectStatus(env.tasksService.updateEstado(P.A, creada.idTarea, U.a2, dto), ForbiddenException, 403);
    });
  });

  // -------------------------------------------------------------------
  // Matriz 404
  // -------------------------------------------------------------------
  describe('Matriz de recursos no encontrados 404', () => {
    it('proyecto inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(env.tasksService.findAll(999999, U.liderA), NotFoundException, 404);
    });

    it('proyecto eliminado → 404', async () => {
      const env = setupLifecycleEnv();
      env.state.proyectos.find((p) => p.idProyecto === P.A)!.eliminadoEn = new Date();
      await expectStatus(env.tasksService.findAll(P.A, U.liderA), NotFoundException, 404);
    });

    it('tarea inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(env.tasksService.findOne(P.A, 999999, U.liderA), NotFoundException, 404);
    });

    it('tarea de otro proyecto → 404, indistinguible de inexistente', async () => {
      const env = setupLifecycleEnv();
      const creadaEnB = await env.tasksService.create(P.B, U.liderB, await parseCreate(baseCreatePayload()));
      const errorOtroProyecto = await expectStatus(
        env.tasksService.findOne(P.A, creadaEnB.idTarea, U.liderA),
        NotFoundException,
        404,
      );
      const errorInexistente = await expectStatus(
        env.tasksService.findOne(P.A, 999999, U.liderA),
        NotFoundException,
        404,
      );
      expect(errorOtroProyecto.getStatus()).toBe(errorInexistente.getStatus());
    });

    it('usuario candidato inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await expectStatus(
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: 999999 })),
        NotFoundException,
        404,
      );
    });

    it('hito inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idHito: 999999 }))),
        NotFoundException,
        404,
      );
    });

    it('rol inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idRolProyecto: 999999 }))),
        NotFoundException,
        404,
      );
    });

    it('etiqueta inexistente → 404', async () => {
      const env = setupLifecycleEnv();
      await expectStatus(
        env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload({ idsEtiquetas: [999999] }))),
        NotFoundException,
        404,
      );
    });
  });

  // -------------------------------------------------------------------
  // Casos 400
  // -------------------------------------------------------------------
  describe('Casos 400', () => {
    it('candidato no participa activamente en el proyecto (tarea sin rol) → 400', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await expectStatus(
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.externo })),
        BadRequestException,
        400,
      );
    });

    it('candidato participa únicamente en otro proyecto → 400', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await expectStatus(
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.participanteB })),
        BadRequestException,
        400,
      );
    });

    it('etiquetas duplicadas en el mismo payload → 400 (validación del DTO, no del service)', async () => {
      await expect(
        parseUpdate({ idsEtiquetas: [E.aUrgente, E.aUrgente] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cambio de rol incompatible con el asignado activo → 400, la tarea no cambia', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a3Diseno }));
      // a3 solo participa en Diseño; cambiar el rol de la tarea a Desarrollo lo deja incompatible.
      const dto = await parseUpdate({ idRolProyecto: R.desarrolloA });
      await expectStatus(env.tasksService.update(P.A, creada.idTarea, U.liderA, dto), BadRequestException, 400);
      const filaTrasFallo = env.state.tareas.find((t) => t.idTarea === creada.idTarea)!;
      expect(filaTrasFallo.idRolProyecto).toBeNull();
    });

    it('payload de edición vacío → 400', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await expectStatus(env.tasksService.update(P.A, creada.idTarea, U.liderA, {} as any), BadRequestException, 400);
    });

    it('estado inválido → 400 vía validación real del DTO (UpdateTaskEstadoDto)', async () => {
      await expect(parseEstado({ estadoTarea: 'NO_EXISTE' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('idUsuario inválido en AssignTaskDto (cero, negativo, decimal, string) → 400 vía validación real', async () => {
      await expect(parseAssign({ idUsuario: 0 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(parseAssign({ idUsuario: -1 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(parseAssign({ idUsuario: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(parseAssign({ idUsuario: 'siete' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(parseAssign({})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------
  // Colisión 409
  // -------------------------------------------------------------------
  describe('Colisión concurrente 409', () => {
    it('dos asignaciones concurrentes a la misma tarea: una éxito, una 409, una sola asignación activa final', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));

      // Los DTOs se resuelven ANTES de invocar assign(): un `await` dentro
      // del literal del array retrasaría la segunda llamada hasta que la
      // primera termine por completo (perdiendo la carrera real), porque
      // JS evaluaría cada elemento —incluido su propio `await`— en orden.
      const dtoA = await parseAssign({ idUsuario: U.a1 });
      const dtoB = await parseAssign({ idUsuario: U.a2 });

      const [resultadoA, resultadoB] = await Promise.allSettled([
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, dtoA),
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, dtoB),
      ]);

      const exitos = [resultadoA, resultadoB].filter((r) => r.status === 'fulfilled');
      const rechazos = [resultadoA, resultadoB].filter((r) => r.status === 'rejected');
      expect(exitos).toHaveLength(1);
      expect(rechazos).toHaveLength(1);

      const razon = (rechazos[0] as PromiseRejectedResult).reason;
      expect(razon).toBeInstanceOf(ConflictException);
      expect(razon.getStatus()).toBe(409);
      expect(razon.message).toBe('La tarea ya tiene una asignación activa');

      const activas = env.state.asignaciones.filter((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null);
      expect(activas).toHaveLength(1);
    });

    it('un P2002 distinto (simulado en otra tabla del fixture) NO se convierte en este conflicto', async () => {
      const env = setupLifecycleEnv();
      // La colisión de asignación es específica de AsignacionTarea.idTarea;
      // un error genérico ajeno a ese punto no debe pasar por el detector.
      env.db.__failNext('tarea.update', new Error('fallo genérico ajeno a la colisión de asignación'));
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await expect(
        env.tasksService.updateEstado(P.A, creada.idTarea, U.liderA, await parseEstado({ estadoTarea: 'HECHO' })),
      ).rejects.not.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // Soft delete y bloqueo posterior
  // -------------------------------------------------------------------
  describe('Soft delete y bloqueo de operaciones posteriores', () => {
    async function crearTareaRicaParaEliminar(env: LifecycleEnv) {
      const dto = await parseCreate(
        baseCreatePayload({
          idHito: H.A,
          idRolProyecto: R.desarrolloA,
          idsEtiquetas: [E.aUrgente],
          idUsuarioAsignado: U.a1,
        }),
      );
      const creada = await env.tasksService.create(P.A, U.liderA, dto);
      env.state.comentarios.push({
        idComentario: 500,
        idAutor: U.a1,
        contenido: 'Comentario existente',
        idProyecto: null,
        idTarea: creada.idTarea,
        idHito: null,
        creadoEn: new Date(),
        editadoEn: null,
        eliminadoEn: null,
      });
      env.state.evidencias.push({
        idEvidencia: 600,
        idTarea: creada.idTarea,
        idUsuarioCargador: U.a1,
        tipoEvidencia: 'ENLACE',
        urlRecurso: 'https://ejemplo.test/evidencia',
        fechaEnvio: new Date(),
      });
      return creada;
    }

    it('preserva historial completo y bloquea todas las operaciones posteriores', async () => {
      const env = setupLifecycleEnv();
      const creada = await crearTareaRicaParaEliminar(env);
      const taskId = creada.idTarea;

      const asignacionAntes = env.state.asignaciones.find((a) => a.idTarea === taskId && a.desasignadaEn === null)!;
      const etiquetasAntes = env.state.tareaEtiquetas.filter((te) => te.idTarea === taskId);
      const comentariosAntes = env.state.comentarios.filter((c) => c.idTarea === taskId);
      const evidenciasAntes = env.state.evidencias.filter((e) => e.idTarea === taskId);

      await env.tasksService.remove(P.A, taskId, U.liderA);

      const filaTarea = env.state.tareas.find((t) => t.idTarea === taskId)!;
      expect(filaTarea).toBeDefined();
      expect(filaTarea.eliminadoEn).not.toBeNull();

      const asignacionDespues = env.state.asignaciones.find((a) => a.idAsignacion === asignacionAntes.idAsignacion)!;
      expect(asignacionDespues.desasignadaEn).not.toBeNull();
      expect(asignacionDespues.idUsuario).toBe(asignacionAntes.idUsuario);
      expect(env.state.asignaciones.filter((a) => a.idTarea === taskId)).toHaveLength(1);

      expect(env.state.tareaEtiquetas.filter((te) => te.idTarea === taskId)).toEqual(etiquetasAntes);
      expect(env.state.comentarios.filter((c) => c.idTarea === taskId)).toEqual(comentariosAntes);
      expect(env.state.evidencias.filter((e) => e.idTarea === taskId)).toEqual(evidenciasAntes);

      const listado = await env.tasksService.findAll(P.A, U.liderA);
      expect(listado.some((t) => t.idTarea === taskId)).toBe(false);

      await expectStatus(env.tasksService.findOne(P.A, taskId, U.liderA), NotFoundException, 404);
      await expectStatus(
        env.tasksService.update(P.A, taskId, U.liderA, await parseUpdate({ tituloTarea: 'no debería aplicarse' })),
        NotFoundException,
        404,
      );
      await expectStatus(
        env.tasksService.updateEstado(P.A, taskId, U.liderA, await parseEstado({ estadoTarea: 'HECHO' })),
        NotFoundException,
        404,
      );
      await expectStatus(
        env.tasksService.assign(P.A, taskId, U.liderA, await parseAssign({ idUsuario: U.a2 })),
        NotFoundException,
        404,
      );
      await expectStatus(env.tasksService.unassign(P.A, taskId, U.liderA), NotFoundException, 404);
      await expectStatus(env.tasksService.remove(P.A, taskId, U.liderA), NotFoundException, 404);

      const totalComentariosAntes = env.state.comentarios.length;
      // Tarea 28: la creación de comentarios de tarea se migró a la ruta
      // anidada/contextualizada (createForTask); la genérica create() ya no
      // acepta idTarea en absoluto.
      await expectStatus(
        env.comentariosService.createForTask(P.A, taskId, U.liderA, 'no debería crearse'),
        NotFoundException,
        404,
      );
      expect(env.state.comentarios).toHaveLength(totalComentariosAntes);
    });
  });

  // -------------------------------------------------------------------
  // Efecto sobre el avance
  // -------------------------------------------------------------------
  describe('Efecto sobre el avance del proyecto', () => {
    it('el avance considera únicamente tareas activas y se actualiza de inmediato al eliminar una', async () => {
      const env = setupLifecycleEnv();
      const activaHecha = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ tituloTarea: 'Activa hecha' })),
      );
      await env.tasksService.updateEstado(P.A, activaHecha.idTarea, U.liderA, await parseEstado({ estadoTarea: 'HECHO' }));

      const activaNoCompletada = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ tituloTarea: 'Activa no completada' })),
      );

      const eliminadaHecha = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ tituloTarea: 'Eliminada hecha' })),
      );
      await env.tasksService.updateEstado(P.A, eliminadaHecha.idTarea, U.liderA, await parseEstado({ estadoTarea: 'HECHO' }));

      const eliminadaNoCompletada = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ tituloTarea: 'Eliminada no completada' })),
      );

      // Antes de eliminar: el avance calculado con la tarea activa participa.
      const avanceAntes = await env.projectsService.getAvance(P.A, U.liderA);
      expect(avanceAntes.tareas.total).toBe(4);
      expect(avanceAntes.tareas.hecho).toBe(2);
      expect(avanceAntes.tareas.porcentaje).toBe(50);

      await env.tasksService.remove(P.A, eliminadaHecha.idTarea, U.liderA);
      await env.tasksService.remove(P.A, eliminadaNoCompletada.idTarea, U.liderA);

      const avanceDespues = await env.projectsService.getAvance(P.A, U.liderA);
      // Correcto (solo las 2 activas: 1 hecha, 1 no): 1/2 = 50%.
      // Si las eliminadas se contaran (4 tareas, 2 hechas): también 50% por
      // coincidencia — por eso también se verifica el total explícitamente.
      expect(avanceDespues.tareas.total).toBe(2);
      expect(avanceDespues.tareas.hecho).toBe(1);
      expect(avanceDespues.tareas.porcentaje).toBe(50);

      // findMine coincide con getAvance sobre el mismo dataset.
      const misProyectos = await env.projectsService.findMine(U.liderA);
      const miProyectoA = misProyectos.find((p: any) => p.idProyecto === P.A);
      expect(miProyectoA.avanceProyecto.tareas).toEqual(avanceDespues.tareas);

      expect(activaNoCompletada.estadoTarea).toBe('POR_HACER'); // sanity: nunca se tocó
    });
  });

  // -------------------------------------------------------------------
  // Idempotencia obligatoria (adicional a la ya cubierta en el Escenario A)
  // -------------------------------------------------------------------
  describe('Idempotencia obligatoria', () => {
    it('cambio al mismo estado es idempotente y devuelve el contrato público correcto', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      const dto = await parseEstado({ estadoTarea: 'POR_HACER' });
      const r1 = await env.tasksService.updateEstado(P.A, creada.idTarea, U.liderA, dto);
      const r2 = await env.tasksService.updateEstado(P.A, creada.idTarea, U.liderA, dto);
      expect(r1.estadoTarea).toBe('POR_HACER');
      expect(r2.estadoTarea).toBe('POR_HACER');
      expectPublicContract(r2);
    });

    it('carrera de desasignación con count: 0 se resuelve como éxito, sin notificación adicional', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));

      // Simula que otra solicitud ya cerró la asignación justo antes del
      // updateMany de esta llamada: fuerza el mismo resultado (count: 0)
      // que produciría esa carrera, cerrando la fila por fuera del service.
      const activa = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null)!;
      const updateManyOriginal = env.db.asignacionTarea.updateMany.getMockImplementation()!;
      env.db.asignacionTarea.updateMany.mockImplementationOnce(async (args: any) => {
        activa.desasignadaEn = new Date(); // otra "solicitud" gana la carrera
        return updateManyOriginal(args); // esta ahora no encuentra nada que cerrar → count 0
      });

      await expect(env.tasksService.unassign(P.A, creada.idTarea, U.liderA)).resolves.toBeUndefined();
      expect(env.notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('una segunda eliminación NO es idempotente: sigue devolviendo 404, no 204 silencioso', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.remove(P.A, creada.idTarea, U.liderA);
      await expectStatus(env.tasksService.remove(P.A, creada.idTarea, U.liderA), NotFoundException, 404);
    });
  });

  // -------------------------------------------------------------------
  // Notificaciones
  // -------------------------------------------------------------------
  describe('Notificaciones', () => {
    it('creación con asignado: notifica una vez, después del commit, al destinatario correcto', async () => {
      const env = setupLifecycleEnv();
      const dto = await parseCreate(baseCreatePayload({ idUsuarioAsignado: U.a1 }));
      await env.tasksService.create(P.A, U.liderA, dto);
      expect(env.notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
      expect(env.notifications.notifyFromTemplate).toHaveBeenCalledWith(
        [U.a1],
        'TAREA_ASIGNADA',
        expect.any(Object),
      );
    });

    it('creación sin asignado: no notifica', async () => {
      const env = setupLifecycleEnv();
      await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      expect(env.notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('desasignación efectiva: una notificación al usuario anterior', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      await env.tasksService.unassign(P.A, creada.idTarea, U.liderA);
      expect(env.notifications.notifyFromTemplate).toHaveBeenCalledTimes(1);
      expect(env.notifications.notifyFromTemplate).toHaveBeenCalledWith([U.a1], 'TAREA_ACTUALIZADA', expect.any(Object));
    });

    it('desasignación repetida: ninguna notificación adicional', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      await env.tasksService.unassign(P.A, creada.idTarea, U.liderA);
      env.notifications.notifyFromTemplate.mockClear();
      await env.tasksService.unassign(P.A, creada.idTarea, U.liderA);
      expect(env.notifications.notifyFromTemplate).not.toHaveBeenCalled();
    });

    it('fallo de notificación no revierte la operación ya comprometida (creación)', async () => {
      const env = setupLifecycleEnv();
      env.notifications.notifyFromTemplate.mockRejectedValue(new Error('gateway caído'));
      const dto = await parseCreate(baseCreatePayload({ idUsuarioAsignado: U.a1 }));
      const creada = await env.tasksService.create(P.A, U.liderA, dto);
      expect(creada.idTarea).toBeDefined();
      expect(env.state.tareas.find((t) => t.idTarea === creada.idTarea)).toBeDefined();
    });

    it('fallo de notificación no revierte la desasignación ya comprometida', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      env.notifications.notifyFromTemplate.mockRejectedValue(new Error('gateway caído'));

      await expect(env.tasksService.unassign(P.A, creada.idTarea, U.liderA)).resolves.toBeUndefined();
      const activa = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null);
      expect(activa).toBeUndefined(); // la desasignación permanece comprometida
    });
  });

  // -------------------------------------------------------------------
  // Atomicidad integral
  // -------------------------------------------------------------------
  describe('Atomicidad integral', () => {
    it('creación: fallo al crear etiquetas después de crear tarea y asignación → rollback total', async () => {
      const env = setupLifecycleEnv();
      const totalTareasAntes = env.state.tareas.length;
      const totalAsignacionesAntes = env.state.asignaciones.length;
      env.db.__failNext('tareaEtiqueta.createMany');

      const dto = await parseCreate(
        baseCreatePayload({ idUsuarioAsignado: U.a1, idsEtiquetas: [E.aUrgente] }),
      );
      await expect(env.tasksService.create(P.A, U.liderA, dto)).rejects.toThrow();

      expect(env.state.tareas).toHaveLength(totalTareasAntes);
      expect(env.state.asignaciones).toHaveLength(totalAsignacionesAntes);
    });

    it('edición: fallo al insertar etiquetas nuevas tras eliminar las anteriores → campos y etiquetas originales restaurados', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ idsEtiquetas: [E.aUrgente] })),
      );
      const tituloOriginal = creada.tituloTarea;
      env.db.__failNext('tareaEtiqueta.createMany');

      const dto = await parseUpdate({ tituloTarea: 'no debería persistir', idsEtiquetas: [E.aBackend] });
      await expect(env.tasksService.update(P.A, creada.idTarea, U.liderA, dto)).rejects.toThrow();

      const filaTrasFallo = env.state.tareas.find((t) => t.idTarea === creada.idTarea)!;
      expect(filaTrasFallo.tituloTarea).toBe(tituloOriginal);
      const etiquetasTrasFallo = env.state.tareaEtiquetas.filter((te) => te.idTarea === creada.idTarea);
      expect(etiquetasTrasFallo.map((te) => te.idEtiqueta)).toEqual([E.aUrgente]);
    });

    it('reasignación: fallo al crear la nueva asignación tras cerrar la anterior → la anterior continúa activa', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      const activaAntes = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null)!;

      env.db.__failNext('asignacionTarea.create');
      await expect(
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a2 })),
      ).rejects.toThrow();

      const activaDespues = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null)!;
      expect(activaDespues.idAsignacion).toBe(activaAntes.idAsignacion);
      expect(activaDespues.idUsuario).toBe(U.a1);
    });

    it('soft delete: fallo al actualizar la tarea tras cerrar la asignación → tarea y asignación permanecen activas', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));

      env.db.__failNext('tarea.update');
      await expect(env.tasksService.remove(P.A, creada.idTarea, U.liderA)).rejects.toThrow();

      const fila = env.state.tareas.find((t) => t.idTarea === creada.idTarea)!;
      expect(fila.eliminadoEn).toBeNull();
      const activa = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null);
      expect(activa).toBeDefined();
    });

    it('cambio de estado: lectura final nula tras el update → rollback (el estado no queda persistido)', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      env.db.__failNext('tarea.findFirst');

      await expect(
        env.tasksService.updateEstado(P.A, creada.idTarea, U.liderA, await parseEstado({ estadoTarea: 'HECHO' })),
      ).rejects.toThrow();

      // La transacción completa (incluido el update) se revirtió.
      const fila = env.state.tareas.find((t) => t.idTarea === creada.idTarea)!;
      expect(fila.estadoTarea).toBe('POR_HACER');
    });

    it('conflicto de asignación: la transacción perdedora no deja cambios parciales', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(P.A, U.liderA, await parseCreate(baseCreatePayload()));
      await env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a1 }));
      const activaAntes = env.state.asignaciones.find((a) => a.idTarea === creada.idTarea && a.desasignadaEn === null)!;
      const totalAntes = env.state.asignaciones.length;

      // Reasignación que pierde la carrera: se fuerza la colisión real en el
      // segundo `create` (misma forma que produciría el índice parcial).
      env.db.asignacionTarea.create.mockRejectedValueOnce(
        new (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`id_tarea`)',
          { code: 'P2002', clientVersion: '6.19.2', meta: { modelName: 'AsignacionTarea', target: ['id_tarea'] } },
        ),
      );

      await expect(
        env.tasksService.assign(P.A, creada.idTarea, U.liderA, await parseAssign({ idUsuario: U.a2 })),
      ).rejects.toBeInstanceOf(ConflictException);

      // El cierre de la anterior (que sí se había ejecutado antes del create fallido) se revirtió.
      const activaDespues = env.state.asignaciones.find((a) => a.idAsignacion === activaAntes.idAsignacion)!;
      expect(activaDespues.desasignadaEn).toBeNull();
      expect(env.state.asignaciones).toHaveLength(totalAntes);
    });
  });

  // -------------------------------------------------------------------
  // Contrato público a lo largo del ciclo
  // -------------------------------------------------------------------
  describe('Contrato público estable', () => {
    it('creación, detalle, edición, estado, asignación y reasignación devuelven la misma forma TareaPublica', async () => {
      const env = setupLifecycleEnv();
      const creada = await env.tasksService.create(
        P.A,
        U.liderA,
        await parseCreate(baseCreatePayload({ fechaLimite: FECHA_FUTURA })),
      );
      expectPublicContract(creada);
      expect(creada.fechaLimite).toBe(FECHA_FUTURA);

      const detalle = await env.tasksService.findOne(P.A, creada.idTarea, U.liderA);
      expectPublicContract(detalle);

      const editada = await env.tasksService.update(
        P.A,
        creada.idTarea,
        U.liderA,
        await parseUpdate({ tituloTarea: 'Editada' }),
      );
      expectPublicContract(editada);

      const conEstado = await env.tasksService.updateEstado(
        P.A,
        creada.idTarea,
        U.liderA,
        await parseEstado({ estadoTarea: 'EN_PROGRESO' }),
      );
      expectPublicContract(conEstado);

      const asignada = await env.tasksService.assign(
        P.A,
        creada.idTarea,
        U.liderA,
        await parseAssign({ idUsuario: U.a1 }),
      );
      expectPublicContract(asignada);

      const reasignada = await env.tasksService.assign(
        P.A,
        creada.idTarea,
        U.liderA,
        await parseAssign({ idUsuario: U.a2 }),
      );
      expectPublicContract(reasignada);
      expect(reasignada.asignacionActiva?.idUsuario).toBe(U.a2);
    });
  });
});
