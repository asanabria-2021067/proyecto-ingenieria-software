# Dependencias - vulnerabilidades conocidas

## Revision automatica en CI

El job `dependencias` de `.github/workflows/ci.yml` corre `npm audit` sobre
`apps/backend` y `apps/frontend` en cada pull request, en cada push a
`develop` y antes de cada despliegue (deploy.yml reutiliza ci.yml).

- Vulnerabilidades **altas o criticas**: el job falla y el PR no se puede
  integrar.
- Vulnerabilidades **bajas o moderadas**: el job pasa, pero deja una
  advertencia visible en el resumen del PR con el detalle en el log.

`npm audit` trabaja sobre el `package-lock.json`, por eso el job no instala
dependencias y tarda pocos segundos.

## Politica para silenciar o posponer una alerta

No se baja el `--audit-level` del job ni se desactiva el paso para que un PR
pase. Si una vulnerabilidad alta o critica no se puede resolver en el
momento, el PR que la deja pendiente debe incluir:

1. El paquete, la version instalada y el enlace al advisory.
2. Por que no se puede actualizar (cambio mayor, sin version corregida,
   dependencia de terceros, etc.).
3. Que tan expuesta esta la aplicacion: si el codigo vulnerable llega a
   produccion o solo se usa en desarrollo y pruebas.
4. Que se hizo mientras tanto (override, mitigacion en el codigo, etc.) y
   cuando se vuelve a revisar.

Esa misma informacion se agrega a la seccion de riesgos abiertos de este
documento. La plantilla de PR tiene una casilla para recordarlo.

## Primera revision (28/09/2026)

| App | Antes | Despues |
|---|---|---|
| backend | 36 (2 criticas, 19 altas, 13 moderadas, 2 bajas) | 4 (3 moderadas, 1 baja) |
| frontend | 17 (3 criticas, 7 altas, 5 moderadas, 2 bajas) | 4 moderadas |

Despues de los cambios no queda ninguna vulnerabilidad alta ni critica en
ninguna de las dos apps.

### backend

- `npm audit fix` actualizo dentro de los rangos ya declarados, entre otros:
  `@nestjs/core` y `@nestjs/platform-express` (inyeccion y DoS via
  `path-to-regexp`), `multer` (varios DoS en subida de archivos), `ws`,
  `engine.io` y `socket.io-parser` (agotamiento de memoria en websockets),
  `fast-uri`, `js-yaml`, `picomatch`, `brace-expansion`, `postcss`, `vite`,
  `defu`, `nanoid`, `qs`, `body-parser` y `effect`.
- `jspdf` pasa de `^3.0.3` a `^4.2.1` y `jspdf-autotable` de `^5.0.2` a
  `^5.0.7` (vulnerabilidad critica de inclusion de archivos locales e
  inyeccion en PDF). El cambio mayor de jsPDF 4 restringe la lectura de
  archivos desde el sistema; el backend carga la fuente NotoSans como base64
  con `addFileToVFS`, asi que no le afecta. Las pruebas de exportacion
  (`pdf-export.builder`, `pdf-charts.builder`) y del informe de cierre
  (`s7-report-and-crypto`) pasan con la version nueva.
- `deepmerge-ts` (alta) llega a traves de `prisma` -> `@prisma/config`, que
  todavia pide la version 7. `npm audit fix --force` proponia bajar Prisma a
  6.12, lo cual se descarto. Se agrego `"overrides": { "deepmerge-ts": "^8.0.0" }`
  en `apps/backend/package.json`. Con el override, `prisma validate` y
  `prisma generate` funcionan igual; `prisma migrate deploy` se valida en el
  job de backend del CI.
- `npm audit fix` subio `@nestjs/core` a 11.2.6 pero dejo `@nestjs/common` en
  11.1.17, y el core nuevo requiere un archivo que solo trae el common nuevo
  (`sse-signal.decorator`). Se alinearon todos los paquetes `@nestjs/*` con
  `npm update` dentro de `^11`; sin esto el AppModule no arranca.
- Verificacion: `npm run build` sin errores y `npx vitest run` con 128
  archivos y 2257 pruebas en verde.

### frontend

- `xlsx` (alta, sin version corregida en npm) se desinstalo: estaba declarado
  en `package.json` pero ningun archivo del frontend lo importa.
- `npm audit fix` actualizo `dompurify` (varios bypass de sanitizacion con
  riesgo de XSS), `ws`, `socket.io-parser`, `vite`, `js-yaml`,
  `brace-expansion`, `browserslist`, `@babel/core`, `fflate` y
  `baseline-browser-mapping`.
- Verificacion: `npm run build` sin errores. `npx vitest run` deja 138 de 140
  archivos en verde; los dos que fallan ya fallaban antes de estos cambios y
  no dependen de ellos (ver riesgos abiertos).

## Riesgos abiertos

### vitest y @vitest/* (moderada, backend y frontend)

- Advisory: GHSA-82fw-gwwq-j7x9, lectura de archivos via una redireccion de
  mock en `@vitest/mocker`.
- Instalado: vitest 3.2.x. Corregido en 4.1.11.
- No se actualiza en este sprint porque vitest 4 es un cambio mayor que
  afecta la configuracion y las 268 suites de pruebas de las dos apps.
- Exposicion: solo se usa al correr pruebas en desarrollo y en CI. No forma
  parte del build de produccion ni de las imagenes desplegadas.
- Pendiente para el Sprint 9: migrar ambas apps a vitest 4.

### esbuild (baja, backend)

- Advisory: GHSA-g7r4-m6w7-qqqr, lectura de archivos cuando se usa el
  servidor de desarrollo de esbuild en Windows.
- Llega como dependencia transitiva de herramientas de desarrollo. El backend no
  levanta el servidor de desarrollo de esbuild; produccion corre sobre Linux
  con el build de Nest.

### Pruebas del frontend que fallan por causas ajenas a las dependencias

- `test/login-session.spec.tsx`: el refactor del login reemplazo SweetAlert por
  mensajes inline y redirige con un retraso de 1200 ms, pero la prueba sigue
  esperando el comportamiento anterior. Falla igual en `develop` sin estos
  cambios.
- `test/font-scale-toggle.spec.tsx`: falla solo en maquinas con versiones de
  Node que traen un `localStorage` experimental propio; en CI (Node 22) pasa.

## Historial

### next: vulnerabilidad critica resuelta (antes de esta revision)

- `npm audit` reportaba una vulnerabilidad critica en `next` para el rango
  `9.3.4-canary.0 - 16.3.2` (RCE en servidores Windows y en optimizacion de
  imagenes AVIF, bypass de middleware en App Router, SSRF en Server Actions,
  cache poisoning de RSC, XSS via nonces de CSP, entre otros).
- Se actualizo `next` de `16.2.0` a `16.3.6`. El build fallaba al principio
  porque desde `16.3.6` el chequeo de tipos de `next build` incluye `test/**`
  y expuso 5 errores de tipos que ya existian en
  `test/my-project-view.spec.tsx` y `test/theme-tokens.spec.ts`; se
  corrigieron y el build quedo limpio.

### jspdf en frontend

- El frontend ya usaba `jspdf` 4.2.1, sin vulnerabilidades reportadas. Con
  esta revision el backend queda en la misma version.
