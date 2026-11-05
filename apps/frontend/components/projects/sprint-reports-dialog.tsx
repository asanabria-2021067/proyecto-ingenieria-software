'use client';

import Link from 'next/link';
import { ChevronDown, GitCommitHorizontal, LineChart, Scale, TrendingDown, TrendingUp, Users, Waypoints } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ReporteCard {
  icono: React.ElementType;
  titulo: string;
  descripcion: string;
  href?: string;
  /** Se oculta a quien no es líder del proyecto. */
  soloLider?: boolean;
}

function buildReportes(idProyecto: number, idSprintBurndown: number | null, esLider: boolean): ReporteCard[] {
  // El detalle del Sprint que alimenta estas gráficas es solo del líder (backend).
  const graficas = idSprintBurndown && esLider
    ? `/dashboard/proyectos/${idProyecto}/sprints/${idSprintBurndown}/informes/graficas`
    : undefined;
  return [
    {
      icono: TrendingDown,
      titulo: 'Diagrama de trabajo pendiente de Sprint',
      descripcion: 'Da seguimiento al trabajo restante de un Sprint día a día frente a la línea ideal, hasta su cierre.',
      href: idSprintBurndown ? `/dashboard/proyectos/${idProyecto}/sprints/${idSprintBurndown}/informes/burndown` : undefined,
    },
    {
      icono: TrendingUp,
      titulo: 'Informe de velocidad',
      descripcion: 'Compara cuantos story points completo el equipo en cada Sprint cerrado frente al promedio.',
      href: `/dashboard/proyectos/${idProyecto}/sprints/informes/velocidad`,
    },
    {
      icono: Users,
      titulo: 'Horas por integrante',
      soloLider: true,
      descripcion: 'Cuántas horas reportó cada integrante en las tareas del Sprint.',
      href: graficas,
    },
    {
      icono: Waypoints,
      titulo: 'Tareas por estado a lo largo del Sprint',
      soloLider: true,
      descripcion: 'Cómo se reparten las tareas pendientes y completadas día a día.',
      href: graficas,
    },
    {
      icono: LineChart,
      titulo: 'Tiempo promedio por columna',
      soloLider: true,
      descripcion: 'Cuánto tiempo pasan las tareas en Por hacer, En progreso y En revisión.',
      href: graficas,
    },
    {
      icono: Scale,
      titulo: 'Horas estimadas contra reales',
      soloLider: true,
      descripcion: 'Compara lo que se estimó con lo que realmente se trabajó en cada tarea.',
      href: graficas,
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
  /** Líder del proyecto: solo él ve los informes de equipo y tiempo. */
  esLider?: boolean;
}

/**
 * "Más informes" al estilo Jira: un catalogo de graficas de analitica de
 * Sprint. Burndown y Velocidad son reales y enlazan a su pagina dedicada;
 * los informes de equipo y tiempo enlazan a la pagina de graficas del Sprint;
 * la frecuencia de cierre necesita una metrica que hoy no registramos y se
 * muestra como Proximamente en vez de inventar el dato.
 */
export function SprintReportsDialog({ open, onOpenChange, idProyecto, idSprintBurndown, esLider = false }: SprintReportsDialogProps) {
  const reportes = buildReportes(idProyecto, idSprintBurndown, esLider).filter((r) => esLider || !r.soloLider);

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
                  <span className="pill pill-sm pill-neutral mt-2 w-fit">
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
    <Button
      type="button"
      variant="secondary"
      onClick={onClick}
      className="h-auto gap-1.5 rounded-[var(--radius-control)] bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary-container hover:bg-primary-container/80 has-[>svg]:px-4"
    >
      Ver informes
      <ChevronDown className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}
