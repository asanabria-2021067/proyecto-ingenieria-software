# Sprint 10 · Cierre técnico del gate final de correcciones

## Estado Git

- **Rama y base:** `sprint10/vernel-workstream`, partiendo de `8a204b8d`.
- **Commits del gate:** todos locales, sin push, merge ni rebase.
  - 30 de botones (B01–B30), uno por botón.
  - El resto, de correcciones, pruebas y documentación.
  - La lista completa con SHA está en el informe externo `AUDITORIA_CORRECCIONES_FINALES_SPRINT10_UVGENIUS.md`.
- **Código:** las pruebas finales se ejecutaron sobre `92dae9bf`. Todo lo posterior es documentación en `docs/qa/sprint10/`, sin cambios de código.

## Resultados de las pruebas (26-oct-2026, ejecución secuencial)

| Suite | Resultado |
|---|---|
| Frontend · Vitest | 306/306 archivos, **4856/4856** |
| Frontend · `tsc --noEmit` | exit 0 |
| Frontend · ESLint | exit 0 |
| Frontend · build (`next build`, en la pila aislada) | exit 0 |
| Backend · Vitest unitario | 272/272 archivos, **4694/4694** (antes 4692/4693) |
| Backend · `nest build` | exit 0 |
| Backend · ESLint | exit 0 |
| Backend · `prisma validate` | válido |
| Backend · integración PostgreSQL (base desechable) | 78/78 archivos, **458/458** |
| Playwright · suite completa (pila aislada, 1 worker, base recién creada) | 260 pruebas: **255 pasan y 5 fallan** |

Los 5 fallos de Playwright, al repetirlos sobre la misma pila:

| Prueba | Al repetir | Clasificación |
|---|---|---|
| `accesibilidad` › `solicitudes-publicacion` (claro) | Falla | Defecto conocido de T-368 (H-07), aplazado |
| `accesibilidad` › `mis-proyectos` (claro) | Falla | Defecto de T-368 (H-15), aplazado |
| `actividades-asistencia:101` | Pasa | Intermitente (ya lo era en la auditoría) |
| `estados-carga:139` (error de proyectos disponibles) | Pasa | Intermitente |
| `menciones-comentarios:16` | Pasa | Intermitente bajo carga (errores del backend reintentados) |

Línea base de la auditoría: 246/254 a la primera, con 6 fallos reproducibles. Ahora no queda ningún fallo reproducible fuera de T-368.

## Accesibilidad

- La puerta de axe cubre 8 pantallas en claro y en oscuro (16 casos), con las reglas WCAG 2.0/2.1 A y AA (incluida `color-contrast`) y sin exclusiones.
- Pasan 14 casos. Los 2 en rojo son T-368 y quedan así a propósito hasta que se apruebe la corrección de color.

## Botones estandarizados

- **30 migrados** al componente `Button` (B01–B30), cada uno en su commit, conservando su color, radio, tamaño, iconos y estados (deshabilitado y carga).
- Usos: 371 `<Button>` frente a 207 `<button>` nativos (antes 351 / 234).
- Capturas de 8 pantallas en 3 tamaños × 2 temas, sin errores de render ni desborde horizontal.

## Hallazgos abiertos

| Hallazgo | Estado |
|---|---|
| H-07 y H-15 (T-368) | Pendientes de una decisión de diseño. Ver `t368-plan-correccion.md` |
| T-367 | Quedan unos 30 botones nativos con estilo propio y la familia «Ver perfil» de administración |
| E2E intermitentes bajo carga | 3 pruebas, sin causa raíz demostrada |
| T-372 (SA) | Fuera del alcance |

## Estado para preparar el PR

El código del alcance corregido está verificado. Antes de abrir el PR conviene tener en cuenta:

1. El job bloqueante «Accesibilidad con axe» del CI quedará en rojo por T-368 hasta que se aplique la corrección de color aprobada.
2. Hay 3 E2E intermitentes bajo carga que pueden fallar en una ejecución completa.
3. T-367 y T-368 siguen en PARTIAL, y T-372 depende de otro integrante.

El PR se puede preparar, pero el Sprint 10 no está certificado al 100 %.
