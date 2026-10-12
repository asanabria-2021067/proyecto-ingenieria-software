# Sprint 9 · Inventario de diseño de las vistas administrativas (T-320)

Referencia: `docs/design-system.md` (HU-163) y los tokens de `apps/frontend/app/global.css`.
Las cifras de este documento no se cuentan a mano: las calcula `apps/frontend/test/helpers/admin-design.ts` sobre el
código fuente y `apps/frontend/test/admin-design-tokens.spec.ts` falla si dejan de coincidir.

## 1. Token de verdad por familia

| Familia | Token o componente | Dónde vive |
|---|---|---|
| Titular de página | `type-display` (32/40/700) | `global.css` |
| Encabezado de sección | `type-section` (20/28/600) | `global.css` |
| Título de tarjeta o fila | `type-subtitle` (16/24/500) | `global.css` |
| Texto | `type-body` (15/24/400) | `global.css` |
| Fechas, contadores, ayudas | `type-meta` (13/18/400) | `global.css` |
| Texto denso | `type-micro` (11/16.5) | `global.css` |
| Radio de tarjeta | `rounded-card` = 1rem | `--radius-card` |
| Radio de control | `rounded-control` = 0.75rem | `--radius-control` |
| Radio de etiqueta | `rounded-tag` = 0.4375rem | `--radius-tag` |
| Espaciado | `micro`, `tight`, `inline`, `stack`, `card`, `section`, `page` (4–48 px) | `--spacing-*` |
| Tarjeta | `card-base` | `global.css` |
| Etiquetas y estados | `Tag` / `.pill` (27 familias) | `components/ui/tag.tsx` |
| Tabla | `DATA_TABLE_*` y `DataTablePager` | `components/dashboard/data-table.tsx` |
| Botón | `Button` | `components/ui/button.tsx` |
| Miga de pan | `AdminBreadcrumb` | `components/admin/admin-breadcrumb.tsx` |
| Estados vacío y de error | `Empty` | `components/ui/empty.tsx` |

`rounded-xl` (0.75rem) y `rounded-2xl` (1rem) valen exactamente lo mismo que `rounded-control` y `rounded-card`:
cambiarlos por el token no mueve un píxel; solo deja de ser un literal.

## 2. Línea base (HEAD `7091a310`, antes de cualquier cambio de estilo)

Cada número es un incumplimiento contado de la regla «cualquier tamaño, radio o color literal en una pantalla es
motivo de comentario» de `docs/design-system.md`.

| Ruta | Titular `type-display` | Tamaños literales | Radios literales | `<button>` propios | Hex | Archivo |
|---|---|---:|---:|---:|---:|---|
| `/dashboard/admin` | sí | 0 | 0 | 0 | 0 | `app/dashboard/admin/page.tsx` |
| `/dashboard/admin/usuarios` | sí | 1 | 4 | 2 | 0 | `app/dashboard/admin/usuarios/page.tsx` |
| `/dashboard/admin/solicitudes-recuperacion` | sí | 1 | 3 | 2 | 0 | `app/dashboard/admin/solicitudes-recuperacion/page.tsx` |
| `/dashboard/admin/cuentas-pendientes` | no | 1 | 5 | 3 | 0 | `app/dashboard/admin/cuentas-pendientes/page.tsx` |
| `/dashboard/admin/seguridad` | sí | 0 | 0 | 0 | 0 | `app/dashboard/admin/seguridad/page.tsx` |
| `/dashboard/admin/etiquetas` | sí | 0 | 0 | 0 | 6 | `app/dashboard/admin/etiquetas/page.tsx` |
| `/dashboard/admin/apelaciones` | sí | 1 | 0 | 0 | 0 | `app/dashboard/admin/apelaciones/appeals-inbox-client.tsx` |
| `/dashboard/admin/apelaciones/[apelacionId]` | sí | 1 | 0 | 0 | 0 | `app/dashboard/admin/apelaciones/[apelacionId]/appeal-review-client.tsx` |
| `/dashboard/admin/proyectos` | sí | 0 | 2 | 0 | 0 | `app/dashboard/admin/proyectos/admin-projects-client.tsx` |
| `/dashboard/admin/proyectos/[id]` | no | 12 | 7 | 0 | 0 | `app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx` |
| `/dashboard/admin/proyectos/[id]/cierre` | sí | 4 | 5 | 0 | 0 | `app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx` |
| `/dashboard/admin/sprints` | sí | 0 | 1 | 0 | 0 | `app/dashboard/admin/sprints/admin-sprints-client.tsx` |
| `/dashboard/projects/admin/reviews` | sí | 0 | 1 | 0 | 0 | `app/dashboard/projects/admin/reviews/page.tsx` |

Total: 21 tamaños literales, 28 radios literales, 7 botones propios, 6 hex y 2 titulares fuera de la escala, en 13 vistas.

`/dashboard/admin/cuentas-pendientes` (HU-179, de otro responsable) no existía en `7091a310`: llegó con el PR #270,
después de T-320. Su fila es la medición de la vista tal como llegó; sin ella el total era 20, 23, 4, 6 y 1 en 12 vistas.

