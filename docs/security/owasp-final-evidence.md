# Evidencia final OWASP 2025 — cierre del alcance de código de Vernel

Cierre de la workstream OWASP de la Fase 2 (rama `sprint8/vernel-owasp2025`). Control: **OWASP25-C048** (A01–A10) · tarea **T-273**.

Este documento reúne la línea base final de la rama, el conteo de commits, los resultados locales y el paquete del **único PR hacia `develop`**. Todo lo posterior al handoff, es decir integración, `main`, GitHub Admin, deploy, VM y producción, corresponde al administrador o líder (`OUT_OF_SCOPE_ADMIN_HANDOFF`).

## Línea base de la rama

| Campo | Valor |
|---|---|
| `BASE_SHA_PHASE2_CODE` | `0a723a8d93b640f6077c801d9a0ad5a7b59cbef3`: padre local del primer commit de G01 (`79230ea7`) |
| `BASE_SHA_GATE_START` (G08) | `7a9ebc4eb1becd3485fe65c94ba7411dd56c4c70`: HEAD final de G07 |
| HEAD previo al cierre | `93918a080773cff0527a93276339c265d49715ed` (G08-C09) |
| HEAD final | G08-C10, este commit. Su SHA figura en la auditoría final externa y en `git log` |
| Rango | `0a723a8d..HEAD`, lineal: 0 merges y 0 commits ajenos |
| Conteo real | **99** commits, derivado de `git rev-list --count 0a723a8d..HEAD` al incluir G08-C10 |

## Commits por gate

| Gate | Commits | Estado de código | Auditoría |
|---|---|---|---|
| G01 | 12 | PASS | `auditoria_gate_G01_secrets_configuration_fail_closed_CORREGIDA.md` |
| G02 | 17 | PASS_SCOPE_V2 (G02-C03 no ejecutada → Gate Admin) | `auditoria_gate_G02_cicd_integrity.md` |
| G03 | 11 | PASS | `auditoria_gate_G03_supply_chain.md` |
| G04 | 14 | PASS | `auditoria_gate_G04_auth_rate_limit_hardening.md` |
| G06 | 10 | PASS | `auditoria_gate_G06_http_headers_csp_https.md` |
| G05 | 13 | PASS | `auditoria_gate_G05_security_logging_alerting.md` |
| G07 | 12 | PASS | `auditoria_gate_G07_input_output_websocket.md` |
| G08 | 10 | PASS | `auditoria_gate_G08_final_code_validation.md` |
| **Total** | **99** | | Auditorías externas al repositorio, no versionadas |

## Resultados locales al preparar el cierre

G08 solo agrega documentación, un verificador y tests; no cambia código de ejecución. Los números salen de la regresión local de G08.

| Suite | Resultado |
|---|---|
| Backend build | PASS |
| Backend lint | 0 errores / 18 warnings |
| Backend unit | 3070/3070 en G08-C09 (baseline de G08: 2981/2981) |
| Backend integración (PostgreSQL desechable) | 213/213 |
| Frontend lint / typecheck | 0 errores / 6 warnings · 0 errores |
| Frontend unit | 1597/1597 |
| Frontend build | PASS (también la variante same-origin, sin `:3001` en el bundle) |
| E2E production-like | 5 PASS / 2 FAIL: solo HU-159, `PREEXISTING_HU159_E2E_FAILURE` |
| Arnés de topología (nginx + TLS, T13/T14/T16/T17/T18/T21) | PASS sobre `7a9ebc4e`; G08 no toca esas rutas |
| `OWASP_DELTA_ISOLATED` | PASS: `node scripts/security/verify-owasp-delta.mjs` |

## Documentos de evidencia

- `owasp-top10-2025.md`:
  - matriz A01–A10;
  - estados finales;
  - riesgos residuales de código (R1–R12);
  - operaciones externas.
- `evidence-index.md`:
  - una fila por commit, con control, SHA, tests, comando local, resultado y auditoría;
  - baseline G01/G02;
  - HU-159.
- `negative-controls.md`: pruebas negativas ejecutadas.
- `owasp-delta-allowlist.json`: rutas permitidas por gate.
- `dependency-exceptions.md`: excepciones vigentes con owner y caducidad.

## Autoría

- **Autor y committer:** los 99 commits del rango tienen un único autor y committer, el usuario `Junjey123-mx` (Vernel).
- **Trailers:** ninguno de coautoría ni de herramientas.
- **Rutas sensibles:** ninguna (`.env`, claves, dumps, backups). `.env.example` es la plantilla versionada.

## Paquete del PR único

| Campo | Valor |
|---|---|
| `UNIQUE_PR_TARGET` | `sprint8/vernel-owasp2025 → develop` |
| `EXISTING_PR_REFERENCE` | #231, if still active. Las auditorías G01 y G02 lo registran como PR draft de esta rama contra `develop` |
| `REMOTE_STATUS` | NOT_VERIFIED_IN_G08. G08 no consulta GitHub |
| `PUSH` | NOT_PERFORMED. El HEAD final no está publicado |

Checklist de entrega:

- [x] Rango `0a723a8d..HEAD` lineal, trazable y con autoría única.
- [x] `OWASP_DELTA_ISOLATED` = PASS en local; job homónimo en el CI del PR hacia `develop`.
- [x] Auditorías G01–G08 generadas (fuera del repositorio).
- [x] Matriz A01–A10, índice de evidencia, controles negativos y riesgos residuales versionados.
- [x] HU-159 documentado como preexistente (no se corrigió ni se ocultó).
- [ ] Push de la rama: requiere la autorización explícita del propietario.
- [ ] Actualizar el PR único #231 si sigue activo, sin abrir otro: tras el push, con autorización.
- [ ] Checks remotos del PR (backend, frontend, topología, `OWASP_DELTA_ISOLATED`): evidencia adicional tras el push.
- [ ] Sincronización con `develop`, conflictos, merge, `main`, GitHub Admin, deploy y VM: Gate Admin (`OUT_OF_SCOPE_ADMIN_HANDOFF`).

## Estado del alcance

```text
OWASP_IMPLEMENTATION_CODE_SCOPE = PASS
VERNEL_CODE_SCOPE               = CLOSED
PR_HANDOFF_PACKAGE              = READY
REMOTE_HANDOFF                  = PENDING_OWNER_AUTHORIZATION
```

Cuando el propietario autorice la actualización del PR único: `VERNEL_SCOPE = CLOSED` y `ADMIN_SCOPE = STARTS`.
