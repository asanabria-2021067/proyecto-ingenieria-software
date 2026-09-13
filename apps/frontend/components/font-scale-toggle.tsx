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

function applyFontScale(index: number) {
  document.documentElement.style.fontSize = `${SCALE_LEVELS[index] * 100}%`;
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
