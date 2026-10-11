# Calendario del estudiante (HU-184, PR #262): revisión y contrato de integración

> **Estado de este documento.** Registro local de revisión, escrito al cierre del Gate G05 (2026-10-10).
> No aprueba el PR ni sustituye la revisión de Angel. Nada de lo descrito aquí se ha publicado: los
> commits de corrección están solo en el worktree local y **no se hizo push, merge ni edición del PR**.
> Todas las cifras son de ejecuciones locales sobre la SHA indicada; **no hay ninguna corrida de CI sobre
> esa SHA** y no debe leerse como «CI en verde».

| Dato | Valor |
| --- | --- |
| Rama | `feature/rediseño-dialogo-vista-calendario` (PR #262, de Derek) |
| Base del PR | `develop`; base común `4e503f0f` |
| Cabeza publicada del PR | `a99eaa00` |
| Cabeza local evaluada | `848f2ed2` más el commit de este documento (84 commits locales sin publicar) |
| `origin/develop` usado como referencia | `5833a402` (2026-10-09), sin volver a hacer fetch |

## 1. Quién hizo qué

- **Implementación del PR:** Derek (`dcoronado91`), 87 commits hasta `a99eaa00`.
- **T-325 (pruebas E2E):** según el backlog del sprint está asignada a Samuel; los E2E de calendario del PR original los escribió Derek.
- **Correcciones de los gates G01–G05:** Vernel (`Junjey123-mx`), 84 commits locales encima de `a99eaa00`. Son
  correcciones y pruebas sobre el trabajo de Derek; la funcionalidad base sigue siendo suya.

## 2. Alcance real del PR

La descripción publicada del PR dice que no hay cambios de backend ni de base de datos. **No es cierto**
(hallazgo F262-02) y conviene corregirla antes de la re-revisión. Recuento con `git diff --name-only`:

| Área | PR publicado (`4e503f0f..a99eaa00`) | Con las correcciones locales (`4e503f0f..`848f2ed2` más el commit de este documento`) |
| --- | --- | --- |
| Archivos en total | 58 | 82 |
| Backend, código (`apps/backend/src`) | 10 | 11 |
| Backend, Prisma | 3 (esquema + 2 migraciones) | 3 (sin cambios desde el PR) |
| Backend, pruebas | 5 | 10 |
| Frontend, código | 24 | 28 |
| Frontend, pruebas unitarias | 13 | 20 |
| E2E y arnés | 2 | 7 |
| Documentación | 1 | 3 |

Lo que el PR añade en backend y base de datos:

- **Módulo nuevo `calendar-shares`** con cinco rutas bajo `usuarios/me/calendario`, todas con sesión:
  `GET compartidos`, `POST compartidos` (limitado a 5 por minuto), `DELETE compartidos/:idUsuario`,
  `DELETE compartidos-conmigo/:idPropietario` (añadida en G01) y `GET compartidos-conmigo/:idPropietario/agenda`.
- **Dos migraciones aditivas** (`20261006120000`, `20261006120001`): tabla `calendario_compartido`, columnas
  `tipo_evento` e `invitados` en `evento_proyecto` con valor por defecto, y el valor
  `CALENDARIO_COMPARTIDO` en el enum de notificaciones. No borran ni reescriben nada.
- Cambios en `events` (DTO, servicio y recordatorios) y en las plantillas de notificación.

El despliegue de este PR **requiere `prisma migrate deploy`**.

## 3. Lista de comprobación del backlog

| Ítem | Qué pide | Estado | Dónde se comprueba |
| --- | --- | --- | --- |
| HU-184 | Diálogo de evento claro y vista de calendario rediseñada | Implementado; pendiente de re-revisión de Angel | Todo lo de abajo |
| T-323 | Campos, fecha y hora, validación y mensajes | Validado en interfaz y contra la API real | `test/event-form-dialog.spec.tsx`, `test/event-form-schema.spec.ts`, `e2e/calendario-eventos.spec.ts` |
| T-324 | Color por tipo, «hoy», responsive y detalle | Validado en navegador en siete anchos y dos temas | `e2e/calendario-navegacion.spec.ts`, `e2e/calendario-accesibilidad.spec.ts` |
| T-325 | E2E de crear, editar, borrar, vacíos y fechas | **Ejecutado de verdad** contra pila completa | `e2e/calendario-eventos.spec.ts` |

## 4. Evidencia ejecutada

Todo se ejecutó en local sobre `848f2ed2` (este documento es el único cambio posterior).

| Qué | Resultado |
| --- | --- |
| Frontend, unitarias (Vitest) | 192 archivos, **2927 pasan, 0 fallan** |
| Frontend, tipos y lint | `tsc --noEmit` sin errores; `eslint .` sin errores |
| Backend, unitarias (Vitest) | **3440 pasan, 9 fallan**. Las 9 son `g08-*`: verifican el delta de la rama OWASP y fallan en cualquier otra rama. Misma lista que antes de este trabajo |
| Backend, lint y build | `eslint` sin errores (25 avisos previos); `nest build` correcto |
| Integración HTTP contra PostgreSQL desechable | 60 archivos, **251 pasan**, 13 omitidas por sus propias suites, 0 fallan |
| Migraciones sobre base nueva | 53 aplicadas, ninguna fallida; `migrate status` al día; segunda aplicación sin pendientes; `migrate diff` contra el esquema sin diferencias |
| E2E de pila completa (Playwright, sesión real) | Suite completa de la aplicación: **56 pruebas, 53 pasan y 3 son fallos esperados** (los dos hallazgos abiertos de la sección 5). De calendario: 48 (45 + 3) |
| Accesibilidad y viewport | 42 combinaciones de vista (7 anchos × 2 temas × Día, Semana, Mes) y 24 de diálogos: sin desborde horizontal, sin objetivos táctiles que incumplan WCAG 2.5.8 y con contraste mínimo medido de 6.36:1 (claro) y 7.74:1 (oscuro) en las vistas, salvo los hallazgos de la sección 5 |
| axe-core (opcional, no es dependencia directa) | 20 superficies. Serias: `scrollable-region-focusable` (real, es G05-HALLAZGO-02) y dos `color-contrast` en tema oscuro que son falsos positivos (la medición propia del mismo control da 7.74:1) |

Cómo se ejecutaron los E2E de pila completa: frontend de producción (`next build` + `next start`) y backend
compilado del mismo HEAD, contra un PostgreSQL 17 y un Redis 7 **desechables** creados solo para esto
(contenedores propios, puertos locales propios, sin volúmenes), con `prisma migrate deploy` + `prisma db seed`
y **sesión real** por el formulario de login con las cuentas sintéticas del seed. Es la misma receta que el
job `e2e` de `ci.yml`. Lo único que se simula es Nominatim (servicio de terceros).

Las pruebas de `test/` (Vitest) usan API simulada y **no** cuentan como E2E.

## 5. Hallazgos abiertos

Encontrados al ejecutar por primera vez contra la pila completa. **No están corregidos**: el Gate G05 tenía
un tope de commits y corregirlos requiere autorización.

| Id | Severidad | Qué pasa | Dónde | Estado |
| --- | --- | --- | --- | --- |
| G05-HALLAZGO-01 | **Seria** (contraste AA) | El texto de error y el botón «Eliminar evento» se ven casi blancos: 1.2–1.3:1 en claro, ~2:1 en oscuro. Se usa `text-status-error`, que es un color de fondo. | 10 usos en `event-detail-dialog`, `event-form-dialog`, `event-location-picker`, `share-calendar-dialog`, `calendar-sidebar` | Parche de 10 líneas preparado y medido (6.1–6.5:1 y >10:1) fuera del repositorio; sin aplicar |
| G05-HALLAZGO-02 | **Seria** (teclado, axe) | En un día o semana sin eventos, la cuadrícula por horas tiene scroll pero no se puede alcanzar con teclado. | `time-grid-view.tsx`, contenedor `cuadricula-horas` | Sin corregir |
| G05-OBS-01 | Media | El mapa de ubicación (HU-169, ya en `develop`) carga OpenStreetMap, Nominatim y `unpkg.com`, que la CSP no declara. Hoy la CSP está en modo informe; con `CSP_MODE=enforce` el mapa dejaría de funcionar. | `event-location-picker.tsx` frente a `lib/security/csp.ts` | Decisión de Angel y Vernel; no es de este PR |
| G05-OBS-02 | Baja | Si se envía un evento presencial antes de que cargue el mapa, el error aparece pero el foco no va al campo de ubicación. | `event-form-dialog.tsx` (`onInvalid`) | Sin corregir |
| G05-OBS-03 | Baja | El diálogo «Compartir agenda» no refresca su lista al abrirse: si la otra persona se quitó el calendario, sigue apareciendo hasta recargar. | `share-calendar-dialog.tsx` | Sin corregir |
| G05-OBS-04 | Baja | Dos activaciones del botón «Agendar evento» en el mismo instante crean dos eventos. Un doble clic real crea uno. | `event-form-dialog.tsx` | Sin corregir |
| G05-OBS-05 | Baja | Los días del mini calendario se anuncian solo con su número («28»), sin mes. | `mini-calendar.tsx` (componente compartido) | Coordinar con el calendario administrativo |
| G05-OBS-06 | Baja (heredada) | A 768 px, «Cambiar tema» y «Repetir tour» de la cabecera general quedan fuera de la ventana. | Cabecera de la aplicación, no del calendario | Fuera de este PR |
| G05-OBS-07 | Baja (heredada) | El botón de cierre de los diálogos se llama «Close» (en inglés). | `components/ui/dialog` (compartido) | Fuera de este PR |

Las dos pruebas de `e2e/calendario-accesibilidad.spec.ts` con el prefijo `G05-HALLAZGO-` están marcadas como
**fallo esperado** (`test.fail`): fallan hoy a propósito y avisarán en cuanto el defecto se corrija.

## 6. Decisiones pendientes

| Id | Decisión | De quién |
| --- | --- | --- |
| P-1 | Política de la agenda compartida (DETALLE solo con acceso propio al proyecto, OCUPADO en lo demás, nada de lo restringido). Implementada como opción conservadora; falta ratificarla. | Angel y PO |
| P-2 | Eventos de varios días. Se restauraron con «Termina otro día» en G02; falta confirmarlo. | PO |
| P-3 | `rolesDestino`: retirar el campo o volver a aplicarlo. Registrado en `docs/deuda-tecnica-sprint9.md`. | PO y Angel |
| P-4 | Semana en lista por debajo de 1280 px y columna plegable en móvil. Implementado; falta confirmarlo. | Vernel |
| P-5 | Declarar `axe-core` como dependencia de desarrollo. **No se añadió**; hoy solo se usa, si está, desde el arnés opcional. | Vernel |
| B-11 | Si un administrador puede recibir un calendario compartido (hoy sí). | PO |
| — | Ratificar los commits no planificados `79ad1095` (G04) y `408092ca` (G05). | Propietario del trabajo |
| — | G05-R01: «Ocupado» no se oculta al desmarcar el tipo «Otro». Aplicado como comportamiento conservador; revertir si el PO decide lo contrario. | PO |

## 7. Integración segura

Simulado con `git merge-tree` (no modifica el índice ni el directorio de trabajo). **No se ejecutó ningún merge.**

- **PR → `develop` (`5833a402`):** la cabeza local se integra **sin conflictos**.
- **`develop` → `sprint9/vernel-workstream` (calendario administrativo de Sprints):** `develop` fue reescrito con
  force-push (`e33752e6 → 6eb1a671`). Un merge directo muestra cientos de conflictos que no son reales. Con la
  base real (`--merge-base=e33752e6`) quedan **cinco archivos** en conflicto por este PR:
  `app/global.css`, `components/calendar/agenda-item-row.tsx`, `components/calendar/mini-calendar.tsx`,
  `components/calendar/month-view.tsx` y `test/mini-calendar.spec.tsx`.
- **Hay que revalidar la base antes de integrar**: las SHA de `develop` de arriba son las vistas en local el
  2026-10-10. No usar `git replace --graft` ni ninguna reescritura sin acuerdo del equipo.

### Lo que no se puede perder al resolver `month-view.tsx` y `mini-calendar.tsx`

El calendario administrativo de Sprints (rama de Vernel) depende de piezas que **este PR no tiene**:
`CalendarMonthGrid` y `CALENDAR_DAY_CHIP_CLASS` (exportadas desde `month-view.tsx` y usadas por
`components/admin/sprints/sprint-month-view.tsx`), más `getDayLabel` y `getDayHref` en el mini calendario.
Si gana la versión del PR tal cual, ese calendario deja de compilar (hallazgo F262-03).

Receta propuesta para **después** de que el PR esté aprobado e integrado en `develop`, en la rama administrativa:

1. Conservar `CalendarMonthGrid` y `CALENDAR_DAY_CHIP_CLASS` y hacer que el `MonthView` del estudiante se apoye en esa rejilla.
2. Llevar a la rejilla compartida lo que este PR añade, como opciones con valor por defecto que no cambie lo administrativo:
   - `todayTone` con el valor `primary` (hoy existe `accent`; la rama administrativa tiene además `outline`);
   - `adjacentMonthTone="secondary"` para los días de meses vecinos (G05-R03);
   - el modo compacto de móvil (puntos en vez de chips) y su render de día;
   - `getDayLabel` para el nombre accesible de cada día (resuelve también G05-OBS-05).
3. Mantener sin tocar `SprintMonthView`, `SprintPlanningWidget`, el mini calendario administrativo y sus pruebas.
4. Volver a ejecutar las pruebas de ambos calendarios y los E2E de calendario.

Fuera de este trabajo: el PR #266, `deploy.yml`, la VM y cualquier despliegue.

## 8. Texto sugerido para la descripción del PR

No se ha publicado. Es una propuesta para que Derek la revise y la ponga él si está de acuerdo.

> **HU-184 — Rediseño del diálogo de evento y de la vista de calendario**
>
> **Qué cambia**
> - Frontend: diálogo de evento rediseñado (tipo, modalidad, invitados, recordatorio, fecha de fin opcional), vistas Día, Semana y Mes, columna lateral con mini calendario y filtros, y calendarios compartidos entre personas.
> - **Backend (sí hay cambios):** módulo `calendar-shares` con cinco rutas bajo `usuarios/me/calendario`; cambios en los DTO, el servicio y los recordatorios de eventos; plantilla de notificación `CALENDARIO_COMPARTIDO`.
> - **Base de datos (sí hay cambios):** dos migraciones aditivas (`20261006120000`, `20261006120001`). **El despliegue requiere `prisma migrate deploy`.**
>
> **Privacidad de la agenda compartida.** Quien recibe una agenda ve el detalle solo de los eventos de proyectos donde ya participa; del resto ve «Ocupado» con el horario; lo restringido a otras personas no le llega. Pendiente de ratificar por el PO (P-1).
>
> **Pruebas.** Unitarias de frontend y backend, integración HTTP contra PostgreSQL y E2E de pila completa ejecutados en local (ver `docs/calendar-pr262-review.md`). Falta la corrida de CI sobre la cabeza final.
>
> **Pendiente antes de fusionar.** Dos hallazgos serios de accesibilidad abiertos (contraste del texto de error y cuadrícula sin acceso por teclado), las decisiones de producto P-1, P-2, P-3 y B-11, y coordinar con el calendario administrativo de Sprints, que depende de `CalendarMonthGrid`.

## 9. Cómo reproducir

```bash
# Unitarias
cd apps/frontend && npm run test && npm run typecheck && npm run lint
cd apps/backend  && npm run test && npm run lint && npm run build

# Integración (solo contra una base desechable)
cd apps/backend && INTEGRATION_DATABASE_URL=postgresql://… npm run test:integration

# E2E de pila completa: misma receta que el job e2e de .github/workflows/ci.yml
#   base y Redis desechables → prisma migrate deploy → prisma db seed → backend → build del frontend
cd apps/frontend && PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/calendario-*.spec.ts --workers=1

# Evidencia de viewport, contraste y axe (escribe fuera del repositorio)
cd apps/frontend && PLAYWRIGHT_BASE_URL=http://localhost:3000 node e2e-harness/calendar-viewport-check.mjs --out /ruta/fuera/del/repo
```

Notas para quien los ejecute:

- Compartir un calendario está limitado a 5 por minuto y usuario; los E2E de compartidos hacen cuatro por corrida.
- La API limita por IP (50 peticiones cada 10 s). Con todo saliendo del mismo servidor Next, repetir la suite varias veces seguidas puede dar 429.
- La sesión que guarda `e2e/support/auth.ts` dura una hora, lo mismo que el token de acceso.
