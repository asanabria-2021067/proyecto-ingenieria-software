'use client';

import { useEffect, useState } from 'react';

const SCALE_LEVELS = [0.875, 1.0, 1.125, 1.25];
const STORAGE_KEY = 'uvg-collab-font-scale';
const DEFAULT_INDEX = 1;

function applyFontScale(index: number) {
  document.documentElement.style.fontSize = `${SCALE_LEVELS[index] * 100}%`;
}

export function FontScaleToggle() {
  const [levelIndex, setLevelIndex] = useState(DEFAULT_INDEX);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored !== null ? Number(stored) : DEFAULT_INDEX;
    const index = SCALE_LEVELS[parsed] !== undefined ? parsed : DEFAULT_INDEX;
    setLevelIndex(index);
    applyFontScale(index);
  }, []);

  const changeLevel = (index: number) => {
    setLevelIndex(index);
    applyFontScale(index);
    window.localStorage.setItem(STORAGE_KEY, String(index));
  };

  const buttonClass =
    'p-2 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-1">
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
