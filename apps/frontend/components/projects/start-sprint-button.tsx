'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStartSprint } from '@/hooks/use-project-sprints';

interface StartSprintButtonProps {
  idProyecto: number;
}

/**
 * Botón de acción del líder para abrir el primer Sprint de trabajo del
 * proyecto (F2). Delega toda la mutación y su invalidación a
 * `useStartSprint` (F1) — este componente solo conoce su propio estado de
 * interacción (`isPending`), mismo patrón de `disabled` + `Loader2` +
 * texto "…" ya usado por `CreateMilestoneDialog`.
 */
export function StartSprintButton({ idProyecto }: StartSprintButtonProps) {
  const startSprint = useStartSprint(idProyecto);

  return (
    <Button
      type="button"
      onClick={() => startSprint.mutate()}
      disabled={startSprint.isPending}
      className="gap-1.5 rounded-lg bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
    >
      {startSprint.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {startSprint.isPending ? 'Iniciando...' : 'Iniciar Sprint'}
    </Button>
  );
}
