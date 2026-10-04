# HU-187 — Chat y notificaciones en tiempo real en producción

Rama: `feature/IESUC-497-hu-187-tiempo-real-produccion`

## T-332 — Socket por el mismo origen cuando la página es https

- `apps/frontend/lib/realtime/socket-url.ts`: cuando la página es `https:` y
  `NEXT_PUBLIC_API_URL` quedó horneada en `http:` (caso de producción con la
  variante `direct`), ahora devuelve `page.origin` en vez de `wss://<host de
  la API>` — ese host (IP:3001) no tiene TLS y la cookie `access_token` del
  dominio nip.io no viajaría.
