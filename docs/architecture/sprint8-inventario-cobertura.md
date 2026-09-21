# Inventario de cobertura y priorizacion de componentes (T-202)

El umbral configurado en `vitest.config.ts` (30% statements/lines, 60% functions/branches)
esta puesto a ciegas: nadie habia mirado que partes concretas del frontend quedan
descubiertas. Este documento identifica los componentes con mas logica y menos
cobertura real, para que subir el umbral (T-205) suba tambien el riesgo cubierto,
no solo el numero.

## Nota metodologica

`vitest run --coverage` no escribe `coverage/coverage-summary.json` al correr la
suite completa en este entorno (114 archivos, `pool: forks` con `execArgv`
custom) — el reporte SI se genera corriendo un archivo suelto, pero se pierde en
la corrida completa, sin error visible mas alla del fallo esperado de umbral.
Confirmado con varias variantes (`--pool=threads`, `maxForks=1`) sin exito;
documentado aqui para que nadie repita el mismo diagnostico.

Como proxy, se conto densidad de logica real por archivo (`if`, ternarios,
`.filter/.reduce/.some/.every`, `&&`, `||`) sobre `lib/`, `hooks/` y
`components/` (excluyendo `components/ui/*`, primitivos sin logica de negocio),
cruzado a mano contra los 113 archivos de test existentes en `apps/frontend/test/`.
Es una aproximacion a complejidad ciclomatica, no un % exacto de lineas — pero
es exactamente lo que pide la ficha: encontrar donde esta el riesgo, no inflar
un numero.

## Componentes prioritarios (mucha logica, sin cobertura real)

| Archivo | Lineas | Señales de logica | Cobertura actual |
|---|---|---|---|
| `components/profile/CompleteProfileDialog.tsx` | 846 | 71 | Ninguna |
| `components/admin/UserDetailSheet.tsx` | 753 | 53 | Ninguna |
| `components/projects/project-chat-panel.tsx` | 456 | 48 | 1 test (`project-chat-panel-archivado.spec.tsx`), solo el caso de solo-lectura archivado |
| `components/admin/ProjectFeedbackSheet.tsx` | 308 | 31 | Ninguna |
| `components/projects/available-project-card.tsx` | 479 | 23 | Ninguna (se reutiliza en varios listados) |
| `lib/services/admin.ts` | 277 | 24 | Ninguna |
| `components/admin/RevisionHistoryPanel.tsx` | 210 | 22 | Ninguna |
| `components/closure/closure-readiness-panel.tsx` | 288 | 19 | Ninguna |
| `components/leadership/leadership-section.tsx` | 172 | 16 | Ninguna |

## Reparto (Sprint 8, HU-151)

- **Samuel**: `CompleteProfileDialog.tsx`, `UserDetailSheet.tsx` (T-203, lote 1).
- **Saul**: `project-chat-panel.tsx`, `ProjectFeedbackSheet.tsx`, `RevisionHistoryPanel.tsx` (T-204, lote 2).
- **Vernel**: `available-project-card.tsx`, `lib/services/admin.ts`, `closure-readiness-panel.tsx`, `leadership-section.tsx`.

## No vale la pena probar

- `components/dashboard/DashboardLayout.tsx`, `SidebarNav.tsx`, `OnboardingTour.tsx`
  — layout/navegacion, ya se ejercitan indirectamente via los tests de cada pagina
  que los monta.
- `components/projects/task-form-fields.tsx` (503 lineas) — ya cubierto a fondo
  por los 36 tests de `task-form-dialog.spec.ts`, que lo monta con todas sus
  variantes.
- `components/ui/*` (shadcn) — primitivos de presentacion sin logica de negocio.
- `.schema.ts` que ya tienen su propio spec dedicado (`task-form.schema`,
  `sprint-closing-form.schema`).

