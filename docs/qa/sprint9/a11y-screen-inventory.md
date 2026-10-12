# Sprint 9 · Pantallas y método de la auditoría de accesibilidad (T-316)

Herramienta: `scripts/qa/sprint9-a11y-audit.mjs`. Mide con Lighthouse y axe; no corrige ni modifica la aplicación.

## 1. Las cinco pantallas

El proyecto no tiene analítica de uso, así que «más usadas» no se pudo medir con datos. Se eligieron por su papel
en la navegación: son la entrada de cada rol y los destinos de primer nivel de su menú.

| # | Pantalla | Ruta | Cuenta | Por qué |
|---|---|---|---|---|
| 1 | Dashboard del estudiante | `/dashboard` | Estudiante | Aterrizaje de todo estudiante tras iniciar sesión |
| 2 | Dashboard de administración | `/dashboard/admin` | Administrador | Aterrizaje de todo administrador |
| 3 | Proyectos (administración) | `/dashboard/admin/proyectos?grupo=activos` | Administrador | Bandeja principal de trabajo del administrador |
| 4 | Calendario | `/dashboard/calendario` | Estudiante | Destino de primer nivel del menú del estudiante; la vista más densa en controles |
| 5 | Editar perfil | `/dashboard/perfil/editar` | Estudiante | El formulario más largo de la aplicación; por él pasa todo estudiante al completar su perfil |

Cada pantalla se mide en **tema claro y tema oscuro**: 5 × 2 = 10 combinaciones, y cada una con las dos
herramientas: **20 mediciones**.

## 2. Condiciones de medición

| Aspecto | Valor |
|---|---|
| Aplicación | Build de producción (`next build` + `next start`) de la pila E2E aislada |
| Datos | Seed de pruebas: cuentas y proyectos sintéticos. Nunca datos reales |
| Sesión | Autenticada con las cuentas sintéticas del seed; la sesión vive en cookies del navegador de prueba |
| Navegador | Chromium de Playwright, sin interfaz |
| Ventana | 1440 × 900, sin emulación de móvil |
| Idioma y zona | `es-GT`, `America/Guatemala` |
| Estado de carga | Red en reposo y titular de la página visible, más 500 ms |
| axe-core | 4.10.3, reglas con etiqueta `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` |
| Lighthouse | 12.6.1, solo la categoría de accesibilidad, en la misma sesión y tema (`disableStorageReset`) |
| Teclado | Recorrido observacional de hasta 40 pulsaciones de Tab por combinación |

axe-core y Lighthouse **no son dependencias del repositorio**: el script las toma de un directorio externo con
versiones fijadas (`A11Y_TOOLS_DIR`). La dependencia de axe para la suite E2E se añade en T-318.

## 3. Cómo se ejecuta

```bash
scripts/e2e/isolated-stack.sh up && scripts/e2e/isolated-stack.sh migrate && scripts/e2e/isolated-stack.sh apps

mkdir -p "$A11Y_TOOLS_DIR" && (cd "$A11Y_TOOLS_DIR" && npm init -y && npm install --save-exact axe-core@4.10.3 lighthouse@12.6.1)

A11Y_TOOLS_DIR=<directorio externo> node scripts/qa/sprint9-a11y-audit.mjs --out <carpeta externa> --tag baseline
```

El script se niega a correr si `--out` está dentro del repositorio o si la URL no es local.

## 4. Qué produce

En `<carpeta externa>/<tag>/`, por cada combinación `<pantalla>-<tema>`:

| Archivo | Contenido |
|---|---|
| `.axe.json` | Cada violación: regla, impacto, criterios WCAG, selector, fragmento HTML y resumen del fallo |
| `.lighthouse.json` | Puntuación de accesibilidad y auditorías fallidas con sus selectores |
| `.teclado.json` | Paradas de Tab, controles sin indicador de foco y posibles trampas |
| `.png` | Captura de la pantalla medida |

Más `resumen.json`, con fecha, commit, versiones y el resumen de las 20 mediciones. Ningún archivo guarda cookies ni
tokens. Los informes contienen fragmentos de la interfaz con datos **sintéticos** del seed.

## 5. Límites conocidos

- **«Editar perfil» es un asistente de cinco pasos y solo se mide el primero**, que es el que se muestra al entrar.
- Se mide el estado inicial de cada pantalla: no se abren diálogos, menús ni estados de error.
- Una sola ventana (1440 × 900). El comportamiento en móvil lo cubren otras pruebas, no esta auditoría.
- Ni axe ni Lighthouse prueban todo WCAG: una puntuación de 100 no equivale a cumplir AA. El recorrido de teclado
  es una observación automática, no una prueba con lector de pantalla.
- El recorrido de teclado toma como nombre el `aria-label` o el texto del elemento: un campo de formulario sin
  ninguno de los dos aparece como «sin nombre», tenga o no una etiqueta asociada. La regla `label` de axe es la
  que decide ese caso.
