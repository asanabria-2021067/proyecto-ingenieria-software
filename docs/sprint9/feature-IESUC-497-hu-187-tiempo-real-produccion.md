# HU-187 — Chat y notificaciones en tiempo real en producción

Rama: `feature/IESUC-497-hu-187-tiempo-real-produccion`

## T-332 — Socket por el mismo origen cuando la página es https

- `apps/frontend/lib/realtime/socket-url.ts`: cuando la página es `https:` y
  `NEXT_PUBLIC_API_URL` quedó horneada en `http:` (caso de producción con la
  variante `direct`), ahora devuelve `page.origin` en vez de `wss://<host de
  la API>` — ese host (IP:3001) no tiene TLS y la cookie `access_token` del
  dominio nip.io no viajaría.
- `apps/frontend/test/realtime-same-origin.spec.ts`: actualizado para
  esperar `page.origin` en ese caso; el resto de casos (API ya https, sin
  variable, página http) no cambia.
- VM: aplicado P1 en `/etc/nginx/sites-enabled/uvg-collab` (location
  `/socket.io/`, upstreams `127.0.0.1`). Ver sección "Cambios en la VM".
- GitHub Actions Variable `PUBLIC_API_URL` puesta en `same-origin`: el
  próximo build desde `main` hornea `NEXT_PUBLIC_API_URL=''` y ya no la IP.
  Con el fix de T-332, la variante `direct` actual también queda corregida
  (detecta el mismatch http/https), pero `same-origin` es la forma limpia
  de no quemar la IP, pedida en el prompt.

## T-333 — Indicador de conexión y recarga al reconectar

- `apps/frontend/lib/hooks/useRealtimeNotifications.ts`: `handleConnect`
  ahora invalida `['notificaciones']` y `['notificaciones', 'conteo']` (el
  indicador de notificaciones ya existía en `DashboardLayout.tsx`, de un
  trabajo previo — no se duplicó).
- `apps/frontend/hooks/use-chat.ts` (`useGlobalChatSocket`): `handleConnect`
  ahora invalida `['chats-global']` y los mensajes de las conversaciones con
  ventana abierta, antes de re-unirse a sus rooms.
- `apps/frontend/components/chat-dock/chat-dock.tsx`: nuevo indicador
  (`role="status"`, punto verde/ámbar) junto al botón "Mensajes" del dock,
  igual criterio visual que el de notificaciones.
- Pruebas: `test/use-chat.spec.ts` y `test/use-realtime-notifications.spec.ts`
  (reconexión invalida las queries correctas).
