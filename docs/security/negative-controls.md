# Controles negativos locales (OWASP 2025, código)

Pruebas negativas **realmente ejecutadas** en la workstream OWASP de la Fase 2 (G01–G08). Control: **OWASP25-C048** (pruebas negativas, A01–A10) · tarea **T-273**.

Cada entrada tiene:
- el test o fixture del repositorio que la ejecuta;
- la falla que se espera;
- el resultado observado;
- la limpieza;
- la referencia de evidencia en el índice (`evidence-index.md`).

Todas corren en local o en el CI del PR: no requieren un PR negativo adicional, el NT04 remoto ni acceso a producción, que quedan en el Gate Admin.

No se reproducen payloads sensibles: los fixtures usan valores sintéticos y dominios `.invalid`/`.example`.

**Resultado observado:** «Rechazado» significa que el caso negativo produce exactamente el error o bloqueo esperado y el test pasa en la regresión local de G08.

## Registro

| # | Gate · control | Test / fixture | Falla esperada | Resultado observado | Limpieza | Evidencia |
|---|---|---|---|---|---|---|
| 1 | G01 · C019 | `jwt-secret-config.spec.ts` | `JWT_SECRET` ausente, vacío, default conocido o de menos de 32 caracteres → el arranque falla, sin eco del valor | Rechazado | No aplica (unitario) | G01-C02 |
| 2 | G01 · C019 | `g01-compose-contract.spec.ts` | Compose sin `JWT_SECRET`, `JWT_REFRESH_SECRET` o `DB_PASSWORD` → `docker compose config` sale ≠ 0 | Rechazado | Directorio temporal borrado; solo `docker compose config`, sin contenedores | G01-C05 |
| 3 | G01 · C020 | `g01-frontend-image-secrets.spec.ts` | Un secreto de servidor como build-arg o ENV de la imagen del frontend → guard falla | Rechazado | No aplica | G01-C06 |
| 4 | G01 · FASE2-N01 | `g01-deploy-env-transport.spec.ts` | Secreto interpolado en el script remoto o `.env` sin 0600 → detectado | Rechazado | Directorio temporal del test borrado | G01-C07 |
| 5 | G01 · C030 | `g01-deploy-config-contract.spec.ts` | Flag `vars.X` sin default, variable sin consumidor o entrada huérfana → detectado | Rechazado | No aplica | G01-C08 |
| 6 | G01 · C029 | `g01-backend-startup.spec.ts` | CMD con seed o con un fallback que ignora el error → detectado | Rechazado | No aplica | G01-C09 |
| 7 | G01 · FASE2-N08 | `g01-gitignore-contract.spec.ts` | Backups, dumps o claves privadas versionables → detectado | Rechazado | No aplica | G01-C11 |
| 8 | G02 · C044/C045 | `security-deploy-ref-guard.spec.ts` | Un job de deploy que corre fuera de `main` → detectado | Rechazado | No aplica | G02-C01 |
| 9 | G02 · C044 | `g02-workflow-permissions.spec.ts` | Workflow o job con permisos de escritura innecesarios → detectado | Rechazado | No aplica | G02-C02 |
| 10 | G02 · C035 | `g02-publish-gate.spec.ts` | Publicar imágenes o mover `latest` sin tests verdes → detectado | Rechazado | No aplica | G02-C04 |
| 11 | G02 · VM0-F020 | `g02-deploy-dirty-checkout.spec.ts` | Copia de trabajo con cambios locales → el script de deploy aborta (ejecución real con git) | Rechazado | Repositorios temporales borrados | G02-C05 |
| 12 | G02 · FASE2-N07 | `g02-immutable-variants.spec.ts` | Build sin guarda de existencia o con tag literal → detectado; error de registro distinto de «not found» → aborta | Rechazado | Directorio temporal borrado | G02-C07 |
| 13 | G02 · C031/C043 | `g02-ci-quality-gates.spec.ts` | Gates de lint, typecheck o build condicionados u opcionales → detectado | Rechazado | No aplica | G02-C09…C12 |
| 14 | G02 · C047 | `g02-topology-harness.spec.ts` | Arnés que difiere de `infra/nginx` fuera de las sustituciones declaradas → falla | Rechazado | No aplica | G02-C17 |
| 15 | G03 · C041 | `g03-dependency-review.spec.ts` | Umbral `critical`, permisos de escritura, `continue-on-error` o job ausente → detectado | Rechazado | No aplica | G03-C01 |
| 16 | G03 · C040 | `g03-npm-audit-summary.spec.ts` | Credenciales de registry o tokens en la salida del audit → redactados | Rechazado | No aplica | G03-C02 |
| 17 | G03 · C046 | `g03-dependency-exceptions.spec.ts` | Excepción vencida, sin campo, fuera de horizonte u obsoleta → FAIL | Rechazado | No aplica | G03-C11 |
| 18 | G03 · C059 | `g03-jspdf-remediation.spec.ts` | Lectura de archivos locales por jsPDF → denegada por defecto | Rechazado | No aplica | G03-C10 |
| 19 | G04 · C022 | `g04-register-throttle.spec.ts` | Sexto registro por minuto → 429 | Rechazado | Servidor HTTP de prueba cerrado | G04-C01 |
| 20 | G04 · C023 | `g04-active-only-tokens.spec.ts` | Cuenta BLOQUEADO/INACTIVO con contraseña correcta → sin tokens, respuesta genérica | Rechazado | No aplica | G04-C03 |
| 21 | G04 · C024 | `g04-reset-atomic.spec.ts`, `password-recovery-admin.real-db.e2e.spec.ts` | Reset concurrente con el mismo token → uno falla y las sesiones se revocan (PostgreSQL real) | Rechazado | BD de integración desechable eliminada | G04-C04 |
| 22 | G04 · C036 | `g04-account-lockout.spec.ts` | Cinco fallos → la contraseña correcta se rechaza durante el bloqueo, sin enumeración | Rechazado | No aplica | G04-C06 |
| 23 | G04 · C021 | `g04-trust-proxy.spec.ts` | `TRUST_PROXY_HOPS` inválido → el backend no arranca y el deploy aborta | Rechazado | No aplica | G04-C08 |
| 24 | G04 · C021 | `g04-xff-spoof.spec.ts` + arnés T16 | `X-Forwarded-For` falso rotativo no evade el límite de login → 429 en el sexto intento | Rechazado | Arnés destruido (contenedores, volúmenes, TLS) | G04-C13 |
| 25 | G04 · C021 | `api-proxy-xff.spec.ts` | El proxy de Next reenvía la IP del cliente al backend → no la reenvía | Rechazado | No aplica | G04-C14 |
| 26 | G04 · P1/T13 | `g04-topology-t13.spec.ts` | Sin la ruta `/socket.io/` en nginx → T13 falla (fixture) | Rechazado | No aplica | G04-C12 |
| 27 | G06 · C039 | `security-headers-contract.spec.ts` | Falta o cambia una cabecera del frontend → detectado | Rechazado | No aplica | G06-C01 |
| 28 | G06 · C039 | `csp-mode.spec.ts`, `g06-csp-mode-deploy.spec.ts` | `CSP_MODE` inválido → build y deploy fallan | Rechazado | No aplica | G06-C05 |
| 29 | G06 · C008 | `g06-hsts.spec.ts` | HSTS con `preload` u otro valor → detectado | Rechazado | No aplica | G06-C06 |
| 30 | G06 · C049 | `g06-cookie-secure.spec.ts` | `COOKIE_SECURE` con un valor distinto de true/false → el backend no arranca | Rechazado | No aplica | G06-C07 |
| 31 | G06 · T18 | `g06-topology-tls.spec.ts` | Cookies de sesión sin Secure/HttpOnly/SameSite → detectado (fixture; la corrida real es T18 en el arnés) | Rechazado | No aplica; el arnés se destruye al terminar | G06-C08 |
| 32 | G06 · C039 | `csp-violations.spec.ts`, `csp-violaciones.spec.ts` | Una violación de CSP inesperada en el navegador → se captura y falla | Rechazado | Navegador de Playwright cerrado | G06-C09 |
| 33 | G06 · NBD-1 | `g06-tls-expiry-probe.spec.ts` | Certificado vencido o por vencer → ALERT/EXPIRED | Rechazado | Certificados sintéticos en un directorio temporal borrado | G06-C10 |
| 34 | G05 · C026 | `g05-audit-redaction.spec.ts` | Claves sensibles anidadas, en arrays o con acentos → redactadas; el fixture con la lógica previa filtraba | Rechazado | No aplica | G05-C01 |
| 35 | G05 · C037 | `g05-security-event-writer.spec.ts` | Falla del almacenamiento del evento → sin excepción ni fuga de datos en el log | Rechazado | No aplica | G05-C03 |
| 36 | G05 · C037 | `g05-auth-security-events.spec.ts` | Login de una cuenta inexistente → el evento no guarda el correo (referencia seudónima) | Rechazado | No aplica | G05-C04 |
| 37 | G05 · C037 | `g05-password-reset-events.spec.ts` | Token de reset reutilizado → sin evento de reset completado ni token en el detalle | Rechazado | No aplica | G05-C06 |
| 38 | G05 · C037 | `g05-security-event-visibility.integration.spec.ts` | Eventos de seguridad pedidos por la bitácora de proyecto → 400 / 0 filas (PostgreSQL real) | Rechazado | BD de integración desechable eliminada | G05-C08 |
| 39 | G05 · C038 | `g05-security-alerts.spec.ts` | Ráfaga con el flag apagado o bajo el umbral → ninguna notificación | Rechazado | No aplica | G05-C12 |
| 40 | G07 · C025 | `g07-ws-auth-policy.spec.ts`, `g07-notifications-gateway-auth.spec.ts`, `g07-chat-gateway-auth.spec.ts` | Token de reset o refresh, cuenta BLOQUEADO/INACTIVO, token inválido → el socket no conecta | Rechazado | No aplica | G07-C01…C03 |
| 41 | G07 · C025 | `g07-topology-t14.spec.ts` + arnés T14 | Por nginx, token de reset o refresh, o cuenta bloqueada con el socket abierto → no conecta o se desconecta | Rechazado | Arnés destruido; 0 secretos en el log | G07-C12 |
| 42 | G07 · C027 | `g07-url-validation.spec.ts` | `javascript:`, `data:`, `vbscript:`, `file:` y variantes con espacios o controles en los 5 campos URL → 400 | Rechazado | No aplica | G07-C08 |
| 43 | G07 · C027 | `safe-links.spec.tsx` | Dato heredado peligroso en el perfil → texto inerte, sin href | Rechazado | No aplica | G07-C09 |
| 44 | G07 · C006/C007 | `html-sink-guard.spec.ts`, `g07-raw-sql-guard.spec.ts` | Un `dangerouslySetInnerHTML` o un `$executeRawUnsafe` nuevo → el guard falla | Rechazado | No aplica | G07-C10 |
| 45 | G07 · VM1-N06 | `g07-csv-formula-neutralization.spec.ts` | Celdas que empiezan con `=`, `+`, `-`, `@`, TAB o CR → neutralizadas | Rechazado | No aplica | G07-C11 |
| 46 | G07 · P2 | `g07-public-api-url-variant.spec.ts` | `PUBLIC_API_URL` con un valor no permitido → la variante aborta antes de construir | Rechazado | Directorio temporal borrado | G07-C07 |
| 47 | G08 · C048 | `g08-security-docs.spec.ts` | IP, correo, token, clave privada, valor de cookie, comando privilegiado o ruta interna en `docs/security` → detectado | Rechazado | No aplica | G08-C01 |
| 48 | G08 · C048 | `g08-delta-allowlist.spec.ts` | Ruta funcional ajena → no cubierta por la allowlist | Rechazado | No aplica | G08-C02 |
| 49 | G08 · C048 | `g08-owasp-delta-verifier.spec.ts`, `g08-ci-delta.spec.ts` | Ruta fuera de la allowlist, commit sin trazabilidad, ID duplicado o base inexistente → `OWASP_DELTA_ISOLATED=FAIL` | Rechazado | Repositorios Git sintéticos borrados | G08-C03, G08-C04 |
