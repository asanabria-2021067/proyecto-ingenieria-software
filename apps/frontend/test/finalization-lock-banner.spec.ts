import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../hooks/use-project-sprints', () => ({ useProjectSprints: vi.fn() }));

import { FinalizationLockBanner } from '../components/projects/finalization-lock-banner';
import { useProjectSprints } from '../hooks/use-project-sprints';

const TEXTO_BANNER =
  'Este proyecto está temporalmente bloqueado: se está finalizando el Sprint actual.';

function mockSprints(overrides: Record<string, unknown> = {}) {
  (useProjectSprints as any).mockReturnValue({
    sprints: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

function sprint(estado: string, overrides: Record<string, unknown> = {}) {
  return { idSprint: 1, idProyecto: 42, numero: 1, estado, ...overrides };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FinalizationLockBanner', () => {
  it('ACTIVO: banner no visible', () => {
    mockSprints({ sprints: [sprint('ACTIVO')] });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
  });

  it('CERRADO: banner no visible', () => {
    mockSprints({ sprints: [sprint('CERRADO')] });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
  });

  it('EN_FINALIZACION: banner visible con el texto exacto, sin haber recibido ningún evento (persistencia/reload)', () => {
    mockSprints({ sprints: [sprint('EN_FINALIZACION')] });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.getByText(TEXTO_BANNER)).toBeInTheDocument();
  });

  it('loading: banner no visible (sin flash amarillo)', () => {
    mockSprints({ sprints: [], isLoading: true });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
  });

  it('error: banner no visible, nunca se interpreta como bloqueado', () => {
    mockSprints({ sprints: [], isError: true, error: new Error('500') });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
  });

  it('sin Sprints: banner no visible', () => {
    mockSprints({ sprints: [] });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryByText(TEXTO_BANNER)).not.toBeInTheDocument();
  });

  it('no contiene ningún botón ni acción interactiva (informativo, no dismissible)', () => {
    mockSprints({ sprints: [sprint('EN_FINALIZACION')] });
    render(createElement(FinalizationLockBanner, { idProyecto: 42 }));

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('pasa idProyecto al hook exacto', () => {
    mockSprints({ sprints: [] });
    render(createElement(FinalizationLockBanner, { idProyecto: 99 }));

    expect(useProjectSprints).toHaveBeenCalledWith(99);
  });
});
