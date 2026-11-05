'use client';

import { CircleQuestionMark } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PasoAyuda {
  target: string;
  title: string;
  content: string;
}

/** Botón «?»: relanza a demanda el tour corto de la pantalla con la misma guía de bienvenida (OnboardingTour). */
export function BotonAyudaTour({ pasos, compacto = false }: { pasos: PasoAyuda[]; compacto?: boolean }) {
  return (
    <Button
      type="button"
      variant={compacto ? 'ghost' : 'outline'}
      size={compacto ? 'icon-sm' : 'icon'}
      aria-label="Ayuda de esta pantalla"
      title="Ayuda de esta pantalla"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('start-pantalla-tour', {
            detail: pasos.map((p) => ({ ...p, placement: 'bottom', skipBeacon: true })),
          }),
        )
      }
    >
      <CircleQuestionMark className="size-4" aria-hidden="true" />
    </Button>
  );
}
