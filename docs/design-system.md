# Sistema de diseño UVGenius

Los tokens viven en `apps/frontend/app/global.css` y reutilizan la paleta Material Design 3 existente. El dashboard post-login es la pantalla de referencia.

## Tipografía

| Clase | Uso | Tamaño / interlineado / peso |
| --- | --- | --- |
| `type-display` | Titular único de página | 32 / 40 / 700 |
| `type-section` | Encabezado de sección | 20 / 28 / 600 |
| `type-subtitle` | Título de tarjeta o fila | 16 / 24 / 500 |
| `type-body` | Texto y descripciones | 15 / 24 / 400 |
| `type-meta` | Fechas, autores, contadores e identificadores | 13 / 18 / 400 |

`type-meta` siempre usa texto secundario. Manrope se reserva para `display` y `section`; Inter cubre los demás niveles.

## Color

| Rol | Token | Uso |
| --- | --- | --- |
| Acento | `accent` / `on-accent` | Relleno de pastilla, progreso o punto de estado |
| Acción | `action` / `on-action` | Acción principal casi negra |
| Texto | `text-primary`, `text-secondary`, `text-disabled` | Jerarquía completa de texto |
| Superficie | `page`, `card` | Fondo de página y tarjeta |
| Estado | `status-success`, `status-warning`, `status-error` | Pastillas con texto explícito |

El acento nunca se usa como color de letra ni como línea fina. Solo puede destacar una cosa por bloque y siempre lleva `on-accent` encima. Los estados nunca dependen únicamente del color.

Correcto: `pill pill-accent`, `bg-action text-on-action`, `pill pill-error`.

Incorrecto: `text-accent`, `border-accent`, `bg-green-500`, `text-[#b7f568]`.

### Paleta del calendario (HU-184)

Solo el calendario usa `cal-1` a `cal-6` (morado, verde, azul, amarillo, rosa y turquesa) para distinguir tipos de evento, proyectos y calendarios compartidos. Cada tono trae tres tokens, en claro y oscuro: `cal-N` (fondo suave), `on-cal-N` (texto sobre ese fondo) y `cal-N-strong` (borde o punto). El mapeo vive en `lib/calendar/paleta.ts`; ninguna otra pantalla debe usar estos tokens.

Correcto: `bg-cal-3 text-on-cal-3 border-l-cal-3-strong`, `bg-cal-1-strong` para un punto.

Incorrecto: `text-cal-3-strong` como color de letra, `bg-cal-2` fuera del calendario.

## Espaciado y superficies

La escala permitida es 4, 8, 12, 16, 24, 32 y 48 px: `micro`, `tight`, `inline`, `stack`/`gap`, `card`/`grid`, `section`, `page`.

- `stack`: elementos de un mismo bloque.
- `gap`: tarjetas relacionadas.
- `card`: relleno interno de tarjeta.
- `grid`: separación entre columnas.
- `section`: bloques de una página.
- `page`: separación mayor de página.

Las tarjetas usan `rounded-card` y `shadow-card`; controles, `rounded-control`; overlays elevados, `shadow-raised`.

## Rejilla

`layout-grid` crea una columna en menos de 1024 px. Desde 1024 px, `layout-main` ocupa 8 de 12 columnas y `layout-aside`, 4. La lateral siempre baja completa: nunca se corta ni se oculta. El contenido se limita a 1280 px.

## Revisión de PR

Cualquier color, tamaño tipográfico, radio o sombra literal nuevo en una pantalla es motivo de comentario. Debe usarse el token o componente compartido correspondiente y comprobarse en claro, oscuro, móvil y portátil.
