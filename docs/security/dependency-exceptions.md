# Excepciones de dependencias (G03-C11)

Riesgo conocido de dependencias que **no** se remedia todavía, con dueño y caducidad. Controles: OWASP25-C040 / C046 (A03 y A10:2025).

## Reglas

- Solo entra un hallazgo de `npm audit` que no tenga un fix seguro: el fix exige un salto major, es un downgrade, o no se pudo aplicar sin `--force`.
- Cada fila registra el paquete, la app, los advisories, la severidad, el alcance, la versión que corrige, la justificación, el owner y la fecha de caducidad (`AAAA-MM-DD`).
- Nunca se registran rutas explotables, payloads ni datos del entorno.
- **Caducidad máxima**: 180 días desde hoy, y 30 días si el hallazgo es `critical` y alcanza producción.
- Guard: `apps/backend/test/g03-dependency-exceptions.spec.ts` corre en el job de backend de CI y **falla** cuando:
  - una excepción venció;
  - la caducidad supera el máximo;
  - falta un campo;
  - la versión del lockfile ya alcanza «Corrige en». La excepción es obsoleta y hay que borrarla.
- **Ratchet**: la lista solo puede achicarse. Una vulnerabilidad nueva high o critical que llegue en un PR la bloquea `dependency-review` (G03-C01). El backlog sigue visible en el resumen informativo de `npm audit` (G03-C02).

## Registro

<!-- exceptions:start -->
| Paquete | App | Advisory | Severidad | Alcance | Corrige en | Justificación | Owner | Caduca |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepmerge-ts | backend | GHSA-ggr8-5vv4-36mx | high | produccion | 8.0.0 | Llega por `prisma` → `@prisma/config` (también se reportan esos dos por herencia). Lo usa el CLI de Prisma al cargar su propia configuración, no el servidor HTTP, y no recibe datos externos. El único «fix» de npm es bajar a prisma 6.12.0, un downgrade del ORM. Se revisa con el salto planificado a Prisma 7. | Vernel | 2026-12-31 |
| @vitest/mocker | backend | GHSA-82fw-gwwq-j7x9 | moderate | desarrollo | 4.1.11 | Solo el runner de pruebas; no viaja en la imagen. El fix exige vitest 4 (major). | Vernel | 2026-12-31 |
| @vitest/mocker | frontend | GHSA-82fw-gwwq-j7x9 | moderate | desarrollo | 4.1.11 | Solo el runner de pruebas; no viaja en el build. El fix exige vitest 4 (major). | Vernel | 2026-12-31 |
| brace-expansion | backend | GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | high | desarrollo | 1.1.18 | Llega por `@nestjs/cli` → `fork-ts-checker-webpack-plugin` → `minimatch@3` y solo procesa patrones del propio repo durante el build. Hay un fix dentro del rango, pero `npm audit fix` de G03-C09 no lo aplicó; se actualiza en la siguiente ventana de dependencias. | Vernel | 2026-10-31 |
| esbuild | backend | GHSA-g7r4-m6w7-qqqr | low | desarrollo | 0.28.1 | Llega por `tsx` 4.21 (fija `~0.27`) y solo afecta al servidor de desarrollo en Windows, que no se usa. `tsx` 4.23 lo corrige dentro del rango. | Vernel | 2026-10-31 |
<!-- exceptions:end -->
