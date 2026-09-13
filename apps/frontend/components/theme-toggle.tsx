'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!mounted) {
    return <div className="size-10" />; // Placeholder for hydration
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="flex size-10 items-center justify-center rounded-control bg-muted text-text-primary transition-colors hover:bg-surface-container-high"
      aria-label="Cambiar tema"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="size-5 text-text-secondary" />
      ) : (
        <Moon className="size-5 text-text-secondary" />
      )}
    </button>
  );
}
