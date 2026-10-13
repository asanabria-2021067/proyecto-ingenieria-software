# Optimización del pipeline de CI (FASE-CI01)

Objetivo: bajar el tiempo del job "E2E - suite de humo (Playwright)" (13m36s,
de los cuales 10m39s eran la suite completa en un solo worker) y dejar de
repetir el E2E en cada deploy cuando el mismo código ya lo pasó en el PR hacia
`main`. Ninguna validación existente se quitó, se suavizó ni se marcó
`skip`/`only`: donde una prueba de contrato leía una forma vieja del YAML, se
actualizó para validar la forma nueva conservando la misma garantía.

## Qué cambió

### 1. El E2E se reparte en 3 shards (`ci.yml`)

El job `e2e` se volvió `e2e-shard`, con `strategy.matrix.shardIndex: [1, 2, 3]`.
Cada shard:

- Levanta su **propio** Postgres y Redis efímeros (son `services:` del job;
  GitHub Actions crea contenedores nuevos por cada instancia de la matriz, así
  que un shard nunca ve los datos de otro).
- Compila y arranca su propio backend y frontend.
- Corre `npx playwright test --shard=N/3` sobre la suite completa
  (sin los dos specs de accesibilidad, ver punto 2).

`playwright.config.ts` **no se tocó**: `workers: 1` dentro de CI sigue igual
(la contención entre specs pesados ya está documentada ahí y no cambia). Lo
que se paralelizó es el reparto de specs entre *procesos/runners* distintos,
no el número de workers dentro de cada uno.

Un job nuevo, sin matriz, **conserva el nombre exacto de siempre**
(`E2E - suite de humo (Playwright)`) y hace `needs: e2e-shard`. Esto es
necesario porque GitHub le agrega el valor de la matriz al nombre visible de
un job con `strategy.matrix` (p. ej. "E2E - suite de humo (Playwright) (1)"):
si el job con checks requeridos tuviera matriz, ese nombre exacto sin sufijo
nunca se volvería a publicar y la rama quedaría bloqueada esperando un check
que no llega. El job final:

1. Descarga los reportes `blob-report-*` que cada shard subió.
2. Los combina en un único HTML con `npx playwright merge-reports`.
3. Falla explícitamente (`exit 1`) si `needs.e2e-shard.result != 'success'`,
   aunque el merge en sí haya salido bien — así el check requerido queda en
   rojo, no en gris/omitido.

**Por qué no se pierde cobertura:** `test/fg11-a11y-ci-contract.spec.ts`
ahora comprueba, leyendo el propio `package.json`, que el patrón de
`--grep-invert` de `test:e2e:sin-a11y` excluye **exactamente** los dos specs
que `test:e2e:a11y` ya corrió (ni uno más — incluye un caso de prueba
específico para que un nombre parecido, `calendario-accesibilidad.spec.ts`,
no quede excluido por accidente). El resto de la suite se reparte entre los 3
shards vía `--shard`; Playwright garantiza que la unión de los N shards es la
suite completa.

### 2. Accesibilidad con axe corre una sola vez (shard 1)

Antes, axe corría dentro del único job `e2e`. Ahora corre solo cuando
`matrix.shardIndex == 1`, en el mismo orden de siempre (después de migrar y
sembrar la base, levantar el backend y compilar el frontend; antes de la
suite completa) y sigue siendo bloqueante (sin `continue-on-error`, sin
`|| true`).

