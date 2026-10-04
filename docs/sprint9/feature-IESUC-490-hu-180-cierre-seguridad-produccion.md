# HU-180 — Cierre de seguridad en producción

Rama: `feature/IESUC-490-hu-180-cierre-seguridad-produccion`

Esta rama contiene **solo las subtareas de Angel** (T-308, T-309, T-311).
T-310 (visor de eventos, Vernel) y T-312 (actualizar
`docs/security/owasp-top10-2025.md`, Samuel) se quitaron: cada quien las
agrega con sus propios commits — ninguna de las dos depende del código de
esta rama.

## T-308 — Protección de ramas develop y main

Verificado vía `gh api` (no ejecutado por mí, es tarea manual en GitHub
Settings → Rules):

- Existen rulesets llamados `develop` (id 14616829) y `main` (id 12281716).
- **Ambos siguen con `enforcement: disabled`.** Un push directo a `develop` o
  `main` hoy NO se rechaza. Falta habilitarlos (exigir PR + checks de
  `ci.yml` en verde + 1 aprobación + bloqueo de force-push) y tomar la
  captura para el informe.

## T-309 — Cerrar puertos, CSP enforce, alertas de seguridad en la VM

Todo esto es configuración de la VM y de GitHub Variables — **no genera
cambios versionables en el repo** (`.env.example` ya documentaba
`BACKEND_BIND`, `FRONTEND_BIND`, `TRUST_PROXY_HOPS`, `SECURITY_ALERTS_ENABLED`
y `CSP_MODE` con sus valores por defecto antes de esta tarea; lo que cambió
son los valores reales en la VM y en GitHub, no el código). Evidencia:

1. **Binds loopback:** `.env` de la VM (`~/proyecto-ingenieria-software/.env`,
   backup previo `.env.bak-20261004-0802`) → `BACKEND_BIND=127.0.0.1`,
   `FRONTEND_BIND=127.0.0.1`. Contenedores recreados
   (`docker compose --profile app up -d --no-deps --no-build backend
   frontend`). Verificado: `curl` directo a `http://158.23.57.118:3000` y
   `:3001` ya no responde desde fuera; el sitio y Socket.IO siguen
   funcionando normal vía nginx.
2. **TRUST_PROXY_HOPS=1:** aplicado después de cerrar los puertos. Backend
   recreado, arrancó sano; login vía nginx responde 401 esperado (no 500).
3. **SECURITY_ALERTS_ENABLED=true:** aplicado en el `.env` de la VM. La
   migración `ALERTA_SEGURIDAD`
   (`20260927230000_security_alert_notification_type`) ya estaba aplicada en
   producción antes de esta tarea (`prisma migrate status` mostraba las 50
   migraciones al día) — no hizo falta `pg_dump` previo a una migración
   porque no se corrió ninguna.
4. **CSP_MODE=enforce:** GitHub Variable seteada (`gh variable set
   CSP_MODE enforce`). Es build-time del frontend (nueva variante inmutable
   de imagen): toma efecto en el próximo deploy desde `main`. **No se pudo
   verificar visualmente "que no se rompa nada"** porque eso exige ese
   deploy — queda pendiente para quien mezcle a `main`.
