# Sonda de expiración TLS (G06-C10 · NBD-1)

`cert-expiry-probe.mjs` es una herramienta **de solo lectura**: obtiene `notAfter` de un certificado (archivo PEM o handshake TLS) y devuelve:

| Estado | Condición | Salida |
|---|---|---|
| `OK` | quedan 21 días o más | 0 |
| `ALERT` | quedan **menos de 21 días** | 1 |
| `EXPIRED` | ya caducó | 1 |
| `ERROR` | no se pudo leer o interpretar la fecha | 2 |

```bash
node infra/tls/cert-expiry-probe.mjs --file ./fullchain.pem
node infra/tls/cert-expiry-probe.mjs --host <host> --port 443 --threshold-days 21
```

Por qué existe: la API emite HSTS (`max-age=31536000; includeSubDomains`, G06-C06). Con HSTS activo un certificado vencido deja el sitio inaccesible para los navegadores que ya lo visitaron, sin opción de saltarse el error. La sonda da el aviso con margen para renovar.

## Límites

- Nunca modifica, renueva, instala ni borra certificados; no necesita privilegios.
- En este repositorio solo se prueba con certificados **sintéticos** generados y destruidos por los tests (`apps/backend/test/g06-tls-expiry-probe.spec.ts`).
- Ejecutarla o programarla contra el certificado de producción (cron, systemd o un workflow) corresponde al **Gate Admin** (`09_GATE_ADMIN_HANDOFF_OWASP_2025.md`): `OUT_OF_SCOPE_ADMIN_HANDOFF` para G06.
