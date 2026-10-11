# Sprint 9 · Auditoría de accesibilidad: línea base y hallazgos (T-316)

Método, pantallas y límites: `docs/qa/sprint9/a11y-screen-inventory.md`.
Herramienta: `scripts/qa/sprint9-a11y-audit.mjs`.

| Dato | Valor |
|---|---|
| Fecha de la medición | 2026-10-11 |
| Commit medido | `6ed8809749a27b57e1f8d7899af1090bbea976ac` |
| Aplicación | Build de producción sobre la pila E2E aislada, datos sintéticos |
| Herramientas | axe-core 4.10.3 · Lighthouse 12.6.1 · Chromium de Playwright |
| Ventana | 1440 × 900 |
| Mediciones | 5 pantallas × 2 temas × 2 herramientas = 20 |

Esta es la **línea base antes de corregir nada**. No declara cumplimiento de WCAG AA: registra lo que fallaba.

## 1. Resumen de las 20 mediciones

| Pantalla | Tema | Lighthouse (accesibilidad) | axe: críticas | axe: graves | axe: nodos | Reglas de axe |
|---|---|---:|---:|---:|---:|---|
| Dashboard del estudiante | claro | 96 | 0 | 1 | 4 | `color-contrast` |
| Dashboard del estudiante | oscuro | 96 | 0 | 1 | 4 | `color-contrast` |
| Dashboard de administración | claro | 92 | 0 | 2 | 4 | `color-contrast`, `list` |
| Dashboard de administración | oscuro | 92 | 0 | 2 | 4 | `color-contrast`, `list` |
| Proyectos (administración) | claro | 100 | 0 | 0 | 0 | — |
| Proyectos (administración) | oscuro | 100 | 0 | 0 | 0 | — |
| Calendario | claro | 100 | 0 | 0 | 0 | — |
| Calendario | oscuro | 100 | 0 | 0 | 0 | — |
| Editar perfil (paso 1) | claro | 91 | 2 | 0 | 7 | `label`, `select-name` |
| Editar perfil (paso 1) | oscuro | 91 | 2 | 0 | 7 | `label`, `select-name` |

Ninguna violación de impacto moderado o menor. Total: 4 reglas de axe distintas, 30 nodos entre las 10 combinaciones.
Dos pantallas (Proyectos y Calendario) no tienen ninguna violación automática; eso no prueba que cumplan AA.

## 2. Hallazgos

Prioridad: **P1** crítico o grave según axe; **P2** detectado solo por Lighthouse.

### A11Y-01 · Contraste insuficiente en las tarjetas de resumen del estudiante — P1

| | |
|---|---|
| Ruta y tema | `/dashboard`, claro y oscuro |
| Regla | axe `color-contrast` (grave) · WCAG 1.4.3 Contraste mínimo (AA) |
| Elementos | 4 por tema: los rótulos «Proyectos Activos», «En curso actual» y los rótulos de `#stats-horas-abiertas` y `#stats-horas-acreditadas` |
| Selectores | `#stats-horas-abiertas … .text-on-primary\/70`, `#stats-horas-acreditadas … .text-on-primary\/70`, `.mt-stack.text-on-primary\/70.type-meta > span` |
| Medido (claro) | **3.62:1** — `#bad6c8` sobre `#1a7649`, 13 px, peso normal |
| Medido (oscuro) | **3.54:1** — `#1f6539` sobre `#67cc87`, 13 px, peso normal |
| Requerido | 4.5:1 (texto normal) |
| Origen | `text-on-primary/70` en `app/dashboard/page.tsx`: el 70 % de opacidad sobre el fondo `primary` baja el contraste del texto pequeño |
| Reproducir | Iniciar sesión como estudiante y abrir `/dashboard` |
| Evidencia | `dashboard-estudiante-{claro,oscuro}.axe.json` |

### A11Y-02 · Contraste insuficiente en los días de otro mes del mini calendario de Sprints — P1

| | |
|---|---|
| Ruta y tema | `/dashboard/admin`, claro y oscuro |
| Regla | axe `color-contrast` (grave) · WCAG 1.4.3 |
| Elementos | 3 por tema: los días del mes vecino, que son **enlaces** (`a[data-adjacent-month="true"]`) |
| Medido (claro) | **2.35:1** — `#a7a9aa` sobre `#ffffff`, 12 px |
| Medido (oscuro) | **3.22:1** — `#5f6267` sobre `#080b0e`, 12 px |
| Requerido | 4.5:1: son enlaces activos con nombre accesible, no controles deshabilitados |
| Origen | `text-text-disabled` en `components/admin/dashboard/sprint-planning-widget.tsx` |
| Reproducir | Iniciar sesión como administrador y abrir `/dashboard/admin`; widget «Planificación de Sprints» |
| Evidencia | `dashboard-admin-{claro,oscuro}.axe.json` |

### A11Y-03 · Lista con hijos que no son elementos de lista — P1

| | |
|---|---|
| Ruta y tema | `/dashboard/admin`, claro y oscuro |
| Regla | axe `list` (grave) · WCAG 1.3.1 Información y relaciones (A) |
| Elemento | 1: `section[aria-labelledby] > ul.card-base` |
| Detalle | El `<ul>` contiene `<li>` con un `role` que les quita la semántica de elemento de lista (ver A11Y-07): el lector de pantalla no anuncia la lista ni cuántos elementos tiene |
| Evidencia | `dashboard-admin-{claro,oscuro}.axe.json` |

