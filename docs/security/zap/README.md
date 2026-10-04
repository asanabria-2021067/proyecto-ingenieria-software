# OWASP ZAP — escaneo baseline de producción (T-311)

Fecha: 2026-10-04. Objetivo: `https://158.23.57.118.nip.io`. Herramienta: `zaproxy/zap-stable` (Docker), `zap-baseline.py` (spider pasivo de 1 minuto + reglas pasivas; sin ataque activo).

Reporte completo: `zap-baseline-158.23.57.118.nip.io-20261004.html`.

## Resultado

```
FAIL-NEW: 0   FAIL-INPROG: 0   WARN-NEW: 8   WARN-INPROG: 0   INFO: 0   IGNORE: 0   PASS: 59
```

**Cero hallazgos altos o fallidos.** Los 8 "WARN" se agrupan en 3 reglas:

### 1. CSP: Failure to Define Directive with No Fallback (×20 URLs)

**Causa real:** en el momento del escaneo, la VM seguía con `CSP_MODE=report-only` (comportamiento previo a esta tarea): la cabecera `Content-Security-Policy` **aplicada** solo trae `frame-ancestors 'none'`; la política completa (que sí define `default-src 'self'` como fallback — ver `apps/frontend/lib/security/csp.ts`) viaja únicamente en `Content-Security-Policy-Report-Only`, que ZAP no evalúa como aplicada.

**Estado:** ya en vía de resolverse — esta misma tarea (T-309) dejó la GitHub Variable `CSP_MODE=enforce` seteada; se aplicará en el próximo build/deploy desde `main`. No se requiere cambio de código adicional. Pendiente: re-correr este escaneo después de ese deploy para confirmar que la regla ya no aparece.

### 2. Modern Web Application (×5 URLs)

Alerta informativa de ZAP (nivel WARN en el baseline) que recomienda usar el spider Ajax/moderno porque detectó una SPA. No es una vulnerabilidad — es una sugerencia de metodología de escaneo. **Aceptado sin acción de código.** Las URLs donde aparece son además artefactos del spider sobre `next/image` (ver más abajo).

### 3. Cross-Origin-Embedder-Policy Header Missing or Invalid (×9)

El backend (Helmet) y el frontend no envían `Cross-Origin-Embedder-Policy`. Ese header solo importa para aislar el origen cuando la app usa APIs que requieren "cross-origin isolation" (p. ej. `SharedArrayBuffer`, `performance.measureUserAgentSpecificMemory`) — UVG Collab no usa ninguna. Activarlo sin necesidad puede romper la carga de imágenes de Cloudinary (que no envían `Cross-Origin-Resource-Policy`) sin ganar protección real. **Aceptado (`RESIDUAL_CODE_RISK`), sin owner nuevo** — revisar si el frontend empieza a usar Web Workers con memoria compartida.

### Ruido del spider (no son hallazgos)

Varias URLs reportadas en 404 (`robots.txt`, rutas con `%2F` y query strings de `next/image` tipo `...jpg&w=384&q=75`) son el spider de ZAP mal-parseando atributos `srcset`/`sizes` de `next/image` como URLs completas, no asset reales de la app. El backend/frontend responde 404 limpio a esas URLs (sin stack trace, sin información sensible) — comportamiento correcto, no se actúa.

## Qué NO se corrigió y por qué

No hay hallazgos "altos" ni "medios" reales que corregir: los 3 WARN son, en orden, (1) ya resuelto por el cambio de configuración de T-309 pendiente de deploy, (2) metodológico, (3) un header de aislamiento que no aplica a esta arquitectura. `docs/security/owasp-top10-2025.md` ya trae R2 (CSP `unsafe-inline`) como riesgo residual conocido; no se duplica aquí.

## Pendiente

- Re-correr este mismo escaneo contra producción después de que el deploy desde `main` aplique `CSP_MODE=enforce`, para confirmar 0 WARN de CSP.
