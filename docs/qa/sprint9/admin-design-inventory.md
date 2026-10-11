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
| `/dashboard/admin/seguridad` | sí | 0 | 0 | 0 | 0 | `app/dashboard/admin/seguridad/page.tsx` |
| `/dashboard/admin/etiquetas` | sí | 0 | 0 | 0 | 6 | `app/dashboard/admin/etiquetas/page.tsx` |
| `/dashboard/admin/apelaciones` | sí | 1 | 0 | 0 | 0 | `app/dashboard/admin/apelaciones/appeals-inbox-client.tsx` |
| `/dashboard/admin/apelaciones/[apelacionId]` | sí | 1 | 0 | 0 | 0 | `app/dashboard/admin/apelaciones/[apelacionId]/appeal-review-client.tsx` |
| `/dashboard/admin/proyectos` | sí | 0 | 2 | 0 | 0 | `app/dashboard/admin/proyectos/admin-projects-client.tsx` |
| `/dashboard/admin/proyectos/[id]` | no | 12 | 7 | 0 | 0 | `app/dashboard/admin/proyectos/[id]/admin-project-detail-client.tsx` |
| `/dashboard/admin/proyectos/[id]/cierre` | sí | 4 | 5 | 0 | 0 | `app/dashboard/admin/proyectos/[id]/cierre/closure-review-client.tsx` |
| `/dashboard/admin/sprints` | sí | 0 | 1 | 0 | 0 | `app/dashboard/admin/sprints/admin-sprints-client.tsx` |
| `/dashboard/projects/admin/reviews` | sí | 0 | 1 | 0 | 0 | `app/dashboard/projects/admin/reviews/page.tsx` |

Total: 20 tamaños literales, 23 radios literales, 4 botones propios, 6 hex y 1 titular fuera de la escala, en 12 vistas.

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
colores salen de tokens con variante oscura, así que el tema no requiere reglas por vista. La comprobación en
navegador (375, 768 y 1440 px, claro y oscuro) se registra al cierre de T-320.
