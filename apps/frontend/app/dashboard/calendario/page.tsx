'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Target,
} from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  getDashboardStats,
  getMisTareas,
  type DashboardStats,
  type MiTareaDTO,
} from '@/lib/services/users';
import { getMyProjects } from '@/lib/services/projects';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';
import { estadoBadgeLabel } from '@/components/projects/available-project-card';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { parseFechaSolo, toDateKey } from '@/lib/calendar/utils';

const ESTADO_TAREA_LABEL: Record<string, string> = {
  POR_HACER: 'Por hacer',
  EN_PROGRESO: 'En progreso',
  EN_REVISION: 'En revisión',
  HECHO: 'Hecho',
};

const TAREA_ESTADO_PILL: Record<string, string> = {
  POR_HACER: 'pill-neutral',
  EN_PROGRESO: 'pill-accent',
  EN_REVISION: 'pill-warning',
  HECHO: 'pill-success',
};

const PRIORIDAD_LABEL: Record<MiTareaDTO['prioridad'], string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

/** Color por prioridad real de la tarea (dato del backend, no decorativo). */
const PRIORIDAD_BORDE: Record<MiTareaDTO['prioridad'], string> = {
  ALTA: 'border-l-status-error',
  MEDIA: 'border-l-status-warning',
  BAJA: 'border-l-outline-variant',
};

function tieneFechaLimite(
  tarea: MiTareaDTO,
): tarea is MiTareaDTO & { fechaLimite: string } {
  return tarea.fechaLimite !== null;
}