## 3. Lo que ya es uniforme

- 11 de las 12 vistas usan el mismo ancho máximo (1400 px) y el mismo relleno de página, pero como un literal
  repetido en cada archivo, no como una primitiva compartida. La revisión de una apelación usa a propósito 1100 px:
  es una vista de lectura.
- 11 de 12 titulares usan `type-display`.
- Todas las vistas llevan miga de pan y las bandejas comparten `DATA_TABLE_*`.
- Ninguna vista escribe colores hexadecimales, salvo el catálogo temporal de etiquetas (ver excepciones).

## 4. Diferencias encontradas

| # | Diferencia | Dónde | Token de verdad |
|---|---|---|---|
| D1 | El relleno y ancho de página se repite como literal en cada archivo (y como dos constantes locales distintas) | Todas las vistas | Una primitiva compartida |
| D2 | El titular no usa la escala (`font-headline text-2xl font-black … md:text-[28px]`) | `/dashboard/admin/proyectos/[id]` | `type-display` |
| D3 | Radios literales `rounded-xl` / `rounded-2xl` | usuarios, recuperación, proyectos, detalle, cierre, revisiones | `rounded-control` / `rounded-card` |
| D4 | Tamaños literales `text-[10px]`, `text-[11px]`, `text-[13px]` | usuarios, recuperación, apelaciones, detalle, cierre | `type-micro` / `type-meta` |
| D5 | Botones nativos con clases propias | usuarios («Limpiar filtros» y paginación), recuperación («Generar enlace», «Copiar») | `Button` |
| D6 | El párrafo de entrada alterna `mt-2` y `mt-tight`, `max-w-2xl` y `max-w-3xl` | Varias | Una sola clase compartida |
| D7 | «Eventos de seguridad» lleva su propio botón «Actualizar», que duplica el global de la barra superior | `/dashboard/admin/seguridad` | El botón global de `AdminLayout` |

## 5. Excepciones (no se corrigen en T-320)

| Qué | Por qué |
|---|---|
| Los 6 hex de `/dashboard/admin/etiquetas` | Es el catálogo de diagnóstico: muestra como texto los valores de las 27 familias. No pinta con ellos. |
| `components/admin/AdminMetricsSection.tsx` | Pertenece a HU-178 (otro responsable). Se reutiliza tal cual; sus literales quedan anotados, no modificados. |
| `rounded-lg` y `rounded-md` (0.5rem y 0.375rem) | No tienen un token de igual valor; cambiarlos altera el aspecto. Quedan contados y a la espera de una decisión de diseño. |

## 6. Estados y temas

Los estados de carga, vacío y error de las bandejas usan `Skeleton` y `Empty`; las tablas, `DATA_TABLE_*`. Todos los
colores salen de tokens con variante oscura, así que el tema no requiere reglas por vista.

## 7. Estado tras T-320

Medido sobre el mismo código con la misma herramienta.

| Ruta | Titular `type-display` | Tamaños literales | Radios literales | `<button>` propios | Hex |
|---|---|---:|---:|---:|---:|
| `/dashboard/admin` | sí | 0 | 0 | 0 | 0 |
| `/dashboard/admin/usuarios` | sí | 0 | 0 | 2 | 0 |
| `/dashboard/admin/solicitudes-recuperacion` | sí | 0 | 2 | 2 | 0 |
| `/dashboard/admin/cuentas-pendientes` | sí | 0 | 1 | 3 | 0 |
| `/dashboard/admin/seguridad` | sí | 0 | 0 | 0 | 0 |
| `/dashboard/admin/etiquetas` | sí | 0 | 0 | 0 | 6 |
| `/dashboard/admin/apelaciones` | sí | 0 | 0 | 0 | 0 |
| `/dashboard/admin/apelaciones/[apelacionId]` | sí | 0 | 0 | 0 | 0 |
| `/dashboard/admin/proyectos` | sí | 0 | 1 | 0 | 0 |
| `/dashboard/admin/proyectos/[id]` | sí | 0 | 2 | 0 | 0 |
| `/dashboard/admin/proyectos/[id]/cierre` | sí | 1 | 5 | 0 | 0 |
| `/dashboard/admin/sprints` | sí | 0 | 1 | 0 | 0 |
| `/dashboard/projects/admin/reviews` | sí | 0 | 0 | 0 | 0 |

