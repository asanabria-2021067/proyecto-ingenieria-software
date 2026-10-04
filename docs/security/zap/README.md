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
