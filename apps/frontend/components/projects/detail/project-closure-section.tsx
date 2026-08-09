import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProyectoDetalleDTO } from '@/lib/dto/project.dto';

function formatDate(date: string | null): string {
  if (!date) return 'Por definir';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'No disponible.';
  return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ProjectClosureSectionProps {
  proyecto: ProyectoDetalleDTO;
  isLeader: boolean;
  isAdmin: boolean;
  resolviendoCierre: boolean;
  resolverCierre: (accion: 'APROBAR' | 'RECHAZAR') => void;
}

export function ProjectClosureSection({
  proyecto,
  isLeader,
  isAdmin,
  resolviendoCierre,
  resolverCierre,
}: ProjectClosureSectionProps) {
  return (
    <div
      role="status"
      className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/25"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-on-surface">Solicitud de cierre pendiente</p>
          <p className="text-xs leading-relaxed text-on-surface-variant">
            {isAdmin && !isLeader
              ? 'El responsable solicitó cerrar este proyecto. Aprueba o rechaza la solicitud.'
              : 'Enviaste la solicitud de cierre. Un administrador debe aprobarla para finalizar el proyecto.'}
            {proyecto.fechaActualizacion && ` Actualizado el ${formatDate(proyecto.fechaActualizacion)}.`}
          </p>
        </div>
      </div>
      {isAdmin && !isLeader && (
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={resolviendoCierre}
            onClick={() => resolverCierre('RECHAZAR')}
            className="gap-1.5 rounded-md border-error/40 text-xs font-bold text-error hover:bg-error/10"
          >
            <XCircle className="size-3.5" aria-hidden="true" />
            Rechazar
          </Button>
          <Button
            size="sm"
            disabled={resolviendoCierre}
            onClick={() => resolverCierre('APROBAR')}
            className="gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Aprobar cierre
          </Button>
        </div>
      )}
    </div>
  );
}