### A11Y-04 · Campos de formulario sin etiqueta asociada — P1

| | |
|---|---|
| Ruta y tema | `/dashboard/perfil/editar` (paso 1), claro y oscuro |
| Regla | axe `label` (**crítica**) · WCAG 4.1.2 Nombre, función, valor (A); también 1.3.1 y 3.3.2 |
| Elementos | 6 `<input>`: nombre, apellido y cuatro campos numéricos |
| Selectores | `input[value="Carlos"]`, `input[value="Mendoza"]`, `input[min="1"]`, `input[max="168"]`, `div:nth-child(2) > input[type="number"]`, `div:nth-child(3) > input[type="number"]` |
| Detalle | Cada campo tiene un texto visible encima, pero no está asociado (`<label for>` / `id`): un lector de pantalla anuncia «cuadro de edición» sin decir qué se pide |
| Teclado | El recorrido con Tab confirma 12 paradas sin nombre accesible en esta pantalla |
| Evidencia | `perfil-editar-{claro,oscuro}.axe.json`, `.teclado.json` |

### A11Y-05 · Lista desplegable sin nombre accesible — P1

| | |
|---|---|
| Ruta y tema | `/dashboard/perfil/editar` (paso 1), claro y oscuro |
| Regla | axe `select-name` (**crítica**) · WCAG 4.1.2 |
| Elemento | 1 `<select>` |
| Detalle | Mismo origen que A11Y-04: su rótulo visible no está asociado |
| Evidencia | `perfil-editar-{claro,oscuro}.axe.json` |

### A11Y-06 · Salto en la jerarquía de encabezados — P2

| | |
|---|---|
| Ruta y tema | `/dashboard/perfil/editar` (paso 1), claro y oscuro |
| Regla | Lighthouse `heading-order` · WCAG 1.3.1 |
| Elemento | `h3.text-xl`, que sigue a un `h1` sin un `h2` intermedio |

### A11Y-07 · `role` no permitido en elementos de lista — P2

| | |
|---|---|
| Ruta y tema | `/dashboard/admin`, claro y oscuro |
| Regla | Lighthouse `aria-allowed-role` · WCAG 4.1.2 |
| Elementos | 2 `li.flex` dentro de `ul.card-base`. Es la causa de A11Y-03 |

### A11Y-08 · El nombre accesible no contiene el texto visible — P2

| | |
|---|---|
| Rutas | Las cinco, en ambos temas (2 elementos en estudiante, calendario y perfil; 1 propio del panel de administración) |
| Regla | Lighthouse `label-content-name-mismatch` · WCAG 2.5.3 Etiqueta en el nombre (A) |
| Elementos compartidos | El botón del menú de cuenta de la cabecera (`#dashboard-account-menu > button`) y un botón flotante (`div.fixed … > button.flex`) |
| Elemento propio del panel admin | Un enlace de la cola de atención (`ul.divide-y > li … > a.type-body`) |
| Detalle | El `aria-label` sustituye al texto que se ve en vez de incluirlo: quien usa control por voz dice lo que ve y el control no responde |

## 3. Teclado (observación automática)

| Pantalla | Paradas de Tab | Sin indicador de foco | Sin nombre accesible | ¿Foco atrapado? |
|---|---:|---:|---:|---|
| Dashboard del estudiante | 36 | 0 | 0 | No |
| Dashboard de administración | 40 | 0 | 0 | No |
| Proyectos (administración) | 40 | 0 | 0 | No |
| Calendario | 40 | 0 | 0 | No |
| Editar perfil (paso 1) | 36 | 0 | 12 | No |

Iguales en claro y en oscuro. Todas las paradas observadas muestran un indicador de foco y ninguna pantalla atrapa
el foco. Las 12 paradas sin nombre de «Editar perfil» son los campos de A11Y-04 y A11Y-05 más otros campos del
formulario cuyo nombre no viene de un `aria-label` (límite del método, ver el inventario).

## 4. Prioridad para la corrección (T-317)

| Orden | Hallazgo | Por qué |
|---|---|---|
| 1 | A11Y-04, A11Y-05 | Críticos: un formulario que no se puede usar con lector de pantalla |
| 2 | A11Y-01, A11Y-02 | Graves: texto que no alcanza el contraste AA, en ambos temas |
| 3 | A11Y-03 y A11Y-07 | Grave, una sola causa: restituir la semántica de la lista |
| 4 | A11Y-08 | Nivel A; afecta a controles de la cabecera presentes en todas las pantallas |
| 5 | A11Y-06 | Jerarquía de encabezados |

## 5. Fuera del alcance de esta medición

- Los pasos 2 a 5 de «Editar perfil», los diálogos, menús y estados de error de las cinco pantallas.
- Anchos distintos de 1440 px.
- Criterios que ninguna herramienta automática comprueba (orden de lectura, significado de los textos alternativos,
  uso real con lector de pantalla).
- El resto de pantallas de la aplicación.

Los componentes señalados en A11Y-08 (menú de cuenta y botón flotante) son compartidos por toda la aplicación:
corregirlos beneficia a todas las pantallas, pero su cambio debe comprobarse en las demás.
