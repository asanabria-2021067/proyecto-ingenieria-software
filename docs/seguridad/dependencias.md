# Dependencias — riesgos de seguridad conocidos (apps/frontend)

## next: vulnerabilidad critica, actualizacion revertida

- Version declarada e instalada: `16.2.0`.
- `npm audit` reporta una vulnerabilidad **critica** en `next` para el rango
  `9.3.4-canary.0 - 16.3.2`. El fix lo trae `16.3.6` (cambio menor dentro de
  `16.x`, `isSemVerMajor: false`). La cadena de advisories que cubre incluye,
  entre otros: RCE no autenticado en servidores hosteados en Windows (<16.3.3),
  RCE no autenticado en la API de optimizacion de imagenes con archivos AVIF
  (<16.3.3), varios bypass de middleware/proxy en App Router (este repo usa
  middleware — `ƒ Proxy (Middleware)` aparece en el output de `npm run
  build`), SSRF en Server Actions y rewrites, cache poisoning de respuestas
  RSC, XSS via nonces de CSP, y divulgacion no autenticada de endpoints
  internos de Server Functions.
- Se probo el bump a `16.3.6`:
  - `npm install` resuelve limpio.
  - La suite de tests de frontend pasa completa (129 archivos, 1504 tests).
  - `npm run build` **rompe** en el paso de chequeo de TypeScript, porque a
    partir de `16.3.6` el type-check de `next build` amplia su alcance e
    incluye `test/**` (en `16.2.0` no lo hace). Los 5 errores que expone ya
    existian antes del bump: son deuda de tipos preexistente en los archivos
    de test, no una regresion introducida por `next`. Verificado con
    `next@16.2.0` instalado corriendo `npx tsc --noEmit -p tsconfig.json`
    directamente: devuelve los mismos 5 errores (`test/my-project-view.spec.tsx`
    TS2322 en 61/69/95, `test/theme-tokens.spec.ts` TS1501 en 136/137). El
    proyecto **no** tipaba limpio en `16.2.0`; el build simplemente no
    miraba esos archivos.
  - Codigo de aplicacion: sin cambios ni errores en ninguna de las dos
    versiones. El bloqueo es exclusivamente en `test/**`.
- Decision: se corrigieron los 5 errores de tipos en los archivos de test
  (`test/my-project-view.spec.tsx`, `test/theme-tokens.spec.ts`) y se
  actualizo `next` a `16.3.6`, cerrando la vulnerabilidad critica.

## jspdf: verificado, no representa un riesgo activo

- `package.json` ya declara `jspdf: ^4.2.1` (major 4) y `npm ls jspdf`
  confirma `4.2.1` instalado (via dependencia directa y via
  `jspdf-autotable`).
- `npm audit` no reporta ninguna vulnerabilidad asociada a `jspdf` en el
  estado actual del repo.
- No hay ningun cambio mayor 3->4 pendiente de aplicar sobre `jspdf`: la
  version instalada ya es 4.x. Se deja esta nota para no repetir la
  verificacion si vuelve a aparecer como riesgo en un reporte futuro de
  `npm audit`.