`fg11-a11y-ci-contract.spec.ts` se actualizó para permitir **esa única
condición exacta** (`matrix.shardIndex == 1`) en el paso de axe — cualquier
otra condición (por ejemplo, una basada en `github.base_ref`, que antes ya se
probaba como fixture negativo) sigue marcándose como `paso-condicional` y
rompe el contrato. La garantía ("axe es bloqueante y corre antes que la suite
completa") se conserva; lo que cambió es que ya no se repite 3 veces.

### 3. Caché del build incremental de Next.js

Se agregó un paso `actions/cache@v4` sobre `apps/frontend/.next/cache` en el
job `frontend` y en `e2e-shard`, con clave por el hash del lockfile y de las
fuentes (`.ts`/`.tsx`/`.js`/`.jsx`) y `restore-keys` por lockfile solo (para
reusar cache aunque cambien archivos). `next build` sigue corriendo siempre
— esto no es un atajo que se salte el build, solo evita que el compilador
vuelva a analizar desde cero lo que no cambió.

### 4. El deploy no repite el E2E si el PR hacia `main` ya lo probó

`deploy.yml` tenía `test: with: { e2e: run }` fijo: cada deploy volvía a
correr el E2E completo aunque el mismo código ya lo hubiera pasado en el PR
que se acaba de mergear a `main`. Ahora un job nuevo, `e2e-gate`, corre antes
de `test` y decide `run` o `skip` con `.github/scripts/decide-e2e.mjs`:

```
workflow_dispatch               -> siempre 'run' (no consulta nada)
¿hay un PR mergeado hacia main
  asociado a este commit?       -> no: 'run'
¿el árbol de ESTE commit
  (git rev-parse <sha>^{tree})
  es el mismo que el del PR?    -> no / no se puede comprobar: 'run'
¿el E2E de ese PR terminó
  en success?                   -> no / no se puede comprobar: 'run'
                                 -> sí a todo: 'skip'
```

**Por qué la garantía "todo lo desplegado pasó el E2E" se mantiene:**

- La comparación es por **árbol** (`commit.tree.sha` vía la API de GitHub),
  no por SHA de commit. Un squash-merge genera un commit nuevo en `main` con
  otro SHA pero el **mismo contenido de archivos** que el head del PR que
  pasó CI; comparar SHAs de commit habría forzado a correr el E2E siempre
  (falso negativo). Comparar árboles es la invariante correcta: si los
  árboles son iguales, el código que se va a desplegar es *byte a byte* el
  mismo que corrió el E2E.
- Es **fail-closed** en cada paso: sin PR asociado, sin poder leer un árbol,
  sin poder leer los check-runs, o con cualquier conclusión que no sea
  literalmente `success`, la respuesta es `run`. Nunca hay un camino donde un
  error de red o una respuesta inesperada de la API termine en `skip`.
- `e2e-gate` solo tiene permisos de **lectura** (`contents: read`,
  `pull-requests: read`, `checks: read`); no puede escribir nada ni afectar
  otro job salvo por su output.
- La lógica de decisión (`decideE2e` en `decide-e2e.mjs`) es una función pura
  e inyectable, probada en `g02-deploy-e2e-skip-gate.spec.ts` para cada rama
  (sin PR, árbol distinto, E2E no exitoso, todo correcto) sin tocar la red de
  verdad.
- `workflow_dispatch` siempre corre el E2E sin consultar nada: un deploy
  manual (p. ej. para reintentar algo, o `config-only`) nunca se confía en un
  PR viejo.

## Pruebas de contrato actualizadas

Se actualizaron (nunca se borró una aserción de seguridad, solo se adaptó la
forma al nuevo YAML conservando la misma garantía):

- `fg11-a11y-ci-contract.spec.ts`: apunta al job `e2e-shard` (donde ahora
  viven axe y la suite), tolera la única condición de shard permitida en el
  paso de axe, actualiza el comando esperado del paso de la suite completa
  (ahora con `--shard`) y agrega pruebas nuevas: que el filtro de exclusión
  de a11y es exacto, y que el job final `e2e` conserva el nombre estable y
  falla si algún shard falló.
- `g02-e2e-production-like.spec.ts`: apunta a `e2e-shard` (mismos pasos y
  env de siempre, solo cambió qué job los contiene).
- `g02-e2e-trigger-contract.spec.ts`: la condición de disparo (sin cambios de
  valores) ahora se lee de `e2e-shard`; se actualizó la aserción de
  `deploy.yml` para esperar que `test.with.e2e` reenvíe la salida de
  `e2e-gate` en vez del valor fijo `'run'`.
- `g02-publish-gate.spec.ts`: el cierre transitivo de `needs` de
  `promote-latest` ahora incluye `e2e-gate` (porque `test` depende de él).

Prueba nueva:

- `g02-deploy-e2e-skip-gate.spec.ts`: la lógica pura de `decideE2e` (todas las
  ramas, sin red) y el cableado de `e2e-gate` en `deploy.yml` (permisos de
  solo lectura, `needs`/`with` de `test`, sin secretos de más).

No necesitaron cambios (se revisaron explícitamente): `g02-ci-quality-gates.spec.ts`
y `g02-topology-ci.spec.ts` (el job `e2e` sigue existiendo con ese nombre
exacto, ahora en el job final), `g02-workflow-permissions.spec.ts`,
`g01-deploy-config-contract.spec.ts` (nada de `vars.*` sin default en el job
nuevo), ni los contratos de `g03-*`/`g06-*`.

## Resultado de las pruebas de contrato (local)

```
cd apps/backend && npx vitest run test/g0 test/fg11 test/fg13
```

Los 8 archivos que este cambio podía romper (`fg11-a11y-ci-contract`,
`g02-e2e-trigger-contract`, `g02-e2e-production-like`, `g02-publish-gate`,
`g02-deploy-e2e-skip-gate` [nuevo], `g02-ci-quality-gates`, `g02-workflow-permissions`,
`g01-deploy-config-contract`) pasan completos: **103/103**.

El resto del universo `test/g0*`/`fg11`/`fg13` tiene fallas **preexistentes y
ajenas** a este cambio, confirmadas comparando contra `develop` limpio
(`git stash`): problemas de entorno local en Windows (el CLI de `docker` vía
Git Bash, `flock` en los contratos de `infra/db-backup`, y un `SyntaxError`
de parseo en `g02-topology-ci.spec.ts` al importar `infra/staging/*.mjs`).
Ninguno de ellos toca `ci.yml`, `deploy.yml` ni los scripts de este cambio, y
ya fallaban igual antes de esta tarea. Validados aparte en WSL (entorno Linux
real): los contratos de `infra/db-backup` pasan 100%.

YAML validado con PyYAML (`actionlint` no está instalado en esta máquina):

```
python -c "import yaml; [yaml.safe_load(open(f, encoding='utf-8')) for f in [
  '.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/workflows/k6.yml']]"
```

Los tres workflows son YAML válido.

## Tiempo estimado por job (antes → después)

Estimado a partir del tiempo reportado (13m36s totales, 10m39s el paso de la
suite) y de que dividir ~28 specs en 3 shards reparte el trabajo de CPU en
~3, menos el axe que ahora solo corre una vez. No es una medición de una
corrida real en GitHub Actions (eso solo se confirma en la primera corrida
del pipeline con estos cambios).

| Job | Antes | Después (estimado) | Nota |
|---|---|---|---|
| `frontend` (lint/typecheck/build/test) | ~2-3 min | ~2-3 min (un poco menos con cache de Next en corridas repetidas) | Sin cambio estructural |
| `e2e` → `e2e-shard` (×3, en paralelo) | 13m36s (1 job) | ~5-6 min por shard (setup propio ~2-3min + ~3-4min de specs; el shard 1 suma axe ~1min) | 3 runners en paralelo; el más lento (shard 1) manda el tiempo de pared |
| `e2e` (merge, nuevo) | — | ~30-60s | Descarga blobs + merge-reports, corre después de los 3 shards |
| **E2E total (wall-clock)** | **13m36s** | **~6-7 min** | ~45-50% menos; el setup por shard (Postgres/Redis/backend/frontend) se paga 3 veces en paralelo, no se multiplica el tiempo de pared |
| `deploy.yml` / `test` (cuando se puede omitir) | 13m36s (E2E siempre) | ~0s de E2E (el resto de `ci.yml` — backend/frontend/lint — sigue corriendo igual) | Solo cuando `e2e-gate` demuestra que el mismo árbol ya pasó el E2E en el PR hacia `main`; si no puede demostrarlo, corre igual que antes |

## Pendiente

- **Confirmar en una corrida real de GitHub Actions** los tiempos de arriba
  (esta tarea se hizo y probó en local/WSL; no hay acceso para disparar el
  pipeline real desde aquí).
- **`actionlint` no está instalado** en esta máquina; se validó solo sintaxis
  YAML con PyYAML. Quien tenga acceso a instalarlo puede correr
  `actionlint .github/workflows/*.yml` para un lint específico de GitHub
  Actions (expresiones, contextos, acciones deprecadas).
- **Revisar el branch protection de `main`/`develop`** después del primer
  merge: el check requerido sigue llamándose `E2E - suite de humo
  (Playwright)` y ahora lo publica un job distinto (`e2e`, sin matriz) — no
  debería hacer falta tocar la configuración de la rama, pero conviene
  confirmarlo la primera vez que corra.
- El tamaño de 3 shards es un punto de partida razonable para ~28 specs; si
  la suite crece mucho, puede valer la pena recalcular cuántos shards
  conviene usar.
