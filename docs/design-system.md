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
| `type-micro` | Texto denso del calendario: horas dentro de un bloque, chips de «Todo el día», iniciales de avatar | 11 / 16.5 / hereda |

`type-meta` siempre usa texto secundario. Manrope se reserva para `display` y `section`; Inter cubre los demás niveles.

`type-micro` es la única clase de la familia que no fija color ni peso: se usa dentro de bloques que ya traen su color (`on-cal-N`). No es un nivel de lectura: no debe usarse para párrafos ni fuera de componentes densos. Sustituye a los literales `text-[11px]` y `text-[10px]`. Está declarada con `@utility` (gana a `pill` y `type-meta` cuando conviven). Debe usarse `type-micro` y no la utilidad `text-micro`: `cn()` (tailwind-merge) confunde un `text-*` propio con un color y lo elimina al combinarlo con otro color de texto.

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

### Insignias (HU-190)

Los anillos de las insignias usan `insignia-bronce`, `insignia-plata`, `insignia-oro` e `insignia-diamante` (claro y oscuro). Solo se aplican como borde del círculo (`border-insignia-oro`): el nombre del nivel siempre se escribe en texto y el color nunca es la única señal. Un contador `x2`, `x3` o `x4` marca Plata, Oro y Diamante; Bronce no lleva contador.

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
