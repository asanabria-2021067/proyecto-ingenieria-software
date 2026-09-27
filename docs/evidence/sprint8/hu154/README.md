# HU-154 — Evidencia antes/después de la vista de proyecto (T-217)

Capturas reales de la vista de detalle de proyecto antes y después del
rediseño de HU-154 (T-214 tipografía y tokens, T-215 navegación contextual,
T-216 rejilla de 12 columnas). Los mockups de diseño **no** son evidencia y no
se guardan aquí.

- `before/`: estado previo a HU-154. Capturas congeladas; no se editan, recortan
  ni regeneran.
- `after/`: estado final de HU-154, capturado en el commit `c5af090f` con la
  misma ruta, actor y tema que su par `before/` (el viewport se detalla abajo).

## Índice `before/`

| ID | Commit | Ruta | Actor | Viewport | Tema | Archivo | Nota |
|---|---|---|---|---|---|---|---|
| B-01 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/32` | Líder | 1920×1009 | Claro | `before/BEFORE_HU154_LIDER_DESKTOP_LIGHT.png` | 13 entradas planas en la sidebar del proyecto; acciones (Editar Información, Revisiones Pasadas, Editar Roles) mezcladas con destinos; tarjeta principal y «Responsable» en una grilla propia |
| B-02 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/32` | Líder | 1920×1009 | Oscuro | `before/BEFORE_HU154_LIDER_DESKTOP_DARK.png` | Mismo estado que B-01 en tema oscuro |
| B-03 | Producción (VM) | `/dashboard/proyectos/32` | Líder | 738×1600 (móvil) | Claro | `before/BEFORE_HU154_LIDER_MOBILE_LIGHT.png` | En móvil no existe navegación del proyecto: solo la barra inferior global |
| B-04 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/55` | Participante con solicitud de salida abierta | 1920×1005 | Claro | `before/BEFORE_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | Barra de pestañas local «Resumen / Solicitud de salida / Tablero» que mezcla una acción con destinos |
| B-05 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/39` | No miembro (proyecto publicado) | 1920×1005 | Claro | `before/BEFORE_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | La sidebar del proyecto solo ofrece «Resumen»; postulación por rol |

## Índice `after/`

| ID | Commit | Ruta | Actor | Viewport | Tema | Archivo | Nota |
|---|---|---|---|---|---|---|---|
| A-01 | `c5af090f` | `/dashboard/proyectos/32` | Líder | 1440×900 | Claro | `after/AFTER_HU154_LIDER_DESKTOP_LIGHT.png` | Sidebar del proyecto agrupada (Resumen · Trabajo · Equipo · Seguimiento); acciones en el menú «⋮»; rejilla 12 columnas: encabezado a ancho completo, descripción/objetivos y roles en 8/12, responsable y detalles en 4/12 |
| A-02 | `c5af090f` | `/dashboard/proyectos/32` | Líder | 1440×900 | Oscuro | `after/AFTER_HU154_LIDER_DESKTOP_DARK.png` | Mismo estado que A-01 en tema oscuro, todo con tokens semánticos |
| A-03 | `c5af090f` | `/dashboard/proyectos/32` | Líder | 390×844 @2x (móvil) | Claro | `after/AFTER_HU154_LIDER_MOBILE_LIGHT.png` | Barra del proyecto con «Secciones» y «Acciones»; rejilla en una columna |
| A-04 | `c5af090f` | `/dashboard/proyectos/55` | Participante con solicitud de salida abierta | 1440×900 | Claro | `after/AFTER_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | Sin barra de pestañas local: la solicitud de salida es un aviso en la columna principal y el Tablero está en la sidebar |
| A-05 | `c5af090f` | `/dashboard/proyectos/39` | No miembro (proyecto publicado) | 1440×900 | Claro | `after/AFTER_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | Misma rejilla que el miembro; postulación por rol en la columna principal y resumen de oportunidades en la lateral |
| A-06 | `c5af090f` | `/dashboard/proyectos/32` | Líder | 1440×900 | Claro | `after/AFTER_HU154_LIDER_DESKTOP_LIGHT_SIDEBAR_COLAPSADA.png` | Sidebar del proyecto colapsada a iconos; el contenido gana el ancho liberado |
| A-07 | `c5af090f` | `/dashboard/proyectos/32` | Líder | 390×844 @2x (móvil) | Claro | `after/AFTER_HU154_LIDER_MOBILE_LIGHT_SECCIONES_ABIERTO.png` | Sheet «Secciones» abierto con los mismos grupos que la sidebar de escritorio |

Pares: B-01↔A-01, B-02↔A-02, B-03↔A-03, B-04↔A-04 y B-05↔A-05. A-06 (sidebar
colapsada) y A-07 (navegación móvil abierta) no tienen par porque esas vistas no
existían antes de HU-154.

