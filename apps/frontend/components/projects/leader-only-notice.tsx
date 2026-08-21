import { ShieldAlert } from 'lucide-react';

interface LeaderOnlyNoticeProps {
  /** Por defecto "¡No eres líder!" — puede sobreescribirse cuando una
   * pantalla ya tenía su propio texto establecido (p. ej. F15). */
  title?: string;
  description: string;
}

/**
 * Aviso reutilizable para las vistas de `/dashboard/proyectos/[id]/*` que en
 * backend son exclusivas del líder (SprintsAuthorizationService.
 * assertProjectLeader, TeamService.getTeamSummary → requireOwner). Se
 * evalúa client-side ANTES de disparar la query real: un colaborador que
 * entra por URL directa nunca ve una tabla vacía ni un 403 crudo, ve este
 * aviso — mismo formato ya usado por el detalle de miembro (F15).
 */
export function LeaderOnlyNotice({ title = '¡No eres líder!', description }: LeaderOnlyNoticeProps) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center" role="alert">
      <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-error" aria-hidden="true" />
      <h1 className="mb-1 font-headline text-lg font-bold text-on-surface">{title}</h1>
      <p className="text-sm text-tertiary">{description}</p>
    </div>
  );
}
