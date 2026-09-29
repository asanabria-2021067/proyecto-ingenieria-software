'use client';

import Link from 'next/link';
import { ChevronDown, GitCommitHorizontal, LineChart, TrendingDown, TrendingUp, Waypoints } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ReporteCard {
  icono: React.ElementType;
  titulo: string;
  descripcion: string;
  href?: string;
}

function buildReportes(idProyecto: number, idSprintBurndown: number | null): ReporteCard[] {
  return [
    {
      icono: TrendingDown,
      titulo: 'Diagrama de trabajo pendiente de Sprint',
      descripcion: 'Da seguimiento al trabajo restante de un Sprint dia a dia frente a la linea ideal, hasta su cierre.',
      href: idSprintBurndown ? `/dashboard/proyectos/${idProyecto}/sprints/${idSprintBurndown}/informes/burndown` : undefined,
    },
    {
      icono: TrendingUp,
      titulo: 'Informe de velocidad',
      descripcion: 'Compara cuantos story points completo el equipo en cada Sprint cerrado frente al promedio.',
      href: `/dashboard/proyectos/${idProyecto}/sprints/informes/velocidad`,
    },
    {
      icono: Waypoints,
      titulo: 'Diagrama de flujo acumulado',
      descripcion: 'Muestra como se acumulan las tareas en cada estado del tablero a lo largo del tiempo.',
    },
    {
      icono: LineChart,
      titulo: 'Informe de duracion del ciclo',
      descripcion: 'Cuanto tiempo tardan las tareas en moverse por el tablero, de inicio a terminado.',
    },
    {
      icono: GitCommitHorizontal,
      titulo: 'Informe de frecuencia de cierre',
      descripcion: 'Con que frecuencia el equipo cierra Sprints y entrega avances medibles.',
    },
  ];
}

export interface SprintReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  /** Sprint al que enlaza la tarjeta de burndown — normalmente el mas reciente (activo o, si no hay, el ultimo cerrado). `null` si el proyecto aun no tiene ningun Sprint. */
  idSprintBurndown: number | null;
}

/**
 * "Mas informes" al estilo Jira: un catalogo de graficas de analitica de
 * Sprint. Burndown y Velocidad son reales y enlazan a su pagina dedicada;
 * el resto necesitaria metricas que hoy no registramos (flujo acumulado,
 * duracion de ciclo, frecuencia de cierre) y se muestran como Proximamente
 * en vez de inventar el dato.
 */
export function SprintReportsDialog({ open, onOpenChange, idProyecto, idSprintBurndown }: SprintReportsDialogProps) {
  const reportes = buildReportes(idProyecto, idSprintBurndown);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Más informes</DialogTitle>
          <DialogDescription>
            Elige una gráfica para ver el detalle completo de la analítica de Sprints de este proyecto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {reportes.map((reporte) => {
            const Icono = reporte.icono;
            const disponible = Boolean(reporte.href);
            const contenido = (
              <>
                <Icono className={`mb-3 h-6 w-6 ${disponible ? 'text-primary' : 'text-tertiary'}`} aria-hidden="true" />
                <h3 className="mb-1 text-sm font-bold text-on-surface">{reporte.titulo}</h3>
                <p className="text-xs leading-relaxed text-tertiary">{reporte.descripcion}</p>
                {!disponible && (
                  <span className="mt-2 inline-flex w-fit items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-bold text-tertiary">
                    Próximamente
                  </span>
                )}
              </>
            );
            return disponible ? (
              <Link
                key={reporte.titulo}
                href={reporte.href!}
                onClick={() => onOpenChange(false)}
                className="card-base cursor-pointer text-left transition-colors hover:bg-surface-container"
              >
                {contenido}
              </Link>
            ) : (
              <div
                key={reporte.titulo}
                aria-disabled="true"
                className="card-base cursor-not-allowed text-left opacity-60"
              >
                {contenido}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportsDialogTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-control bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary-container transition-colors hover:bg-primary-container/80"
    >
      Ver informes
      <ChevronDown className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
