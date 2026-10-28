# Sprint 10 · Matriz de regresiones del gate final de correcciones

Referencia: auditoría final del Sprint 10, hecha sobre `ba8e7498`.
- Gate ejecutado sobre `8a204b8d`.
- Pruebas finales sobre `92dae9bf`, en la pila E2E aislada con base recién creada.

## Defectos corregidos

| Hallazgo | Tarea | Archivos | Pruebas relacionadas | Evidencia | Resultado |
|---|---|---|---|---|---|
| H-01 · Contrato de rutas de reuniones desactualizado | T-365 | `apps/backend/test/events.module.spec.ts` | Backend Vitest | `155b5b90`, `a7356190` | Backend unitario 4694/4694 |
| H-02 · E2E nocturno y de medianoche dependientes de la fecha | T-361 | `apps/frontend/e2e/calendario-eventos.spec.ts`, `e2e/support/calendario.ts` | `calendario-eventos` (17) | `3b487e89`, `846e16ad`, `4292a4ec`, `58e7e5f7` | 17/17 |
| H-03 · Recuento de preferencias desactualizado | T-364 | `apps/frontend/e2e/account-settings.spec.ts` | `account-settings` (9) | `7a7423cc`, `ec181ede`, `f7abfcfb` | 9/9 |
| H-04 · Texto del estado vacío | T-371 | `apps/frontend/e2e/estados-carga.spec.ts` | `estados-carga` (19) | `6b20f676`, `f4928ebc`, `ea52e52a`, `b1480ada` | 19/19 aislado; ver riesgos |
| H-05 · Mención desde la bandeja | T-370 | `apps/frontend/e2e/menciones-comentarios.spec.ts` | `menciones-comentarios` | `8b53bee3`, `5661989d` | Pasa aislado (×2) y al repetir; intermitente en la suite completa |
| H-06 · Bandeja: 429 sin reintento | T-370 | `apps/frontend/e2e/notificaciones-bandeja.spec.ts` | `notificaciones-bandeja` (8) | `29510cab`, `10749464`, `e7a68590` | 40/40 en 5 repeticiones; verde en la suite completa |
| H-08 · Botones de acción propios | T-367 | 16 archivos de `app/` y `components/` | Vitest de cada archivo, diseño admin, ESLint, `tsc`, capturas | B01–B30 (30 commits) | Frontend 4856/4856 |
| H-09 · Cobertura de axe incompleta | T-369 | `apps/frontend/e2e/accesibilidad.spec.ts` | `accesibilidad` (16) | `59f6bbec`, `4749328c`, `a8b5a326`, `e61ce06c` | 14/16. Los 2 rojos son T-368 (aplazada) |
| Adicional · Menú de cuenta medido a mitad de su animación | — | `apps/frontend/e2e/account-settings.spec.ts` | `account-settings` | `256f710e` | 6/6 repetido; verde en la suite completa |

## Cambios de compatibilidad en pruebas de otros integrantes

| Prueba | Autor original | Motivo | Commits |
|---|---|---|---|
| `e2e/estados-carga.spec.ts` | llAkihitoll (`9ea5d580`) | El rediseño de la bandeja (S10) cambió el texto del estado vacío a «Todo está al día» | `6b20f676`, `f4928ebc`, `ea52e52a`, `b1480ada` |
| `e2e/menciones-comentarios.spec.ts` | dcoronado91 (`bcd4a4f4`) | La fila de la bandeja (S10) dejó de ser enlace: se lee en el visor y se abre con «Ver comentario» | `8b53bee3`, `5661989d` |

En ambos casos solo se adaptó lo necesario y el historial original se conserva. La interfaz actual es la referencia.

## Defectos aplazados (no corregidos en este gate)

| Hallazgo | Tarea | Motivo | Efecto en las pruebas |
|---|---|---|---|
| H-07 · Estado «revisión» a 2.36:1 en claro | T-368 | Corrección de color aplazada a una decisión de diseño | axe `solicitudes-publicacion` (claro) en rojo, reproducible |
| H-15 · Pill animada «En solicitud de cierre» con fotogramas de hasta unos 1.2:1 | T-368 | Igual que H-07 | axe `mis-proyectos` (claro) en rojo; depende del fotograma medido |

Detalle y plan: [t368-contraste-estado-revision.md](t368-contraste-estado-revision.md) y [t368-plan-correccion.md](t368-plan-correccion.md).

## Riesgos restantes

- **E2E intermitentes en la suite completa.** Fallaron una vez y pasaron al repetirlos en la misma pila:
  - `actividades-asistencia:101` (horas 14 en lugar de 15.5): ya era intermitente en la auditoría.
  - `estados-carga:139` (error de «proyectos disponibles» no visible en 20 s).
  - `menciones-comentarios:16`: agota los 90 s con errores del backend reintentados.

  Sin causa raíz demostrada en este gate.
- **`notificaciones-bandeja`** se salta sobre una base recién creada si se ejecuta sola: la cuenta no tiene avisos y el `test.skip` condicional es preexistente. En la suite corre porque otras pruebas generan avisos.
- **T-367.** Quedan unos 30 `<button>` nativos con estilo propio fuera de los 30 migrados. Sobre todo son la familia «Reintentar / limpiar» de estados vacíos, que ya usa las clases de movimiento, y las fichas admin. Además, «Ver perfil» de usuarios se conserva nativo porque es la referencia de una familia de tres botones fijada por `test/admin-security-filters.spec.tsx`.
- **T-372 (SA)** sigue fuera del alcance.