Las capturas de `after/` son el viewport visible (sin página completa), igual
que las de `before/`. El ancho de escritorio es 1440 px en vez de los ~1920 px
de `before/`: 1440 px es el mínimo de escritorio de la matriz de HU-154 y el caso
más exigente para la rejilla de 12 columnas con las dos sidebars abiertas.

## Procedencia de `before/`

Las capturas de escritorio (B-01, B-02, B-04, B-05) se tomaron del contenedor
local del frontend, cuya imagen se compiló el **2026-09-07**. B-03 se tomó de la
VM de producción. Ninguna refleja exactamente `develop` en el momento de
empezar HU-154. Al comparar con `after/`, estas diferencias **no** son parte de
HU-154:

| Diferencia visible en `before/` | Estado en `develop` al empezar HU-154 | Origen |
|---|---|---|
| El líder no tiene la entrada «Reportes» | Existe | T-259/T-260 (HU-164) |
| El participante no ve «Bitácora» | La ve | HU-170 |
| «Salir de este rol» del participante con contorno | Botón destructivo con tokens de error | Sprint 8 (migración de tokens) |
| Paleta de «Disponible» y de algunas etiquetas | Migrada a tokens | Sprint 8 (migración de tokens) |

## Procedencia de `after/`

- Frontend: `next dev` en el puerto 3100 sobre el árbol de trabajo en `c5af090f`
  (sin cambios de aplicación sin commitear), con las llamadas a la API por el
  proxy de Next hacia el backend local.
- Backend y base de datos: los contenedores locales existentes, sin
  reconstruirlos ni actualizarlos. Los proyectos 32, 55 y 39 son los mismos datos
  de `before/`.
- Sesión: un único inicio de sesión (vernel@uvg.edu.gt) reutilizado por las 7
  capturas; el recorrido de bienvenida se marca como visto antes de cargar.
- El indicador de desarrollo de Next (`nextjs-portal`, solo existe en `next dev`)
  se oculta con CSS antes de capturar. No se retoca ninguna imagen.
- Los mockups de diseño siguen siendo solo referencia: no cuentan como evidencia
  de T-217.

## Integridad

Los archivos de `before/` no cambian con HU-154 (mismos SHA-256 que abajo).

Los archivos de `before/` son copias byte a byte de las capturas aprobadas:

| Archivo | SHA-256 |
|---|---|
| `BEFORE_HU154_LIDER_DESKTOP_LIGHT.png` | `562f234e2fce6f63fe55f96107b7a9f10e40054578823150e5f0ce35cc121d56` |
| `BEFORE_HU154_LIDER_DESKTOP_DARK.png` | `03f7222dba13bfde623de70b6c634a8cf308597e86942ec4763622214ba57210` |
| `BEFORE_HU154_LIDER_MOBILE_LIGHT.png` | `6ea863de5ac0c326719bf4cfc2c97d7dcfd53ff7fac0d984bc38fd3c6d30084d` |
| `BEFORE_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | `0992b9843413f11ec49c7b86319834d764aaf970ab7415b3773ce577cd91d839` |
| `BEFORE_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | `66698d2b3182b5d5b721b08efe9805fa8b29857859b834647cfa0b8dee4a6a50` |

Archivos de `after/`:

| Archivo | SHA-256 |
|---|---|
| `AFTER_HU154_LIDER_DESKTOP_LIGHT.png` | `c6ed8a6eb62194885775f87814661fa1f4054d69e32db10edd8735f458366722` |
| `AFTER_HU154_LIDER_DESKTOP_DARK.png` | `fc6739fa9e3770f6defbbb3f62ee83e6abbb32e5aaf9fcbf76f79022b13b0adc` |
| `AFTER_HU154_LIDER_MOBILE_LIGHT.png` | `979527d8d947df07129166827f0fd25f78fec506ed96b450750f74876bdc836b` |
| `AFTER_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | `215a392e3e9a24be3a30517e05d8b0a37b546c45d3273276d32b1107af1c5d19` |
| `AFTER_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | `9d246287ba975f58c5f8428c3a26de4f16561f69899d3186621bbc6cadf6b518` |
| `AFTER_HU154_LIDER_DESKTOP_LIGHT_SIDEBAR_COLAPSADA.png` | `3840c8bed131daf0e3588fec6e1d14c61f594cf4589e5407980178810536de11` |
| `AFTER_HU154_LIDER_MOBILE_LIGHT_SECCIONES_ABIERTO.png` | `10c53ef5103f3d105c28a41df18b2cdcdfebd253b1e73fac236b335e7d864348` |
