# T-368 · Seguimiento de la corrección pendiente

| Campo | Valor |
|---|---|
| Tarea | T-368 (HU-197): etiquetas, pills y estados con contraste ≥ 4.5:1 |
| Hallazgos | H-07 (estado «revisión», 2.36:1) y H-15 (pill animada «En solicitud de cierre», fotogramas intermedios de hasta unos 1.2:1) |
| Estado | **PENDIENTE DE CORRECCIÓN** |
| Prioridad | Alta: incumple el criterio obligatorio de T-368 y deja en rojo la puerta de axe ampliada (H-09) |
| Detalle técnico | [t368-contraste-estado-revision.md](t368-contraste-estado-revision.md) |

## Por qué está pendiente

En el gate final de correcciones del Sprint 10 se aplazó expresamente la corrección de los colores de T-368 a una decisión de diseño. En ese gate no se modificó ningún token ni ningún componente para alterar el contraste: solo se documentó el problema y se amplió la cobertura de axe que lo detecta.

## Alternativa recomendada

- **H-07:** Alternativa A. `--color-on-review` pasa a `#1f2d18` en el tema base (6.14:1 en reposo, 4.88:1 en hover), con el fondo salvia `#9ab07e` intacto. Hay que decidir a la vez el texto del botón inverso «Editar y corregir» del banner (`bg-on-review` con `text-review-ink`), que quedaría oscuro sobre oscuro.
- **H-15:** que la animación de «En solicitud de cierre» no interpole a la vez fondo y texto por tonos de bajo contraste. Opciones:
  - animar solo la opacidad de un anillo o un indicador junto a la pill, que conserva su color fijo (verde `tag-forest`, 7.60:1);
  - o cambiar entre los dos extremos sin transición intermedia (`steps`).
  La forma exacta es una decisión de diseño.

## Validación visual necesaria

- Banner «corrección requerida», botón «Editar y corregir», «Enviar correcciones», botón «Revisar» de la bandeja de publicación, acción de la hoja de revisión y botón «Editar» de la tarjeta OBSERVADO.
- La pill «En solicitud de cierre» en Mis proyectos, con y sin `prefers-reduced-motion`.
- Modo claro y oscuro, a 1440, 768 y 390 px.
- Aprobación de diseño del nuevo tono antes de fusionar.

## Criterios de aceptación

1. `--color-review` / `--color-on-review` y su hover alcanzan ≥ 4.5:1 en claro y en oscuro.
2. Ningún fotograma de la pill animada baja de 4.5:1 entre su texto y su fondo, también sin movimiento reducido.
3. `--color-review-ink` sigue ≥ 4.5:1 sobre superficies claras.
4. No cambia el contraste de ningún otro par `tag-*` / `on-tag-*`.

## Pruebas necesarias

- `apps/frontend/test/review-sage-accents.spec.ts`: actualizar la aserción que hoy fija `--color-on-review: #ffffff` en el tema base y añadir el umbral de 4.5:1 para el par `review` / `on-review`.
- Puerta de axe en claro y en oscuro, sin reglas desactivadas:
  ```bash
  scripts/e2e/isolated-stack.sh e2e e2e/accesibilidad.spec.ts
  ```
  Deben pasar `solicitudes-publicacion` y `mis-proyectos`.
- Repetir `mis-proyectos` varias veces seguidas (`--repeat-each`): mientras exista H-15, su resultado depende del fotograma que mide axe.
- Vitest completo del frontend (las pruebas de diseño leen los tokens).

## Condición para declararla PASS

T-368 solo podrá pasar a PASS cuando se cumplan todas estas condiciones:
- Los cuatro criterios de aceptación cumplidos.
- Las pruebas anteriores en verde, con evidencia de la ejecución.
- La validación visual aprobada.

Mientras tanto, su estado es **PENDIENTE DE CORRECCIÓN** y no cuenta al 100 % en el cumplimiento del Sprint 10.