Árbol administrativo completo (las 13 vistas más sus componentes: 40 archivos, sin `AdminMetricsSection`; incluye la
vista de cuentas pendientes del PR #270 y `metric-trend-plot.tsx`, que T-293 separó de `AdminMetricsSection`):

| Medida | Antes | Después |
|---|---:|---:|
| Tamaños literales | 47 | 2 |
| Radios literales | 68 | 21 |
| Titulares fuera de la escala | 2 | 0 |
| Archivos sin ningún literal de tamaño o radio | — | 28 de 40 |

Qué se hizo con cada diferencia de la sección 4:

| # | Resultado |
|---|---|
| D1 | Corregido. Primitivas `ADMIN_PAGE*` en `components/admin/admin-page.ts`, adoptadas por las 13 vistas. Mismas clases: sin cambio de aspecto, salvo en cuentas pendientes, que no tenía ancho máximo y ahora se limita a 1400 px como las demás. |
| D2 | Corregido. El detalle de proyecto usa `type-display`: su titular pasa de 24–28 px / 900 a 32 px / 700, como el resto. Lo mismo en cuentas pendientes (HU-179), cuyo titular pasa de 36–48 px / 900 a 32 px / 700 al integrarla. |
| D3 | Corregido donde hay token de igual valor: `rounded-xl` → `rounded-control`, `rounded-2xl` → `rounded-card`. Sin cambio de aspecto. |
| D4 | Corregido. `text-[10px]` y `text-[11px]` → `type-micro` (11 px); las migas de detalle pasan de 13 a 14 px, como `AdminBreadcrumb`. |
| D5 | Pendiente. Los botones de fila («Ver perfil», «Generar enlace», «Copiar», «Limpiar filtros») tienen un estilo compacto propio y deliberado; unificarlos con `Button` cambia su aspecto y requiere decisión de diseño. |
| D6 | Corregido con `ADMIN_PAGE_LEAD` (`mt-2` y `mt-tight` valen lo mismo). El catálogo de etiquetas conserva su ancho mayor. |
| D7 | Corregido. Se retiró el «Actualizar» propio de «Eventos de seguridad»; el de la barra superior vuelve a pedir su consulta. |

## 8. Excepciones que quedan, archivo por archivo

`apps/frontend/test/admin-design-regression.spec.tsx` fija esta lista: un literal nuevo, o uno que desaparezca sin
actualizarla, hace fallar la prueba.

| Archivo | Literales | Motivo |
|---|---|---|
| `app/dashboard/admin/cuentas-pendientes/page.tsx` | `rounded-lg` | Sin token de igual valor (esqueleto de carga de los botones de fila) |
| `app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx` | `rounded-lg`, `rounded-md` | Sin token de igual valor |
| `app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx` | 4 × `rounded-lg`, `rounded-md`, `text-[13px]` | Sin token de igual valor; el texto de 13 px es el de los botones de acción en móvil, donde 14 px no cabe |
| `app/dashboard/admin/proyectos/admin-projects-client.tsx` | `rounded-lg` | Sin token de igual valor |
| `app/dashboard/admin/solicitudes-recuperacion/page.tsx` | 2 × `rounded-lg` | Sin token de igual valor |
| `app/dashboard/admin/sprints/admin-sprints-client.tsx` | `rounded-md` | Sin token de igual valor |
| `components/admin/AdminLayout.tsx` | `rounded-lg` | Tarjeta del logotipo |
| `components/admin/ProjectFeedbackSheet.tsx` | 3 × `rounded-lg` | Sin token de igual valor |
| `components/admin/ProjectReviewSheet.tsx` | 3 × `rounded-lg` | Sin token de igual valor |
| `components/admin/RevisionHistoryPanel.tsx` | `rounded-lg` | Sin token de igual valor |
| `components/admin/UserDetailSheet.tsx` | `rounded-md` | Sin token de igual valor |
| `components/admin/sprints/sprint-month-view.tsx` | `text-[15px]` | Texto denso del calendario de Sprints |

Otras excepciones:

- `components/admin/AdminMetricsSection.tsx` (HU-178, otro responsable): no se modificó.
- `bg-amber-600` / `bg-amber-700` en `components/admin/ConfirmActionDialog.tsx` y `components/admin/request-inbox.tsx`:
  es el botón ámbar de «Revisar». No existe un token de «acción de advertencia» y su tono es una decisión de diseño
  abierta; no se cambió.
- Los 6 hex del catálogo temporal de etiquetas (sección 5).

## 9. Comprobación en navegador

Las 12 rutas (14 URL, con los tres grupos de proyectos) se abrieron en Chromium en 375, 768 y 1440 px, en claro y en
oscuro, antes y después de los cambios: 84 combinaciones cada vez, con captura y medición.

- Desborde horizontal de página: 0 antes y 0 después.
- Etiquetas recortadas: 0 antes y 0 después.
- Titulares: antes 11 vistas a 32 px / 700 y el detalle de proyecto a 24–28 px / 900; después, todas a 32 px / 700.
- Únicas diferencias medidas entre ambas corridas: las 12 del titular del detalle de proyecto.
- En 375 y 768 px, las pestañas de «Apelaciones» y del detalle de proyecto se desplazan en horizontal dentro de su
  propia barra. Es su diseño (`ADMIN_TAB_LIST`) y no cambió.

Las capturas se guardan fuera del repositorio.

La vista de cuentas pendientes (HU-179) se integró después de esta comprobación y no formó parte de ella: sus
cifras de las secciones 2 y 7 están medidas sobre el código, no en navegador.
