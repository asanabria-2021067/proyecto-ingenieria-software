# Sprint 10 · Trazabilidad de cumplimiento tras el gate final de correcciones

Ponderación (la misma de la auditoría final): funcionalidad 40, pruebas propias en verde 30, integración 15, UI/UX y accesibilidad 15. Si un criterio obligatorio está incumplido, la tarea no puede ser PASS aunque su puntuación sea alta. Una tarea solo pasa a PASS con verificación ejecutada.

| Tarea | Antes (auditoría) | Después (gate) | Evidencia | Pendiente |
|---|---|---|---|---|
| T-361 · E2E de navegación y creación | PARTIAL 85 % | **PASS 100 %** | `calendario-eventos` 17/17 aislado y en la suite completa; el selector de fechas ya no depende del día de ejecución | — |
| T-364 · La reunión aparece y avisa (pruebas asociadas) | PASS 100 % | **PASS 100 %** | `account-settings` 9/9; nueva verificación de los tres tipos de reunión y de su persistencia | — |
| T-365 · Pruebas de servicio y E2E de creación | PARTIAL 90 % | **PASS 100 %** | Backend unitario 4694/4694 (antes 4692/4693); integración 458/458; contrato con `projectTeam` y protección de clase verificada | — |
| T-367 · Sustituir botones propios | PARTIAL 92 % | **PARTIAL ≈ 93 %** | 30 botones migrados (B01–B30); 371 `<Button>` frente a 207 nativos (antes 351 / 234); frontend 4856/4856 | Quedan unos 30 nativos con estilo propio fuera del inventario de la auditoría, y la familia «Ver perfil / Ver detalle / Limpiar» de administración, que hay que migrar en bloque |
| T-368 · Contraste ≥ 4.5:1 | PARTIAL 95 % | **PARTIAL ≈ 90 % · PENDIENTE DE CORRECCIÓN** | Los 30 pares `tag-*` cumplen. H-07 (`review`, 2.36:1) sin corregir por decisión expresa. Nuevo H-15 (pill animada, hasta unos 1.2:1) | Aplicar la alternativa aprobada (ver `t368-plan-correccion.md`) |
| T-369 · Regla de contraste de axe en pantallas con etiquetas | PARTIAL 90 % | **PASS 100 %** | Cobertura ampliada de 5 a 8 pantallas, en claro y oscuro (16 casos); reglas WCAG A/AA sin exclusiones; detecta los dos defectos de T-368 | Sus dos casos en rojo son defectos de T-368, no de la regla |
| T-370 · Bandeja: agrupación, filtros, marcar todo | PARTIAL 95 % | **PASS 100 %** | `notificaciones-bandeja` 8/8 en la suite completa y 40/40 en 5 repeticiones; menciones a través del visor | Riesgo: `menciones-comentarios` intermitente bajo carga (pasa aislado y al repetir) |
| T-371 · Estados vacío y carga, teclado y lector | PARTIAL 90 % | **PASS 100 %** | `estados-carga` 19/19 aislado; vacío con `aria-live` y error con `role=alert` y «Reintentar» verificados | — |

Sin cambios en este gate, con su estado de la auditoría: T-359, T-360, T-362, T-363 y T-366 (PASS 100 %).

**Cumplimiento agregado de las 13 tareas de VC:** (11 × 100 + 93 + 90) / 13 ≈ **98.7 %**.
- 11 tareas en PASS y 2 en PARTIAL (T-367 y T-368).
- Ninguna en FAIL, BLOCKED ni NOT VERIFIED.

## Cómo se calculó T-367

Porcentaje = `<Button>` / (`<Button>` + nativos con aspecto de acción todavía propios) = 371 / (371 + ~30) ≈ 93 %. La cifra de nativos restantes sale de un barrido más amplio que la heurística de la auditoría (relleno o borde con padding propio), excluidas las excepciones justificadas:
- el bloque del calendario;
- el disparador del menú de cuenta;
- el contador del hito;
- el icono de borrar comentario;
- el CTA decorativo de la landing.

## Fuera del alcance personal

- **T-372** está asignada a SA y sigue fuera del alcance: no se cuenta en las tareas de VC. Sin su entrega, HU-198 no puede cerrarse globalmente.
- **T-368** sigue pendiente de implementación. No se declara PASS ni 100 %.
