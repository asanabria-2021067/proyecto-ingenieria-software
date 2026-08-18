# Auditoria de contraste (T-122)

Ratios calculados con la formula de luminancia relativa WCAG 2.1 sobre los tokens
de `apps/frontend/app/global.css` (`@theme` = modo claro, `.dark` = modo oscuro).
Umbral evaluado: 4.5:1 (texto normal, AA).

| Par revisado | Ratio antes | Ratio despues | Cambio |
|---|---|---|---|
| `--color-tertiary` (#595959) sobre `--color-surface` (#f7f9ff), claro | 6.65:1 | 6.65:1 | Cumplia, sin cambios |
| `--color-tertiary` (#595959) sobre `--color-surface-container` (#ebeef4), claro | 6.03:1 | 6.03:1 | Cumplia, sin cambios |
| `--color-tertiary` (#595959) sobre `--color-surface-container-high` (#e5e8ee), claro | 5.71:1 | 5.71:1 | Cumplia, sin cambios |
| `--color-tertiary` (#595959) sobre `--color-surface-container-highest` (#dfe3e8), claro | 5.43:1 | 5.43:1 | Cumplia, sin cambios |
| `--color-tertiary` (#c8c7c7) sobre `--color-surface` (#101418), oscuro | 10.97:1 | 10.97:1 | Cumplia, sin cambios |
| `--color-tertiary` (#c8c7c7) sobre `--color-surface-container` (#171c21), oscuro | 10.17:1 | 10.17:1 | Cumplia, sin cambios |
| `--color-on-surface-variant` (#43474e) sobre `--color-surface` (#f7f9ff), claro | 8.87:1 | 8.87:1 | Cumplia, sin cambios |
| `--color-on-surface-variant` (#c3c7cc) sobre `--color-surface` (#101418), oscuro | 10.89:1 | 10.89:1 | Cumplia, sin cambios |
| `--color-outline` (#6e7a6f) sobre `--color-surface` (#f7f9ff), claro | 4.27:1 | 4.27:1 | No se usa como color de texto (solo bordes; el umbral de componentes UI es 3:1), sin cambios |
| `--color-on-primary-container` (#e3ffe5) sobre `--color-primary-container` (#008345), claro | 4.55:1 | 4.55:1 | Cumplia, sin cambios |
| `text-tertiary` en `text-xs`/`text-[11px]` (task-board.tsx) | 5.43-6.65:1 (claro) / 9.27-10.97:1 (oscuro) | igual | El tamaño reducido no compromete el contraste, ratios ya cumplen AA. Sin cambios |
| `--admin-text-muted` rgba(255,255,255,0.55) sobre `--admin-bg` #054526 (sidebar admin, modo claro) | 4.13:1 | 5.66:1 (alpha 0.65) | **Corregido**: se subio la opacidad de 0.55 a 0.65 en `apps/frontend/app/global.css` |

## Notas

- El bloque `.dark` de `--admin-text-muted` ya usaba `var(--color-tertiary)`, que cumple AA en oscuro (10.17-10.97:1); no se toco.
- `--admin-text-muted` en modo claro se usa como texto real (`UserMenu.tsx`, `SidebarNav.tsx`, `AdminLayout.tsx`), no solo decorativo, por lo que el fallo de 4.13:1 era un incumplimiento real de AA.
- No se modificaron los tokens `--color-tertiary` ni `--color-on-surface-variant`: los pares evaluados con ellos ya cumplian 4.5:1 en ambos temas.
