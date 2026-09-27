# Dependencias — riesgos de seguridad conocidos (apps/frontend)

## next: vulnerabilidad critica, actualizacion revertida

- Version declarada e instalada: `16.2.0`.
- `npm audit` reporta una vulnerabilidad **critica** en `next` para el rango
  `9.3.4-canary.0 - 16.3.2`. El fix lo trae `16.3.6` (cambio menor dentro de
  `16.x`, `isSemVerMajor: false`).
- Se probo el bump a `16.3.6`:
  - `npm install` resuelve limpio.
  - La suite de tests de frontend pasa completa (129 archivos, 1504 tests).
  - `npm run build` **rompe** en el paso de chequeo de TypeScript, con
    errores que no aparecen en `16.2.0`:
    - `test/my-project-view.spec.tsx`: 3 errores `TS2322` (fixtures del test
      con campos `null`/`undefined` que ya no son asignables a
      `ProyectoDetalleDTO` / `SnapshotProyectoDTO`).
    - `test/theme-tokens.spec.ts`: 2 errores `TS1501` (flag de regex `s`,
      requiere `target` `es2018` o superior; el `tsconfig.json` del proyecto
      usa `es2017`).
  - Verificado con cache de TypeScript limpia (`.next/cache/.tsbuildinfo` y
    `tsconfig.tsbuildinfo` borrados antes de cada corrida) en ambas
    versiones, para descartar que fuera un cache viejo: con `16.2.0` el build
    compila y tipa sin errores; con `16.3.6`, con el mismo codigo de la app
    sin cambios, falla. El `tsconfig.json` tampoco cambio entre una corrida y
    otra.
- Decision: se revierte `next` a `16.2.0`. La vulnerabilidad critica queda
  **sin mitigar** hasta que se corrijan esos 5 errores de tipos en los
  archivos de test señalados y se reintente el bump a `16.3.6`.

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