function formatFechaGrupo(fecha: Date, hoyKey: string): string {
  const key = toDateKey(fecha);
  if (key === hoyKey) return 'Hoy';
  const texto = fecha.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Fechas de entrega de tus tareas en todos tus proyectos, tomadas de
 * GET /usuarios/me/tareas (misma fuente que /dashboard/mis-tareas). No
 * incluye sprints ni convocatorias: el modelo actual no tiene una fecha de
 * cierre/fin planificada para esos, solo fechas de eventos ya ocurridos.
 */
export default function CalendarioPage() {
  const {
    data: tareas = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<MiTareaDTO[]>({
    queryKey: ['mis-tareas'],
    queryFn: () => getMisTareas(),
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  const { data: misProyectos = [] } = useQuery<MiProyectoListItemDTO[]>({
    queryKey: ['dashboard-mis-proyectos'],
    queryFn: getMyProjects,
  });

  const hoy = useMemo(() => new Date(), []);
  const hoyKey = useMemo(() => toDateKey(hoy), [hoy]);
  const [cursor, setCursor] = useState(() => ({
    year: hoy.getFullYear(),
    month: hoy.getMonth(),
  }));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pendientes = useMemo(
    () =>
      tareas.filter(tieneFechaLimite).filter((t) => t.estadoTarea !== 'HECHO'),
    [tareas],
  );

  const marcados = useMemo(
    () =>
      new Set(pendientes.map((t) => toDateKey(parseFechaSolo(t.fechaLimite)))),
    [pendientes],
  );

  const agenda = useMemo(() => {
    const base = selectedKey
      ? pendientes.filter(
          (t) => toDateKey(parseFechaSolo(t.fechaLimite)) === selectedKey,
        )
      : pendientes;
    return [...base].sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  }, [pendientes, selectedKey]);

  const gruposPorFecha = useMemo(() => {
    const mapa = new Map<string, { fecha: Date; tareas: MiTareaDTO[] }>();
    for (const tarea of agenda) {
      const fecha = parseFechaSolo(tarea.fechaLimite);
      const key = toDateKey(fecha);
      const grupo = mapa.get(key);
      if (grupo) grupo.tareas.push(tarea);
      else mapa.set(key, { fecha, tareas: [tarea] });
    }
    return [...mapa.values()];
  }, [agenda]);

  // Meta de horas: misma fuente y misma regla que el dashboard (VIEW-08) —
  // Beca y Extensión nunca se suman. Se muestra la primera que aplique.
  const metaHoras = useMemo(() => {
    if (!stats) return null;
    if (stats.horasBecaRequeridas !== null && stats.horasBecaRequeridas > 0) {
      return {
        etiqueta: 'Horas Beca',
        actual: stats.horasBeca,
        requeridas: stats.horasBecaRequeridas,
      };
    }
    if (stats.horasExtensionRequeridas !== null && stats.horasExtensionRequeridas > 0) {
      return {
        etiqueta: 'Horas de Extensión',
        actual: stats.horasExtension,
        requeridas: stats.horasExtensionRequeridas,
      };
    }
    return null;
  }, [stats]);
  const metaProgreso = metaHoras
    ? Math.min(100, Math.round((metaHoras.actual / metaHoras.requeridas) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <div className="mb-8">
        <h1 className="mb-1 font-headline text-3xl font-extrabold text-on-surface">
          Calendario Académico
        </h1>
        <p className="text-sm text-tertiary">
          Fechas de entrega de tus tareas en todos tus proyectos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[380px_1fr]">
        <div className="space-y-gap">
        <div className="card-base h-fit">
          <MiniCalendar
            year={cursor.year}
            month={cursor.month}
            size="md"
            todayKey={hoyKey}
            markedDates={marcados}
            selectedKey={selectedKey ?? undefined}
            onSelectDay={(key) =>
              setSelectedKey((current) => (current === key ? null : key))
            }
            onPrevMonth={() =>
              setCursor(({ year, month }) =>
                month === 0
                  ? { year: year - 1, month: 11 }
                  : { year, month: month - 1 },
              )
            }
            onNextMonth={() =>
              setCursor(({ year, month }) =>
                month === 11
                  ? { year: year + 1, month: 0 }
                  : { year, month: month + 1 },
              )
            }
          />
          <div className="mt-stack flex items-center gap-tight border-t border-outline-variant pt-stack">
            <span
              className="h-1.5 w-1.5 rounded-pill bg-primary"
              aria-hidden="true"
            />
            <span className="type-meta">Día con entregas pendientes</span>
          </div>
          {selectedKey && (
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="type-body mt-stack font-medium text-primary hover:underline"
            >
              Ver todas las fechas
            </button>
          )}
        </div>

        {metaHoras && (
          <div className="card-base h-fit">
            <div className="mb-stack flex items-center gap-tight">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-container text-text-secondary">
                <Target className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="type-subtitle text-text-primary">Meta de Horas</h3>
                <p className="type-meta">{metaHoras.etiqueta}</p>
              </div>
              <span className="type-section ml-auto text-text-primary">{metaProgreso}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-container-high">
              <div
                className="h-full rounded-pill bg-accent"
                style={{ width: `${metaProgreso}%` }}
              />
            </div>
            <p className="type-meta mt-tight">
              {metaHoras.actual} de {metaHoras.requeridas} hrs
            </p>
          </div>
        )}

        {misProyectos.length > 0 && (
          <div className="card-base h-fit">
            <h3 className="type-subtitle mb-stack text-text-primary">Mis Proyectos</h3>
            <ul className="space-y-tight">
              {misProyectos.slice(0, 4).map((p) => (
                <li key={p.idProyecto}>
                  <Link
                    href={`/dashboard/projects/${p.idProyecto}`}
                    className="flex items-center justify-between gap-tight rounded-control px-tight py-tight transition-colors hover:bg-surface-container"
                  >
                    <span className="type-body truncate text-text-primary">{p.tituloProyecto}</span>
                    <span className="pill pill-neutral shrink-0">
                      {estadoBadgeLabel(p.estadoProyecto)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>

        <div className="space-y-section">
          {isLoading && (
            <div
              className="py-16 text-center text-sm text-tertiary"
              role="status"
            >
              Cargando tu calendario...
            </div>
          )}

          {isError && (
            <Empty tone="danger" className="surface-enter" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No se pudo cargar tu calendario</EmptyTitle>
                <EmptyDescription>
                  Verifica que tu sesión siga activa o intenta actualizar.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!isLoading && !isError && agenda.length === 0 && (
            <Empty className="surface-enter" aria-live="polite">
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {selectedKey
                    ? 'Ningún vencimiento ese día'
                    : 'Sin entregas pendientes'}
                </EmptyTitle>
                <EmptyDescription>
                  {selectedKey
                    ? 'Elige otro día en el calendario o vuelve a ver todas las fechas.'
                    : 'Cuando tengas tareas con fecha límite, aparecerán aquí ordenadas por día.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {gruposPorFecha.map(({ fecha, tareas: tareasDelDia }) => (
            <div key={toDateKey(fecha)}>
              <h2 className="type-subtitle mb-tight text-text-primary">
                {formatFechaGrupo(fecha, hoyKey)}
              </h2>
              <div className="space-y-tight">
                {tareasDelDia.map((tarea) => (
                  <Link
                    key={tarea.idTarea}
                    href={`/dashboard/projects/${tarea.proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border-l-4 bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container ${PRIORIDAD_BORDE[tarea.prioridad]}`}
                  >
                    <span className="min-w-[10rem] flex-1 truncate text-sm text-on-surface">
                      {tarea.tituloTarea}
                    </span>
                    <span className="shrink-0 text-xs text-tertiary">
                      {tarea.proyecto.tituloProyecto}
                    </span>
                    <span className="pill pill-neutral shrink-0">
                      {PRIORIDAD_LABEL[tarea.prioridad]}
                    </span>
                    <span
                      className={`pill shrink-0 ${TAREA_ESTADO_PILL[tarea.estadoTarea] ?? 'pill-neutral'}`}
                    >
                      {ESTADO_TAREA_LABEL[tarea.estadoTarea] ??
                        tarea.estadoTarea}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-tertiary" />
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <Link
            href="/dashboard/mis-tareas"
            className="inline-flex items-center gap-tight text-sm font-medium text-primary hover:underline"
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Ver todas mis tareas
          </Link>
        </div>
      </div>
    </div>
  );
}
