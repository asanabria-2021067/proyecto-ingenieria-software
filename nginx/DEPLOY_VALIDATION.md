# T-71: Validación del Deploy — Azure + Nginx

## Arquitectura esperada

```
Internet
   │
   ▼
[Azure VM — IP: 158.23.57.118]
   │
[Nginx :80]
   ├── /api/*  → NestJS  :3001
   └── /*      → Next.js :3000
```

---

## 1. Instalar y activar Nginx en el servidor

```bash
# Instalar Nginx
sudo apt update && sudo apt install -y nginx

# Copiar configuración
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Validar que la config no tiene errores de sintaxis
sudo nginx -t

# Recargar (sin downtime)
sudo nginx -s reload

# Habilitar inicio automático
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 2. Verificar puertos abiertos en la VM

```bash
# Verificar qué está escuchando en los puertos clave
sudo ss -tlnp | grep -E '80|3000|3001'

# Resultado esperado:
# LISTEN  0.0.0.0:80    → nginx
# LISTEN  0.0.0.0:3000  → node (Next.js)
# LISTEN  0.0.0.0:3001  → node (NestJS)
```

---

## 3. Verificar conectividad desde fuera del servidor

### Puerto 80 — Nginx (HTTP)
```bash
# Desde tu máquina local:
curl -v http://158.23.57.118/

# Respuesta esperada: HTTP/1.1 200 OK con HTML del frontend
```

### Puerto 3001 — Backend API (NO debe ser público)
```bash
# Desde fuera del servidor NO debería responder (bloqueado por NSG de Azure)
curl --max-time 5 http://158.23.57.118:3001/api/
# Esperado: Connection timed out o Connection refused

# Desde DENTRO del servidor sí debe responder:
curl http://localhost:3001/api/
```

### Puerto 3000 — Frontend (NO debe ser público)
```bash
# Desde fuera tampoco debería estar expuesto directamente
curl --max-time 5 http://158.23.57.118:3000/
# Solo debería ser accesible mediante Nginx en el puerto 80
```

---

## 4. Verificar el reverse proxy

```bash
# Comprobar que /api apunta al backend
curl -v http://158.23.57.118/api/

# Respuesta esperada: JSON de NestJS (ej. 404 "Cannot GET /api/")
# Eso confirma que llegó al NestJS, no al frontend

# Probar un endpoint real del backend
curl http://158.23.57.118/api/proyectos
# Respuesta esperada: array JSON de proyectos publicados

# Probar login
curl -X POST http://158.23.57.118/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"test@test.com","contrasena":"test123"}'
```

---

## 5. Verificar reglas de red en Azure (NSG)

En el portal de Azure → VM → Networking, asegúrate de que:

| Puerto | Protocolo | Dirección | Estado  | Motivo                     |
|--------|-----------|-----------|---------|----------------------------|
| 80     | TCP       | Inbound   | ALLOW   | HTTP (Nginx)               |
| 443    | TCP       | Inbound   | ALLOW   | HTTPS (futuro)             |
| 22     | TCP       | Inbound   | ALLOW   | SSH (restringir a tu IP)   |
| 3000   | TCP       | Inbound   | DENY    | Solo acceso interno        |
| 3001   | TCP       | Inbound   | DENY    | Solo acceso interno        |

---

## 6. Verificar logs de Nginx

```bash
# Ver últimas líneas del log de acceso
sudo tail -f /var/log/nginx/access.log

# Ver errores (útil para depurar 502 Bad Gateway)
sudo tail -f /var/log/nginx/error.log

# Error 502: el backend/frontend no está corriendo → verificar docker-compose
sudo docker compose ps
sudo docker compose logs backend --tail=50
sudo docker compose logs frontend --tail=50
```

---

## 7. Problemas comunes y soluciones

| Error | Causa probable | Solución |
|-------|---------------|----------|
| `502 Bad Gateway` | NestJS o Next.js no están corriendo | `docker compose up -d` |
| `504 Gateway Timeout` | El servicio tarda demasiado | Revisar logs del servicio, aumentar `proxy_read_timeout` |
| `Connection refused` en curl | Puerto no expuesto en NSG de Azure | Agregar regla Inbound en el NSG |
| `nginx: [emerg]` al validar config | Error de sintaxis en nginx.conf | Revisar el error específico con `nginx -t` |
| CORS errors en el browser | `proxy_set_header Host` mal configurado | Verificar que el backend lee `$host` correctamente |
| `403 Forbidden` | Permisos de archivo en el servidor | `sudo chown -R nginx:nginx /var/www` |

---

## 8. Healthcheck rápido (script)

```bash
#!/bin/bash
# Guardar como: scripts/healthcheck.sh
# Ejecutar: bash scripts/healthcheck.sh

IP="158.23.57.118"

echo "=== Healthcheck UVG Collab ==="

# Frontend
STATUS_FRONT=$(curl -s -o /dev/null -w "%{http_code}" http://$IP/)
echo "Frontend  (GET /)            → HTTP $STATUS_FRONT"

# API pública
STATUS_API=$(curl -s -o /dev/null -w "%{http_code}" http://$IP/api/proyectos)
echo "Backend   (GET /api/proyectos) → HTTP $STATUS_API"

# Destacados
STATUS_DEST=$(curl -s -o /dev/null -w "%{http_code}" http://$IP/api/proyectos/destacados)
echo "Destacados (GET /api/proyectos/destacados) → HTTP $STATUS_DEST"

echo "================================"
[ "$STATUS_FRONT" = "200" ] && [ "$STATUS_API" = "200" ] && echo "OK: Sistema operativo" || echo "FALLO: Revisar logs"
```
