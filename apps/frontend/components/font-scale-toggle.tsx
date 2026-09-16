'use client';

import { useEffect, useState } from 'react';

const SCALE_LEVELS = [0.875, 1.0, 1.125, 1.25];
const STORAGE_KEY = 'uvg-collab-font-scale';
const DEFAULT_INDEX = 1;

function readStoredIndex(): number {
  if (typeof window === 'undefined') return DEFAULT_INDEX;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const parsed = stored !== null ? Number(stored) : DEFAULT_INDEX;
  return SCALE_LEVELS[parsed] !== undefined ? parsed : DEFAULT_INDEX;
}

/** Además del fontSize del <html> (de donde salen casi todos los `rem` del
 * layout), expone la escala y su inverso como custom properties: el sidebar
 * (`.sidebar-scale-lock`, global.css) los usa para quedar con tamaño fijo
 * en pantalla sin importar el nivel elegido acá. */
function applyFontScale(index: number) {
  const scale = SCALE_LEVELS[index];
  const root = document.documentElement;
  root.style.fontSize = `${scale * 100}%`;
  root.style.setProperty('--font-scale', String(scale));
  root.style.setProperty('--font-scale-inverse', String(1 / scale));
}

export function FontScaleToggle() {
  const [levelIndex, setLevelIndex] = useState(readStoredIndex);

  useEffect(() => {
    applyFontScale(levelIndex);
  }, [levelIndex]);

  const changeLevel = (index: number) => {
    setLevelIndex(index);
    window.localStorage.setItem(STORAGE_KEY, String(index));
  };

  const buttonClass =
    'flex size-10 items-center justify-center rounded-control bg-muted text-meta text-text-primary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex items-center gap-micro">
      <button
        type="button"
        onClick={() => changeLevel(levelIndex - 1)}
        disabled={levelIndex === 0}
        className={buttonClass}
        aria-label="Reducir tamaño de texto"
      >
        A-
      </button>
      <button
        type="button"
        onClick={() => changeLevel(DEFAULT_INDEX)}
        className={buttonClass}
        aria-label="Restablecer tamaño de texto"
      >
        A
      </button>
      <button
        type="button"
        onClick={() => changeLevel(levelIndex + 1)}
        disabled={levelIndex === SCALE_LEVELS.length - 1}
        className={buttonClass}
        aria-label="Aumentar tamaño de texto"
      >
        A+
      </button>
    </div>
  );
}
