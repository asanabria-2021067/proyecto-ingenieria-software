# Auditoria de contraste AA de la paleta (T-258)

Ratios calculados con la formula de luminancia relativa WCAG 2.1 sobre los tokens
de `apps/frontend/app/global.css` (`@theme` = modo claro, `.dark` = modo oscuro),
publicados en T-253 a T-257. Umbral evaluado: 4.5:1 (texto normal, AA).

| Par revisado | Claro | Oscuro | Resultado |
|---|---|---|---|
| `--color-text-primary` sobre `--color-surface` | 16.27:1 | 16.35:1 | Cumple |
| `--color-text-primary` sobre `--color-surface-container-lowest` | 17.13:1 | 17.44:1 | Cumple |
| `--color-text-primary` sobre `--color-surface-container-low` | 15.55:1 | 15.64:1 | Cumple |
| `--color-text-primary` sobre `--color-surface-container` | 14.74:1 | 15.16:1 | Cumple |
| `--color-text-primary` sobre `--color-surface-container-high` | 13.96:1 | 13.82:1 | Cumple |
| `--color-text-primary` sobre `--color-surface-container-highest` | 13.29:1 | 12.26:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface` | 8.87:1 | 10.89:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface-container-lowest` | 9.33:1 | 11.61:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface-container-low` | 8.47:1 | 10.42:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface-container` | 8.03:1 | 10.10:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface-container-high` | 7.60:1 | 9.21:1 | Cumple |
| `--color-text-secondary` sobre `--color-surface-container-highest` | 7.24:1 | 8.17:1 | Cumple |
| `--color-text-disabled` sobre las 6 superficies de arriba | 2.28-2.36:1 | 3.08-3.30:1 | No cumple 4.5:1, pero WCAG 1.4.3 exceptua texto deshabilitado |
| `--color-on-accent` sobre `--color-accent` (pastilla) | 13.25:1 | 11.26:1 | Cumple |
| `--color-on-status-success` sobre `--color-status-success` (pastilla) | 4.55:1 | 11.30:1 | Cumple, claro al limite |
| `--color-on-status-warning` sobre `--color-status-warning` (pastilla) | 13.25:1 | 11.26:1 | Cumple |
| `--color-on-status-error` sobre `--color-status-error` (pastilla) | 5.00:1 | 5.51:1 | Cumple |
| `--blink-gray-text` sobre `--blink-gray-bg` (pastilla) | 5.33:1 | 8.41:1 | Cumple |
| `--blink-gold-text` sobre `--blink-gold-bg` (pastilla) | 5.39:1 | 8.77:1 | Cumple |
| `--color-accent` usado como texto (prohibido), sobre las 6 superficies | 1.00-1.29:1 | 1.18-1.68:1 | Falla en las 12 combinaciones, como se esperaba |

## Notas

- `--color-accent` es fondo de pastilla, nunca color de texto: falla las 12 combinaciones probadas (6 superficies, claro y oscuro). Prohibido usarlo como `color`; su contraparte de texto es siempre `--color-on-accent`.
- Ningun token se ajusto: la paleta publicada en T-257 ya cumple AA tal como fue definida.
- `on-status-success` sobre `status-success-bg` en claro queda al limite (4.55:1, margen de 0.05). Revisar este par primero si ese color cambia.
