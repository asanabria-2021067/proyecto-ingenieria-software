# Plan de division de servicios grandes por caso de uso (RTF-3.3, P4)

Estado: primera fase hecha (extraccion conservadora). Este documento define como terminar la division.

## 1. Punto de partida y primera fase

| Archivo | Antes | Despues |
| --- | --- | --- |
| `src/tasks/tasks.service.ts` | 2088 | 1121 |
| `src/sprints/sprints.service.ts` | 1810 | 1121 |
| `src/projects/projects.service.ts` | 1580 | 1149 |

Piezas ya extraidas (sin cambio de comportamiento, API publica intacta, los servicios originales delegan):

- Tasks: `TasksNotificationsService` (armado/emision de notificaciones), `TasksBulkService` (accion masiva), `tasks.mapper.ts` (select y mapeo de lectura), `tasks-writes.helpers.ts` (sync de Hito, alta de asignacion activa).
- Sprints: `SprintsReadService` (historial, detalle, analitica, burndown, comparativa, congelado de cierre).
- Projects: `ProjectsCacheService` (cache de destacados), `ProjectsAffinityService` (guardado y orden por afinidad), `ProjectsRevisionsService` (instantanea y revision pendiente), `projects.read-model.ts` (selects, estados, avance).

Los constructores reciben las piezas nuevas como parametros opcionales finales y, si faltan, las construyen con las dependencias que ya tienen. Es un puente: permite que las suites que instancian el servicio con argumentos posicionales sigan intactas. Se elimina en la fase 3.

## 2. Servicios objetivo (por caso de uso)

### Tasks
| Servicio | Metodos que absorbe |
| --- | --- |
| `TasksQueryService` | `findAll`, `findOne` |
| `TasksLifecycleService` | `create`, `update`, `updateEstado`, `remove` |
| `TasksAssignmentService` | `assign`, `unassign`, `closeAssignment` |
| `TasksBulkService` (existe) | `bulkAction` |
| `TasksNotificationsService` (existe) | notificaciones |

`TasksService` queda como fachada fina (o desaparece si los controladores inyectan los servicios directos).

### Sprints
| Servicio | Metodos que absorbe |
| --- | --- |
| `SprintsReadService` (existe) | listado, detalle, analitica, burndown, comparativa |
| `SprintsLifecycleService` | `startSprint`, `regenerarInstantaneaDeHoy`, `finalizeSprint`, `closeSprint` (+ predicados F1-F4 y colision de Sprint operable) |
| `SprintsClosingSummaryService` | `getSprintClosingSummary`, `buildClosingBreakdown`, `getSprintMemberDetail` |
| `SprintsNotificationsService` | avisos de finalizacion y cierre (hoy inline en `finalizeSprint`/`closeSprint`) |

### Projects
| Servicio | Metodos que absorbe |
| --- | --- |
| `ProjectsCatalogService` | `findAll`, `findAllPaginated`, `findOne`, `findFeatured`, `findMine`, `findAsContributor`, guardar/desguardar |
| `ProjectsWorkspaceReadService` | `findOneAdmin`, `findOneOwner`, `getAvance`, `findPostulacionesByProject` |
| `ProjectsLifecycleService` | `createFull`, `create`, `update`, `submitForReview`, `resubmit`, `changeEstado`, `delete` |
| `ProjectsHitosService` | `createHito`, `assignHitoTasks`, sync de estado de Hito |
| `ProjectsCacheService`, `ProjectsAffinityService`, `ProjectsRevisionsService` (existen) | soporte |

## 3. Orden

1. Lecturas puras: `TasksQueryService`, `ProjectsCatalogService`, `ProjectsWorkspaceReadService`, `SprintsClosingSummaryService`. Sin transacciones ni efectos: el riesgo es minimo.
2. Notificaciones restantes de Sprints (`SprintsNotificationsService`) y Hitos de Projects (`ProjectsHitosService`): ya tienen bordes claros.
3. Asignaciones de Tasks (`TasksAssignmentService`): comparte `createActiveAssignment` y la sync de Hito con bulk, ya aislados en `tasks-writes.helpers.ts`.
4. Ciclo de vida de escritura: `TasksLifecycleService`, `SprintsLifecycleService`, `ProjectsLifecycleService`. Son los de mayor riesgo (transaccion por proyecto, lock, efectos post-commit).
5. Retirar la fachada y el puente de parametros opcionales; los controladores y otros modulos (`ExportsService`, `TimeRecords`, etc.) inyectan el servicio concreto.

Un servicio por PR, en el orden indicado, partiendo siempre de `develop`.

## 4. Criterio de salida

- Ningun archivo de `src/` supera 800 lineas (la regla `max-lines` pasa a `error` para todos y se vacia el override de archivos de `src` en `eslint.config.mjs`; el de `test/**` es permanente).
- Cada servicio tiene un unico motivo de cambio (un caso de uso) y no mas de 6 dependencias de constructor.
- Cero cambios de comportamiento por PR: las specs existentes de tasks, sprints y projects pasan sin modificar aserciones (solo providers/mocks del constructor), `tsc --noEmit -p tsconfig.build.json` y `npm run lint` sin errores.
- La API HTTP no cambia (mismos DTOs y rutas); los metodos publicos usados por otros modulos mantienen firma o se migran en el mismo PR.
- Specs de integracion (`test/integration/**`) verdes en CI antes de integrar cada paso de escritura.

## 5. Riesgos y mitigaciones

| Riesgo | Mitigacion |
| --- | --- |
| Romper la atomicidad: cada escritura corre en un unico `projectTx.run` (lock del proyecto primero). Partir un flujo en dos servicios no debe abrir una segunda transaccion. | Mover metodos completos, nunca partir un `run`. Los helpers reciben `tx` como argumento. |
| Notificaciones fuera de la transaccion: deben seguir siendo post-commit y sin relanzar errores. | Mantener el notificador sin acceso a `tx`; mover solo el armado y la emision. |
| Specs que espian el `logger` del servicio o dependen de la construccion posicional. | Conservar el puente de opcionales hasta el paso 5; el notificador de Tasks comparte contexto de log `TasksService`. |
| Dependencias circulares entre modulos al repartir servicios (`TasksModule` <-> `SprintsModule`, `ExportsModule`). | Exportar solo desde el modulo duenio; los helpers puros (sin DI) viven en archivos `*.helpers.ts`. |
| Consumidores externos de metodos hoy en el servicio grande (`computeSprintsComparative`, `computeSprintBurndown`, `assertNoOperableSprint`). | Mantener delegados en la fachada hasta migrar el consumidor en el mismo PR. |
| Tests que leen el texto de los fuentes (guards de cobertura de escritura). | Ejecutar `npx vitest run tasks sprint project` en cada paso; ajustar la ruta del fuente citada solo si el metodo cambia de archivo. |
| Crecimiento de los archivos hoy sobre 800 lineas ajenos a esta RTF (`chat.service.ts` 1059, `admin.service.ts` 919, `time-records.service.ts`, `admin-meetings.service.ts`, `comentarios.service.ts`, `leadership.service.ts`). | Quedan en `warn`; abrir una RTF por cada uno tras terminar tasks, sprints y projects. |
