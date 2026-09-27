import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// HU-163: las pantallas del dashboard solo pueden usar los roles de color del
// sistema de diseño (docs/design-system.md). Esta prueba falla si vuelve a
// colarse una clase de color literal de Tailwind (paleta por defecto o hex
// arbitrario) en cualquiera de los archivos migrados.

const LITERAL_COLOR_CLASS =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|caret|accent|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;

// Estilos inline con hex (`style={{ backgroundColor: '#...' }}`, `color: "#..."`,
// etc.): mismo hallazgo que una clase de color literal, pero fuera del alcance
// del regex de arriba (que solo mira nombres de clase Tailwind).
const INLINE_HEX_STYLE = /(?:backgroundColor|color|borderColor|fill|stroke)\s*:\s*['"`]#[0-9a-fA-F]{3,8}['"`]/g;

// Rutas relativas a apps/frontend de las pantallas/componentes ya migrados a
// tokens (T-251/HU-163, cierre del Sprint 8). Cada nuevo archivo migrado debe
// sumarse aquí para que la regresión quede cubierta.
const MIGRATED_FILES = [
  'app/dashboard/page.tsx',
  'app/dashboard/admin/page.tsx',
  'app/dashboard/projects/page.tsx',
  'app/dashboard/projects/projects-list-client.tsx',
  'app/dashboard/projects/mine/[id]/my-project-view-client.tsx',
  'app/dashboard/projects/[id]/kanban/kanban-workspace-client.tsx',
  'app/dashboard/projects/[id]/kanban/tasks/[taskId]/task-detail-client.tsx',
  'app/dashboard/mis-proyectos/page.tsx',
  'app/dashboard/proyectos/[id]/page.tsx',
  'app/dashboard/proyectos/[id]/equipo/[idUsuario]/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/analytics/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/[sprintId]/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/[sprintId]/analytics/page.tsx',
  'app/dashboard/proyectos/[id]/sprints/[sprintId]/finalizar/page.tsx',
  'components/projects/task-board.tsx',
  'components/projects/task-board.utils.ts',
  'components/projects/task-card.tsx',
  'components/projects/project-chat-panel.tsx',
  'components/layout/notifications-bell.tsx',
  'components/ui/toast.tsx',
  // HU-154 (T-214/T-215/T-216): navegación contextual y detalle de proyecto.
  'app/dashboard/projects/[id]/project-detail-client.tsx',
  'components/projects/project-sidebar.tsx',
  'components/projects/navigation/project-actions-menu.tsx',
  'components/projects/navigation/project-mobile-nav.tsx',
  'components/projects/navigation/project-nav-list.tsx',
  'components/projects/detail/project-content-grid.tsx',
  'components/projects/detail/project-header-card.tsx',
  'components/projects/detail/project-description-card.tsx',
  'components/projects/detail/project-owner-card.tsx',
  'components/projects/detail/project-details-section.tsx',
  'components/projects/detail/project-my-roles-section.tsx',
  'components/projects/detail/project-role-management-section.tsx',
  'components/projects/role-admin-card.tsx',
  'components/projects/closure-status-banner.tsx',
  'components/projects/read-only-project-banner.tsx',
  'components/projects/detail/exit-request-section.tsx',
];

describe('Tokens de color (HU-163)', () => {
  it.each(MIGRATED_FILES)(
    'no usa clases de color literales de Tailwind en %s',
    (relativePath) => {
      const source = readFileSync(join(__dirname, '..', relativePath), 'utf-8');
      const matches = source.match(LITERAL_COLOR_CLASS) ?? [];
      expect(matches).toEqual([]);
    },
  );

  it.each(MIGRATED_FILES)(
    'no usa estilos inline con color hex en %s',
    (relativePath) => {
      const source = readFileSync(join(__dirname, '..', relativePath), 'utf-8');
      const matches = source.match(INLINE_HEX_STYLE) ?? [];
      expect(matches).toEqual([]);
    },
  );
});
