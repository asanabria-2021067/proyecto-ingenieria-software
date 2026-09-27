# Deuda técnica — cierre Sprint 8, para Sprint 9

- **Paginación de bitácora por offset**: vulnerable a duplicados/saltos con inserciones
  concurrentes. Cambiar a cursor es riesgoso a 2 días de la entrega; va a Sprint 9.
- **`jspdf` con vulnerabilidad crítica**: requiere cambio mayor de versión en funcionalidad ya
  entregada (exportación PDF, HU-164).
- **Límites de memoria por contenedor (T-212)**: no se aplican; los 4 contenedores usan 91 MiB de
  los 842 de la VM, sin registro de OOM kill (medición en T-213).
- **HU-158 — "Mis horas" vs. dashboard**: ambos totales de horas de beca salen del mismo cálculo
  (`UsersService.getDashboard`, agregado sobre `horasParticipacion` filtrado por
  `estadoHoras: 'APROBADA'`), pero no hay una prueba que compare explícitamente el valor mostrado
  en "Mis horas" contra el del dashboard. No se agregó en este PR por tiempo; queda para Sprint 9.
- **Auditoría de confirmaciones de UI (HU-155/T-222) más allá de lo revisado en este paso**: los
  cuatro ejemplos señalados originalmente en la revisión (eliminar, cerrar sprint, quitar
  integrante, rechazar postulación) ya existían en la rama base antes de este paso, no se
  agregaron acá. Este paso sumó confirmación y aviso de resultado en dos destructivas encontradas
  al revisar (eliminar comentario de tarea, quitar evidencia de cierre) y, en una revisión cruzada
  posterior (T-210), en eliminar amistad y aceptar/rechazar solicitud de amistad
  (`/dashboard/personas`), que tampoco los tenían. El resto del catálogo de acciones destructivas
  del producto no se auditó exhaustivamente por tiempo — revisar con Angel si hace falta una
  pasada completa en Sprint 9.
- **Cookies de sesión sin `Secure` en producción**: `secure` de `access_token`/`refresh_token`
  sigue el flag `COOKIE_SECURE` (default `false`) y el despliegue actual (`deploy.yml`) no lo fija
  ni sirve por HTTPS, así que hoy viajan sin cifrar. `docs/seguridad/revision-auth.md` lo explica
  y lo justifica pero no lo registraba como deuda. Pendiente: TLS en el despliegue +
  `COOKIE_SECURE=true`.
