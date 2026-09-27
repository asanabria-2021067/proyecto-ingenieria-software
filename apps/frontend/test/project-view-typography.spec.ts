import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// HU-154 (T-214/T-216): las vistas de proyecto migradas usan la escala
// tipográfica del sistema de diseño (`type-*`, `text-meta`…) y el ancho de
// contenido compartido (`max-w-content`). Esta guarda impide que vuelvan los
// tamaños arbitrarios (`text-[13px]`) y el contenedor heredado de 1400px.
//
// `proyectos/[id]/page.tsx` contiene también la vista histórica de un proyecto
// CERRADO (VIEW-02), que está congelada y fuera de HU-154: se analiza el
// archivo solo hasta su marcador de sección.

const ARBITRARY_FONT_SIZE = /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g;
const LEGACY_WIDTH = /\bmax-w-\[1400px\]/g;

const HISTORICAL_MARKER = '// ─── S7 · VIEW-02';

const MIGRATED_FILES = [
  'app/dashboard/projects/[id]/layout.tsx',
  'app/dashboard/proyectos/[id]/layout.tsx',
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
  'components/projects/detail/exit-request-section.tsx',
  'components/projects/role-admin-card.tsx',
  'components/projects/closure-status-banner.tsx',
  'components/projects/read-only-project-banner.tsx',
];

const PARTICIPANT_PAGE = 'app/dashboard/proyectos/[id]/page.tsx';

function leer(relativePath: string): string {
  return readFileSync(join(__dirname, '..', relativePath), 'utf-8');
}

/** Rama abierta de la página del participante: todo lo anterior al marcador del histórico. */
function ramaAbiertaDelParticipante(): string {
  const source = leer(PARTICIPANT_PAGE);
  const fin = source.indexOf(HISTORICAL_MARKER);
  if (fin < 0) throw new Error(`No se encontró el marcador «${HISTORICAL_MARKER}» en ${PARTICIPANT_PAGE}`);
  return source.slice(0, fin);
}

describe('Tipografía y ancho de las vistas de proyecto (HU-154)', () => {
  it.each(MIGRATED_FILES)('no usa tamaños de fuente arbitrarios en %s', (relativePath) => {
    expect(leer(relativePath).match(ARBITRARY_FONT_SIZE) ?? []).toEqual([]);
  });

  it.each(MIGRATED_FILES)('no usa el contenedor heredado max-w-[1400px] en %s', (relativePath) => {
    expect(leer(relativePath).match(LEGACY_WIDTH) ?? []).toEqual([]);
  });

  it('la rama abierta de la página del participante no usa tamaños arbitrarios ni el ancho heredado', () => {
    const rama = ramaAbiertaDelParticipante();
    expect(rama.match(ARBITRARY_FONT_SIZE) ?? []).toEqual([]);
    expect(rama.match(LEGACY_WIDTH) ?? []).toEqual([]);
  });

  it('el corte en el marcador deja fuera solo la vista histórica, no la página abierta', () => {
    const rama = ramaAbiertaDelParticipante();
    // La página abierta completa queda dentro del análisis…
    expect(rama).toContain('export default function ProyectoDetallePage()');
    expect(rama).toContain('<ProjectContentGrid>');
    // …y la vista histórica, fuera.
    expect(rama).not.toContain('function HistoricalProjectPage(');
    expect(leer(PARTICIPANT_PAGE)).toContain('function HistoricalProjectPage(');
  });

  it('el patrón detecta los tamaños arbitrarios y el ancho heredado que debe prohibir', () => {
    expect('text-[13px] text-[0.8125rem] text-sm text-meta'.match(ARBITRARY_FONT_SIZE)).toEqual([
      'text-[13px]',
      'text-[0.8125rem]',
    ]);
    expect('max-w-[1400px] max-w-content'.match(LEGACY_WIDTH)).toEqual(['max-w-[1400px]']);
  });
});
