# T-368 · Contraste del estado «revisión» (hallazgo H-07)

**Estado: PENDIENTE DE CORRECCIÓN.** Este documento describe el defecto, pero **no lo corrige**: la corrección de color de T-368 se aplazó a una decisión de diseño en el gate final de correcciones del Sprint 10. No se ha cambiado ningún token ni ningún componente para alterar el contraste.

## Problema

En modo claro, el texto blanco sobre el verde salvia del estado «revisión» no alcanza el contraste mínimo que exige T-368 (WCAG 2.1 AA, criterio 1.4.3: 4.5:1 en texto normal).

| Par | Fondo | Texto | Contraste | Requisito | Resultado |
|---|---|---|---:|---:|---|
| Reposo, claro | `--color-review` `#9ab07e` | `--color-on-review` `#ffffff` | 2.36:1 | 4.5:1 | No cumple |
| Hover, claro | `--color-review-strong` `#879d6b` | `--color-on-review` `#ffffff` | 2.97:1 | 4.5:1 | No cumple |
| Reposo, oscuro | `--color-review` `#9ab07e` | `--color-on-review` `#000000` | 8.89:1 | 4.5:1 | Cumple |

Los tokens están en `apps/frontend/app/global.css`:
- `--color-review`, `--color-review-strong`, `--color-review-soft`, `--color-on-review` y `--color-review-ink` se definen en el bloque del tema base.
- `.dark` redefine `--color-on-review: #000000`.
- El comentario junto a los tokens ya lo registraba como una excepción «por decisión de diseño (2.4:1, bajo AA)».

## Dónde se usa el par `bg-review` / `text-on-review`

| Archivo | Uso |
|---|---|
| `app/dashboard/projects/admin/reviews/page.tsx` (`ACCION_REVISION`) | Botón «Revisar» de cada solicitud en la bandeja de publicación (administración) |
| `app/dashboard/projects/mine/[id]/my-project-view-client.tsx` | Banner «corrección requerida» (título y texto `text-on-review`) y botón «Enviar correcciones» |
| `components/projects/available-project-card.tsx` | Botón «Editar» de la tarjeta de un proyecto propio en estado OBSERVADO |
| `components/admin/ProjectReviewSheet.tsx` | Acción principal de la hoja de revisión |

Los acentos `review-soft` (bordes y fondos al 10 %) y el texto `review-ink` sobre superficies claras no se ven afectados: `review-ink` sobre blanco da 5.95:1, verificado en `test/review-sage-accents.spec.ts`.

## Consecuencias

- Las personas con baja visión o con pantallas de poco brillo pueden no leer la acción «Revisar» ni el banner que pide correcciones, que es justo el aviso que deben atender.
- El criterio de aceptación de T-368 («etiquetas, pills y estados cumplen 4.5:1») no se cumple. La tarea no puede declararse PASS.
- La puerta de axe ampliada en este gate (H-09) lo detecta y queda en rojo por este motivo.

## Evidencia reproducible

1. Cálculo directo con la fórmula de luminancia relativa de WCAG: `#ffffff` sobre `#9ab07e` da 2.36:1. Los valores de la tabla se recalcularon el 26-oct-2026.
2. Puerta de axe:
   ```bash
   scripts/e2e/isolated-stack.sh e2e e2e/accesibilidad.spec.ts -g solicitudes-publicacion
   ```
   El resultado en **claro** es `color-contrast [serious] wcag143` en los botones `.bg-review.text-on-review` de la bandeja de publicación. En **oscuro** pasa.

## Defecto relacionado del mismo dominio (H-11)

La misma puerta encontró en Mis proyectos un segundo problema de contraste de un estado. Es la pill animada «En solicitud de cierre» (`pill-forest blink-gold-gray`, en `components/projects/available-project-card.tsx` y `app/global.css`):
- Sus dos extremos cumplen: gris `tag-subtle`, 5.21:1, y verde `tag-forest`, 7.60:1.
- La animación infinita de 2.8 s interpola a la vez fondo y texto, y los fotogramas intermedios bajan hasta unos 1.2:1.
- Con `prefers-reduced-motion` queda fija en el extremo verde, que sí cumple.

Pertenece también a T-368 y queda igualmente pendiente. Como axe mide un instante cualquiera de la animación, su resultado en la puerta varía entre ejecuciones.
