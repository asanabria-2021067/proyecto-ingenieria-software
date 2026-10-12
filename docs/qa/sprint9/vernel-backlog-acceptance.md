# Sprint 9 — Aceptación de las tareas de Vernel

Trazabilidad de las diez tareas del backlog del Sprint 9 asignadas a Vernel:
qué se implementó, con qué se verificó y qué sigue dependiendo de otra persona
o de una decisión.

Rama `sprint9/vernel-workstream`, commits `7eb232c0`…`e0bdc078` (51 commits
locales sobre `20c6667c`, sin publicar). El resultado de la regresión final
está en `vernel-final-verification.md`.

## Cómo leer los estados

| Estado | Significado |
|---|---|
| `PASS` | Implementada y verificada; nada pendiente para aceptarla |
| `PASS_WITH_OBSERVATIONS` | Lo implementado está verificado, pero queda un criterio abierto o una decisión por tomar, descrito en la fila |
| `BLOCKED` | No puede completarse desde esta rama: depende de otra persona, de otro PR o de un acceso que no se tiene |
| `NOT_VERIFIED` | El código está, pero la evidencia que pide la tarea no se pudo obtener |
| `FAIL` | Verificada y no cumple |

Que exista código no cuenta como aceptación: cada fila separa lo implementado
de lo verificado.

## Resumen

| Tarea | Descripción del backlog | Estado |
|---|---|---|
| T-310 | Pantalla en administración para consultar los eventos de seguridad que ya se registran | `PASS` |
| T-328 | Interruptores por tipo de notificación en la configuración del perfil | `PASS_WITH_OBSERVATIONS` |
| T-319 | Inventario de las secciones actuales y agrupación en menú lateral por tema | `PASS_WITH_OBSERVATIONS` |
| T-320 | Escala tipográfica, espaciado y componentes del sistema de diseño en todas las pantallas de administración | `PASS_WITH_OBSERVATIONS` |
| T-321 | Colocar métricas (HU-178), cuentas pendientes (HU-179) y eventos de seguridad (HU-180) en la nueva estructura | `BLOCKED` |
| T-316 | Lighthouse y axe sobre las cinco pantallas más usadas | `PASS` |
| T-317 | Corregir lo que salga en la auditoría hasta llegar a AA | `PASS_WITH_OBSERVATIONS` |
| T-318 | Chequeo con axe dentro de la suite E2E que corre en CI | `NOT_VERIFIED` |
| T-293 | Carga diferida de componentes pesados y reducción del tamaño del bundle | `PASS` |
| T-313 | Cron con pg_dump, rotación de respaldos y ubicación fuera del contenedor | `BLOCKED` |

**3 `PASS`, 4 `PASS_WITH_OBSERVATIONS`, 2 `BLOCKED`, 1 `NOT_VERIFIED`, 0 `FAIL`.**
No son diez de diez.

## Detalle por tarea

### T-310 — Visor de eventos de seguridad · `PASS`

| | |
|---|---|
| Commits | `7eb232c0`…`2c339c88` (backend, 7), `9bd9c6f2`…`c0625437` (pantalla, 8), `265784c6`, `6212aff8` (E2E) |
| Rutas | `apps/backend/src/security-events/`, migración `20261011120000_security_audit_timeline`; `apps/frontend/app/dashboard/admin/seguridad/`, `components/admin/security/`, `lib/services/admin-security.ts` |
| Implementado | `GET /api/admin/eventos-seguridad` solo para administradores, paginado, con filtros por tipo, usuario, actor y fecha, salida saneada por lista de campos permitidos. Pantalla con tabla, filtros, detalle accesible y estados de carga, vacío y error |
| Verificado | Pruebas unitarias y de integración del backend; unitarias de la pantalla; Chromium con eventos reales producidos por la aplicación: 200 al administrador, 403 al estudiante, 401 sin sesión, filtros combinados, paginación sin saltos, 375 y 1440 px en ambos temas |
| Decisiones aplicadas | Las cuentas se muestran con ID y nombre, nunca con correo. Una IP no confiable se presenta como «IP no verificada» |
| Pendiente de otros | La migración (un índice) no se ha aplicado en la base de desarrollo ni en producción: se aplica al desplegar |

### T-328 — Preferencias de notificación por tipo · `PASS_WITH_OBSERVATIONS`

