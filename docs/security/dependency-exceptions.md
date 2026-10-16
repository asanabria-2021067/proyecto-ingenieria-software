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
<!-- exceptions:end -->

## Estado al cierre de G08 (2026-09-28)

- **Excepciones:** 5 vigentes y ninguna vencida. Ninguna es `critical` de producción.
- **Caducidad próxima (2026-10-31):** `brace-expansion` y `esbuild`. Ese día el guard falla: hay que actualizarlas o renovarlas con una justificación nueva. El resto caduca el 2026-12-31.
- **Matriz OWASP:** figuran como riesgo residual de código R1 en `owasp-top10-2025.md`. Owner: Vernel.
