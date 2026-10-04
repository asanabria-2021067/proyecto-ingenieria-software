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

## T-334 — E2E de tiempo real

- Nuevo `apps/frontend/e2e/realtime-notificacion.spec.ts`: dos contextos de
  Playwright (carlos.mendoza líder, maria.lopez asignada activa a la tarea 1
  del seed). Carlos comenta la tarea; María ve el toast "Nuevo comentario"
  sin recargar — recipient real de `COMENTARIO_TAREA` según
  `getTaskCommentRecipientIds`.
- El E2E de mensaje de chat (`chat-mensajeria.spec.ts`) ya existía (Fase 3.3)
  y cubre el otro flujo pedido (mensaje sin recargar); no se duplicó.
- Corrido localmente contra un stack de dev (postgres/redis en Docker,
  backend `start:dev`, frontend `next dev`, seed aplicado): mi test nuevo
  pasa. `chat-mensajeria.spec.ts` falló en este entorno ad-hoc por una
  condición de carrera no relacionada con este cambio (quedó en pantalla de
  login tras reusar una cookie cacheada vencida de una corrida anterior al
  27-sep.; al limpiar `.auth-cache` sigue fallando de forma intermitente en
  este entorno local de un solo proceso, no en el "servidor de dev
  compartido de CI" para el que está escrito — ver sus propios comentarios
  sobre contención). **Pendiente:** correrlo en CI y en `infra/staging` como
  pide la subtarea 3; no se forzó aquí para no enmascarar un posible flake
  real con reintentos.

## Cambios en la VM (158.23.57.118)

1. Backup fechado: `/etc/nginx/sites-enabled/uvg-collab.bak-20261004-0753`.
