'use client';

import { useState } from 'react';

export const MENSAJE_TECNICO_SIMULADO = 'Fallo simulado en ProvocarError: stack interno de pruebas E2E';

export function ProvocarError() {
  const [fallar, setFallar] = useState(false);

  if (fallar) {
    throw new Error(MENSAJE_TECNICO_SIMULADO);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page p-6 text-text-primary">
      <h1 className="font-headline text-2xl font-bold">Página de prueba de errores</h1>
      <button
        type="button"
        onClick={() => setFallar(true)}
        className="rounded-xl bg-primary px-5 py-2.5 font-bold text-on-primary"
      >
        Provocar error
      </button>
    </main>
  );
}
