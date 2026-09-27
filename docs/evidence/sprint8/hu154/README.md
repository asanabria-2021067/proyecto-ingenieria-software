# HU-154 — Evidencia antes/después de la vista de proyecto (T-217)

Capturas reales de la vista de detalle de proyecto antes y después del
rediseño de HU-154 (T-214 tipografía y tokens, T-215 navegación contextual,
T-216 rejilla de 12 columnas). Los mockups de diseño **no** son evidencia y no
se guardan aquí.

- `before/`: estado previo a HU-154. Capturas congeladas; no se editan, recortan
  ni regeneran.
- `after/`: estado final. Se añaden en el último commit de HU-154, con el mismo
  encuadre (ruta, actor, viewport y tema) que su par `before/`.

## Índice

| ID | Commit | Ruta | Actor | Viewport | Tema | Archivo | Nota |
|---|---|---|---|---|---|---|---|
| B-01 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/32` | Líder | 1920×1009 | Claro | `before/BEFORE_HU154_LIDER_DESKTOP_LIGHT.png` | 13 entradas planas en la sidebar del proyecto; acciones (Editar Información, Revisiones Pasadas, Editar Roles) mezcladas con destinos; tarjeta principal y «Responsable» en una grilla propia |
| B-02 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/32` | Líder | 1920×1009 | Oscuro | `before/BEFORE_HU154_LIDER_DESKTOP_DARK.png` | Mismo estado que B-01 en tema oscuro |
| B-03 | Producción (VM) | `/dashboard/proyectos/32` | Líder | 738×1600 (móvil) | Claro | `before/BEFORE_HU154_LIDER_MOBILE_LIGHT.png` | En móvil no existe navegación del proyecto: solo la barra inferior global |
| B-04 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/55` | Participante con solicitud de salida abierta | 1920×1005 | Claro | `before/BEFORE_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | Barra de pestañas local «Resumen / Solicitud de salida / Tablero» que mezcla una acción con destinos |
| B-05 | Imagen frontend del 2026-09-07 | `/dashboard/proyectos/39` | No miembro (proyecto publicado) | 1920×1005 | Claro | `before/BEFORE_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | La sidebar del proyecto solo ofrece «Resumen»; postulación por rol |

Pares previstos con `after/`: B-01↔A-01, B-02↔A-02, B-03↔A-03, B-04↔A-04 y
B-05↔A-05. A-06 (sidebar colapsada) y A-07 (navegación móvil abierta) no tienen
par porque esas vistas no existían antes.

## Procedencia

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

## Integridad

Los archivos de `before/` son copias byte a byte de las capturas aprobadas:

| Archivo | SHA-256 |
|---|---|
| `BEFORE_HU154_LIDER_DESKTOP_LIGHT.png` | `562f234e2fce6f63fe55f96107b7a9f10e40054578823150e5f0ce35cc121d56` |
| `BEFORE_HU154_LIDER_DESKTOP_DARK.png` | `03f7222dba13bfde623de70b6c634a8cf308597e86942ec4763622214ba57210` |
| `BEFORE_HU154_LIDER_MOBILE_LIGHT.png` | `6ea863de5ac0c326719bf4cfc2c97d7dcfd53ff7fac0d984bc38fd3c6d30084d` |
| `BEFORE_HU154_PARTICIPANTE_DESKTOP_LIGHT.png` | `0992b9843413f11ec49c7b86319834d764aaf970ab7415b3773ce577cd91d839` |
| `BEFORE_HU154_NO_MIEMBRO_PUBLICADO_DESKTOP_LIGHT.png` | `66698d2b3182b5d5b721b08efe9805fa8b29857859b834647cfa0b8dee4a6a50` |
