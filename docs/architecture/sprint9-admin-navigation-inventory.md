# Sprint 9 · Inventario de navegación administrativa (T-319)

Fuente de verdad del menú: `apps/frontend/components/admin/AdminLayout.tsx` (`adminNavEntries`, `adminNavItemsMobile`).
Este inventario se comprueba contra el código en `apps/frontend/test/admin-shell-nav.spec.tsx`: si una ruta administrativa
aparece o desaparece sin actualizar las tablas de abajo, esa prueba falla.

## 1. Acceso

Toda ruta bajo `/dashboard/admin/*` y `/dashboard/projects/admin/*` se sirve dentro de `AdminLayout`
(`app/dashboard/layout.tsx`, `isAdminOnlyRoute`). `AdminLayout` exige el rol `administrador`: sin sesión redirige a
`/login`; con sesión y sin el rol, a `/dashboard`; mientras decide no pinta el contenido. El backend repite la
comprobación en cada endpoint administrativo. Ninguna ruta de este inventario es visible para un estudiante.

## 2. Rutas enlazadas desde el menú lateral

| Ruta | Etiqueta en el menú | Origen | Depende de |
|---|---|---|---|
| `/dashboard/admin` | Panel Admin | Panel administrativo; incluye «Tendencias de uso» de HU-178 (T-301) | HU-178 para las métricas |
| `/dashboard/admin/proyectos?grupo=activos` | Activos | Sprint 7 · VIEW-15 (F012) | — |
| `/dashboard/projects/admin/reviews` | Solicitudes de publicación | Sprint 7 · revisión de publicación | — |
| `/dashboard/admin/proyectos?grupo=cierres` | Solicitudes de cierre | Sprint 7 · VIEW-15 (F012) | — |
| `/dashboard/admin/proyectos?grupo=cerrados` | Cerrados | Sprint 7 · VIEW-15 (F012) | — |
| `/dashboard/admin/sprints` | Calendario de Sprints | Supervisión de Sprints | — |
| `/dashboard/admin/apelaciones` | Apelaciones | Sprint 7 · VIEW-18 (F015) | — |
| `/dashboard/admin/metricas` | Tendencias de uso | Sprint 9 · página propia de las métricas de HU-178 (T-301); hasta el cierre del Sprint era el ancla `/dashboard/admin#metricas` (T-321) | `GET /admin/metricas` (HU-178) |
| `/dashboard/admin/usuarios` | Gestión de Usuarios | Administración de cuentas | — |
| `/dashboard/admin/solicitudes-recuperacion` | Recuperación de contraseña | HU-14 | — |
| `/dashboard/admin/cuentas-pendientes` | Cuentas pendientes | HU-179 (PR #270); colocada en la estructura por T-321 | `GET /admin/cuentas-pendientes` |
| `/dashboard/admin/seguridad` | Eventos de seguridad | Sprint 9 · T-310 (Vernel) | `GET /admin/eventos-seguridad` |
| `/dashboard/admin/etiquetas` | Etiquetas (temporal) | Página de diagnóstico: catálogo de las 27 familias de etiquetas | — |

Las tres entradas de `/dashboard/admin/proyectos` son la misma página con un `?grupo=` distinto; el backend solo
conoce esos grupos y no existe uno «todos».

## 3. Estructura del menú lateral

El menú se agrupa por tema de trabajo. «Panel Admin» va suelto arriba y los grupos siguen este orden:

| Grupo | Destinos | Por qué van juntos |
|---|---|---|
| Usuarios | Gestión de Usuarios · Recuperación de contraseña | Todo lo que se hace sobre una cuenta: consultarla, cambiar su estado y devolverle el acceso. |
| Proyectos | Activos · Solicitudes de publicación · Solicitudes de cierre · Cerrados · Calendario de Sprints | El ciclo de vida de un proyecto, de la publicación al cierre, más la supervisión de sus Sprints. |
| Gobernanza | Apelaciones | Decisiones sobre el liderazgo de un proyecto, que resuelve la administración. |
| Métricas | Tendencias de uso | Las métricas de uso de la plataforma (HU-178), en su propia página. |
| Verificación y seguridad | Cuentas pendientes · Eventos de seguridad | Supervisión de accesos y cuentas: la bandeja de cuentas que esperan verificación (HU-179), con su contador, y el visor de eventos. |
| Diagnóstico | Etiquetas (temporal) | Herramientas internas que no son parte del trabajo diario. |

Antes de Sprint 9 existía un grupo genérico «Administración» que mezclaba cuentas, seguridad y la página temporal
de etiquetas; se repartió entre «Usuarios», «Verificación y seguridad» y «Diagnóstico». Ninguna ruta cambió: solo
el grupo en que aparece. El rótulo «Administración» que encabeza la barra lateral es el título del menú, no un grupo.

«Métricas» enlaza una página propia (`/dashboard/admin/metricas`): al entrar en ella, también por la URL o al
recargar, el grupo se abre solo y «Tendencias de uso» es el destino marcado como actual. Ningún destino del menú
es ya un ancla, y la barra lateral no desplaza el contenido a mano. El enlace anterior, `/dashboard/admin#metricas`,
sigue llevando al Panel Admin: el panel conserva el `id="metricas"` (ver la sección 5).

Con la barra plegada (72 px) cada destino queda como un icono con su nombre accesible; los grupos no se muestran.

## 4. Rutas administrativas que NO van en el menú

| Ruta | Por qué no se enlaza | Cómo se llega |
|---|---|---|
| `/dashboard/admin/proyectos/[id]` | Detalle de un proyecto (VIEW-16, F013) | Desde una fila de la bandeja de proyectos |
| `/dashboard/admin/proyectos/[id]/cierre` | Revisión de una solicitud de cierre (VIEW-14, F016) | Desde «Solicitudes de cierre» |
| `/dashboard/admin/apelaciones/[apelacionId]` | Revisión de una apelación | Desde la bandeja de apelaciones |

Son vistas de detalle: necesitan un identificador y no tienen sentido como destino fijo.

## 5. Pantallas que el backlog pide y hoy no existen como ruta

| Pantalla | Historia | Estado en el HEAD | Consecuencia |
|---|---|---|---|
| Métricas de uso | HU-178 | Tiene ruta propia desde el cierre de Sprint 9: `/dashboard/admin/metricas`, que monta `AdminMetricsSection` | Enlazada desde «Métricas → Tendencias de uso». Antes era el ancla `#metricas` del Panel Admin (T-321), que se conserva como compatibilidad. El endpoint y el servicio de HU-178 no cambiaron. |
| Cuentas pendientes de verificación | HU-179 | Existe desde el PR #270: `/dashboard/admin/cuentas-pendientes` | Enlazada desde «Verificación y seguridad → Cuentas pendientes» (T-321). |

## 6. Matriz de T-321: pantallas nuevas dentro de la estructura

| Pantalla | Historia y responsable | En la estructura | Estado | Evidencia |
|---|---|---|---|---|
| Métricas de uso | HU-178 (T-301), de otro responsable; se reutilizan su endpoint y su sección | Métricas → Tendencias de uso (`/dashboard/admin/metricas`) | Integrada | `admin-shell-nav.spec.tsx`, `admin-metricas-page.spec.tsx`, `e2e/admin-navigation-own-flows.spec.ts` |
| Eventos de seguridad | HU-180 · T-310 (Vernel) | Verificación y seguridad → Eventos de seguridad (`/dashboard/admin/seguridad`) | Integrada | Las mismas, más los E2E del visor |
| Cuentas pendientes | HU-179, de otro responsable (PR #270); se reutiliza su pantalla | Verificación y seguridad → Cuentas pendientes (`/dashboard/admin/cuentas-pendientes`) | Integrada | `admin-shell-nav.spec.tsx`, `admin-cuentas-pendientes.spec.tsx` |

Sobre HU-179: su pantalla (`apps/frontend/app/dashboard/admin/cuentas-pendientes/page.tsx`) llegó con el PR #270.
Al integrarla se añadió el destino «Cuentas pendientes» al grupo «Verificación y seguridad», con el contador de
cuentas por atender que ya traía (visible en el destino y, con el grupo plegado, en su encabezado), y su miga de pan
usa los mismos nombres que el menú. La pantalla no se rehízo.

## 7. Barra inferior móvil

En pantallas menores de `md` la barra lateral no se muestra y la navegación es `adminNavItemsMobile`: una lista
**curada** de cuatro destinos (Panel Admin, Proyectos, Apelaciones, Gestión de Usuarios) más el menú de la cuenta.
Aplanar todo el menú daría más de diez iconos y la saturaría. El resto de los destinos (Calendario de Sprints,
Recuperación de contraseña, Cuentas pendientes, Eventos de seguridad, Etiquetas) no tienen acceso directo en móvil: se alcanzan por su
URL o desde los enlaces del panel. Ampliar la navegación móvil es una decisión de producto que este inventario deja
registrada, no resuelta.

## 8. Página temporal de etiquetas

`/dashboard/admin/etiquetas` no es parte del producto: es el catálogo de diagnóstico de las 27 familias de etiquetas.
Sigue enlazada porque no hay una decisión documentada de retirarla del menú. Cuando se retire, se quitan juntas la
página y su entrada.
