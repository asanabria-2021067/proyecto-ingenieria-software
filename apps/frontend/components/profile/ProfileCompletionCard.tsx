'use client';

import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/lib/services/users';

export function profileCompletionPercent(user: UserProfile): number {
  const p = user.perfil;
  const checks = [
    !!user.fotoUrl,
    !!p?.biografia,
    user.habilidades.length > 0,
    user.intereses.length > 0,
    user.cualidades.length > 0,
    !!(p?.githubUrl || p?.linkedinUrl || p?.enlacePortafolio || p?.urlCv),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function ProfileCompletionCard({
  percent,
  onComplete,
}: {
  percent: number;
  onComplete: () => void;
}) {
  return (
    <section
      className="mb-section flex flex-col gap-3 rounded-card bg-surface-container-low p-card shadow-card sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex-1">
        <p className="font-headline text-base font-extrabold text-on-surface">
          Tu perfil está al {percent}%
        </p>
        <p className="text-sm text-tertiary">
          Complétalo para recibir proyectos más afines a ti.
        </p>
        <div
          role="progressbar"
          aria-label="Progreso del perfil"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-1.5 w-full max-w-sm rounded-full bg-surface-container-highest"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <Button type="button" onClick={onComplete} className="rounded-xl font-bold">
        Completar perfil
      </Button>
    </section>
  );
}
