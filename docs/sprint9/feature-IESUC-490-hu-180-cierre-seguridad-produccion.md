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