| | |
|---|---|
| Commits | `4999c379`, `cc1b06ac` (contrato), `df7773cb`…`b1f90c52` (perfil, 5), `d042276f` (E2E) |
| Rutas | `apps/frontend/components/profile/notification-preferences-section.tsx`, `lib/notifications/preference-groups.ts`, `lib/services/notifications.ts`, `app/dashboard/perfil/page.tsx` |
| Implementado | Un interruptor por cada uno de los 41 tipos reales del backend, agrupados por tema, sobre el `GET`/`PUT` existente (PR #265, sin modificar). Guardado no optimista, errores explicados junto al interruptor, anuncios para lector de pantalla |
| Verificado | Unitarias; Chromium con dos cuentas: persiste tras recargar y tras un inicio de sesión nuevo, no afecta a otra cuenta, y con «Nuevo seguidor» desactivado la notificación no se crea |
| **Abierto** | **No hay interruptor de Chat.** El backend no tiene un tipo de notificación de chat (responde 400) y el chat no genera notificaciones. No se simuló. Requiere un valor nuevo en `TipoNotificacion` y que el chat lo emita: trabajo de quien lleva el backend de notificaciones |
| Observaciones | La sección está en `/dashboard/perfil`, no en `/perfil/editar`, porque es la única ruta de perfil común a estudiantes y administradores. El backend permite desactivar la alerta de seguridad: no define tipos obligatorios |

### T-319 — Inventario y menú agrupado · `PASS_WITH_OBSERVATIONS`

| | |
|---|---|
| Commits | `8c17805e`, `461efe9d`, `7091a310` |
| Rutas | `docs/architecture/sprint9-admin-navigation-inventory.md`, `apps/frontend/components/admin/AdminLayout.tsx`, `components/admin/admin-breadcrumb.tsx` |
| Implementado | Inventario de las rutas administrativas y menú lateral en grupos: Panel Admin, Usuarios, Proyectos, Gobernanza, Métricas, Verificación y seguridad, Diagnóstico. Migas de pan con los mismos nombres |
| Verificado | Unitarias del menú y las migas; Chromium: los 12 destinos abren su vista, teclado, barra plegada, recarga y atrás/adelante |
| **Abierto** | La agrupación no ha sido revisada por el responsable de diseño. La barra inferior en móvil enlaza solo cuatro destinos: decisión de producto |

### T-320 — Sistema de diseño en administración · `PASS_WITH_OBSERVATIONS`

| | |
|---|---|
| Commits | `4e2cd01e`, `11388ac0`, `89e9fd49`, `d8e7e840` |
| Rutas | `apps/frontend/components/admin/admin-page.ts`, árbol `app/dashboard/admin/**` y `components/admin/**`, `docs/qa/sprint9/admin-design-inventory.md` |
| Implementado | Constantes compartidas de página, ancho, titular y entradilla; tamaños y radios literales sustituidos por los tokens del sistema en las 12 rutas |
| Verificado | Pruebas que recorren el árbol y fallan ante un literal con token equivalente; 84 combinaciones de ruta, ancho y tema en Chromium antes y después |
| **Abierto** | Excepciones enumeradas en el inventario, a decidir por diseño: botones de fila sin unificar con `Button`, un botón ámbar sin token y 20 radios `rounded-lg`/`rounded-md` sin token de igual valor |

### T-321 — Tres pantallas en la nueva estructura · `BLOCKED`

| | |
|---|---|
| Commits | `491ec285`, `6ed88097` (más `f4aede85` y `461efe9d` para el visor) |
| Rutas | `apps/frontend/components/admin/AdminLayout.tsx`, `app/dashboard/admin/page.tsx`, `e2e/admin-navigation-own-flows.spec.ts` |
| Implementado | **Dos de tres.** Métricas (HU-178): grupo «Métricas → Tendencias de uso», que lleva a la sección del panel. Eventos de seguridad (HU-180): en «Verificación y seguridad» |
| Verificado | Chromium: ambos destinos desde otra vista, estando en el panel y por URL directa; permisos 200/403/401 |
| **Bloqueado** | **Cuentas pendientes (HU-179).** Su pantalla no existe en esta rama: está en `develop` desde el PR #270. No se creó una pantalla sustituta ni un enlace a una ruta inexistente. Se desbloquea integrando `develop`; después es añadir un destino al menú, su fila en el inventario y su prueba |

### T-316 — Auditoría con Lighthouse y axe · `PASS`

| | |
|---|---|
| Commits | `4e8666a5`, `b839d889` |
| Rutas | `scripts/qa/sprint9-a11y-audit.mjs`, `docs/qa/sprint9/a11y-screen-inventory.md`, `docs/qa/sprint9/accesibilidad-auditoria.md` |
| Implementado | Arnés reproducible: cinco pantallas × dos temas × axe y Lighthouse, 20 mediciones, con recorrido de teclado |
| Verificado | Ejecutado contra el build de producción. Resultado de la medición: 30 nodos en 4 reglas graves o críticas, hallazgos A11Y-01 a A11Y-08 con selector, criterio y contraste medido |
| Nota | La tarea es medir. Lo que midió fueron fallos reales, que pasan a T-317 |

### T-317 — Correcciones hasta AA · `PASS_WITH_OBSERVATIONS`

| | |
|---|---|
| Commits | `567363e7`, `5439c8b0`, `6c29d682` |
| Rutas | `apps/frontend/app/global.css`, `app/dashboard/page.tsx`, `app/dashboard/perfil/editar/page.tsx`, `app/dashboard/admin/page.tsx`, `components/admin/dashboard/` |
| Implementado | Contraste (token `on-primary-muted`), 17 etiquetas asociadas a su campo, jerarquía de títulos, semántica de lista, nombres accesibles |
| Verificado | Reauditoría con el mismo arnés: de 30 nodos graves o críticos a **0** en las cinco pantallas y los dos temas; Lighthouse 100 en las 20 mediciones; teclado en Chromium |
| **Abierto** | **No se declara WCAG 2.1 AA.** Queda A11Y-08 (WCAG 2.5.3, nivel A) en el menú de cuenta y en el botón flotante del chat, componentes compartidos de otros responsables. Los pasos 2 a 5 de «Editar perfil» tienen las etiquetas corregidas pero no se midieron |

### T-318 — axe en la suite E2E de CI · `NOT_VERIFIED`

| | |
|---|---|
| Commits | `62fb1fb5`, `1ef128f0`, `1b00704f`, `2a959054` |
| Rutas | `apps/frontend/e2e/support/a11y.ts`, `e2e/accesibilidad.spec.ts`, `e2e/a11y-gate-contract.spec.ts`, `.github/workflows/ci.yml`, `docs/qa/sprint9/accesibilidad-ci.md` |
| Implementado | axe sobre las cinco pantallas en ambos temas dentro de Playwright; paso propio y bloqueante en el job `e2e`, con su reporte como artefacto |
| Verificado en local | Pasa con código 0; con una violación grave inyectada termina en 1; equivalente local del paso de CI en verde; contrato del workflow con casos negativos |
| **Sin verificar** | **Ninguna ejecución de GitHub Actions ha corrido este paso**, porque la rama no se ha publicado. Se verifica con un PR hacia `main` o una ejecución manual |
| Observación | El job `e2e` no corre en PR hacia `develop` (decisión previa del equipo): la comprobación protege `main` y el despliegue |

### T-293 — Carga diferida y bundle · `PASS`

| | |
|---|---|
| Commits | `6e7301ea`, `9184a17c`, `e0460f21`, `178ab745` |
| Rutas | `scripts/qa/sprint9-bundle-measure.mjs`, `docs/qa/sprint9/frontend-lazy-baseline.md`, `apps/frontend/app/dashboard/admin/page.tsx`, `components/landing/FeaturesGrid.tsx`, `components/dashboard/DashboardLayout.tsx` |
| Implementado | Tres módulos diferidos: gráficos del panel admin, fondo de partículas de la landing y guía de bienvenida |
| Verificado | Misma medición antes y después sobre el build de producción: `/dashboard/admin` −29,6 % y `/` −11,8 % de JS inicial (gzip), 55 rutas de `/dashboard` entre −18 y −19 KB. Objetivos fijados antes de optimizar, cumplidos. Chromium: los chunks llegan aparte, sin salto de contenido ni errores de hidratación |
| Límite | Es tamaño de JS, no tiempo de carga: no se midió LCP. Los gráficos de sprint, el Kanban y el calendario no se tocaron |

### T-313 — Respaldos de PostgreSQL · `BLOCKED`

| | |
|---|---|
| Commits | `a336ad0a`, `872a79bc`, `4af85bec`, `e0bdc078` |
| Rutas | `infra/db-backup/` |
| Implementado | Volcado con `pg_dump -Fc` en el host, atómico y verificado; rotación a 7 días solo tras un respaldo válido; vigilancia de antigüedad e integridad; plantilla de cron diario y guía de instalación y reversión |
| Verificado | Contrato con binarios simulados (83 comprobaciones) y PostgreSQL 17 real y desechable (24 comprobaciones): el respaldo queda fuera del contenedor y un volcado fallido no deja archivo ni borra los anteriores |
| **Bloqueado** | **El cron no está instalado en ningún servidor y no existe ningún respaldo de producción.** Hace falta acceso al servidor y autorización de quien lo administra. La tarea no está cumplida en operación hasta instalarlo y confirmar el respaldo del día siguiente |
| Fuera de alcance | Restaurar un respaldo (T-314). Copia fuera del servidor y cifrado no se pidieron y no se hicieron |

## Qué desbloquea cada pendiente

| Pendiente | Tarea | Quién decide o actúa |
|---|---|---|
| Integrar `develop` (PR #270) y enlazar «Cuentas pendientes» | T-321 | Propietario de la rama |
| Instalar el cron y confirmar el primer respaldo | T-313 | Quien administra el servidor |
| Publicar la rama y ver el paso de accesibilidad en GitHub Actions | T-318 | Propietario de la rama |
| Tipo de notificación de Chat en el backend | T-328 | Responsable del backend de notificaciones |
| Nombre accesible del menú de cuenta y del botón del chat | T-317 | Responsables de esos componentes |
| Revisión de la agrupación del menú y de las excepciones de diseño | T-319, T-320 | Responsable de diseño |

## Trabajo de otros que no se tocó

T-294 (k6), T-314 (restauración), T-322 (suite general de navegación), el
calendario de la HU-184, el backend de preferencias de la HU-185 y la pantalla
de la HU-179 se usaron como dependencias o se dejaron fuera. Ninguno se
modificó para completar una tarea propia.
