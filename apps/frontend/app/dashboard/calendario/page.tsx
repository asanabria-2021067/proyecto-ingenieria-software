'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, ClipboardList, Plus, Target } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  getDashboardStats,
  getMisTareas,
  type DashboardStats,
  type MiTareaDTO,
} from '@/lib/services/users';
import { getMyProjects } from '@/lib/services/projects';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';
import { estadoBadgeLabel } from '@/components/projects/available-project-card';
import { getMisEventos, type EventoProyectoDTO, type MiEventoDTO } from '@/lib/services/events';
import {
  addDays,
  formatMonthLabel,
  formatWeekRangeLabel,
  getMonthMatrix,
  getWeekDays,
  toDateKey,
} from '@/lib/calendar/utils';
import {
  eventoToAgendaItems,
  groupAgendaItemsByDay,
  tareaToAgendaItem,
  type AgendaItem,
} from '@/lib/calendar/agenda';
import { MODALIDAD_ESTILO, MODALIDADES_EN_ORDEN } from '@/lib/calendar/modalidad';
import { MonthView } from '@/components/calendar/month-view';
import { WeekView } from '@/components/calendar/week-view';
import { AgendaItemRow } from '@/components/calendar/agenda-item-row';
import { EventFormDialog } from '@/components/calendar/event-form-dialog';
import { dashboardPage } from '@/components/layout/dashboard-page';

type Vista = 'mes' | 'semana';

function tieneFechaLimite(
  tarea: MiTareaDTO,
): tarea is MiTareaDTO & { fechaLimite: string } {
  return tarea.fechaLimite !== null;
}

/**
 * HU-169: calendario de actividades del proyecto. Muestra fechas límite de
 * tareas (GET /usuarios/me/tareas, comportamiento preexistente sin cambios)
 * Y eventos de proyecto (GET /usuarios/me/eventos, T-263/T-264), en vista
 * mensual o semanal sin recargar. Crear/editar eventos es exclusivo de
 * quien lidera el proyecto del evento (GET /proyectos/mine).
 */
export default function CalendarioPage() {
  const {
    data: tareas = [],
    isLoading: isLoadingTareas,
    isError: isErrorTareas,
    refetch: refetchTareas,
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
  const [vista, setVista] = useState<Vista>('mes');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventoProyectoDTO | null>(null);

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthMatrix = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);

  // Rango realmente visible en pantalla (T-264): la rejilla de 6 semanas en
  // vista mensual, los 7 días en vista semanal — nunca "todos los eventos".
  const rango = useMemo(() => {
    if (vista === 'semana') {
      return { desde: weekDays[0].date, hasta: addDays(weekDays[6].date, 1) };
    }
    const primera = monthMatrix[0][0].date;
    const ultima = monthMatrix[monthMatrix.length - 1][6].date;
    return { desde: primera, hasta: addDays(ultima, 1) };
  }, [vista, weekDays, monthMatrix]);

  const {
    data: eventos = [],
    isLoading: isLoadingEventos,
    isError: isErrorEventos,
    refetch: refetchEventos,
  } = useQuery<MiEventoDTO[]>({
    queryKey: ['mis-eventos', rango.desde.toISOString(), rango.hasta.toISOString()],
    queryFn: () => getMisEventos(rango.desde, rango.hasta),
  });

  const eventosPorId = useMemo(() => new Map(eventos.map((e) => [e.idEvento, e])), [eventos]);
  const ledProjectIds = useMemo(() => new Set(misProyectos.map((p) => p.idProyecto)), [misProyectos]);
  const isEventEditable = (projectId: number) => ledProjectIds.has(projectId);

  const pendientes = useMemo(
    () =>
      tareas.filter(tieneFechaLimite).filter((t) => t.estadoTarea !== 'HECHO'),
    [tareas],
  );

  const agendaItems = useMemo<AgendaItem[]>(
    () => [
      ...pendientes.map(tareaToAgendaItem),
      ...eventos.flatMap((e) => eventoToAgendaItems(e, rango.desde, rango.hasta)),
    ],
    [pendientes, eventos, rango],
  );
  const itemsByDay = useMemo(() => groupAgendaItemsByDay(agendaItems), [agendaItems]);

  const agendaSeleccionada = useMemo(() => {
    const base = selectedKey ? (itemsByDay.get(selectedKey) ?? []) : agendaItems;
    return [...base].sort((a, b) => (a.key + a.sortKey).localeCompare(b.key + b.sortKey));
  }, [itemsByDay, agendaItems, selectedKey]);

  const isLoading = isLoadingTareas || isLoadingEventos;
  const isError = isErrorTareas || isErrorEventos;

  const handleEditEvento = (item: Extract<AgendaItem, { kind: 'evento' }>) => {
    const evento = eventosPorId.get(item.id);
    if (!evento) return;
    setEditingEvent(evento);
    setDialogOpen(true);
  };

  const handleNuevoEvento = () => {
    setEditingEvent(null);
    setDialogOpen(true);
  };

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

  const initialDateParaNuevoEvento = selectedKey
    ? (itemsByDay.get(selectedKey)?.[0] as { fechaInicio?: Date } | undefined)?.fechaInicio ??
      new Date(`${selectedKey}T09:00:00`)
    : undefined;

  return (
    <div className={dashboardPage('py-8')}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-gap">
        <div>
          <h1 className="mb-1 font-headline text-3xl font-extrabold text-on-surface">
            Calendario del Proyecto
          </h1>
          <p className="text-sm text-tertiary">
            Fechas de entrega de tus tareas y eventos de tus proyectos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gap">
          {/* HU-184 (T-324): leyenda de lo que distingue cada marca del calendario. */}
          <ul className="flex flex-wrap items-center gap-x-gap gap-y-1" aria-label="Leyenda del calendario">
            <li className="flex items-center gap-1 type-meta">
              <span className="h-1.5 w-1.5 rounded-pill bg-primary" aria-hidden="true" />
              Fecha límite de tarea
            </li>
            {MODALIDADES_EN_ORDEN.map((modalidad) => {
              const estilo = MODALIDAD_ESTILO[modalidad];
              return (
                <li key={modalidad} className="flex items-center gap-1 type-meta">
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-control ${estilo.relleno}`}>
                    <estilo.icon className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                  Evento {estilo.label.toLowerCase()}
                </li>
              );
            })}
          </ul>

          <ButtonGroup>
            <Button
              type="button"
              variant={vista === 'mes' ? 'default' : 'outline'}
              className="h-9 rounded-md text-xs font-bold"
              onClick={() => setVista('mes')}
            >
              Mes
            </Button>
            <Button
              type="button"
              variant={vista === 'semana' ? 'default' : 'outline'}
              className="h-9 rounded-md text-xs font-bold"
              onClick={() => setVista('semana')}
            >
              Semana
            </Button>
          </ButtonGroup>

          {misProyectos.length > 0 && (
            <Button
              type="button"
              onClick={handleNuevoEvento}
              className="h-9 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo evento
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-tight">
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 rounded-control p-0"
            aria-label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
            onClick={() =>
              setAnchor((current) =>
                vista === 'mes'
                  ? new Date(current.getFullYear(), current.getMonth() - 1, 1)
                  : addDays(current, -7),
              )
            }
          >
            ‹
          </Button>
          <span className="type-section capitalize text-text-primary">
            {vista === 'mes'
              ? formatMonthLabel(year, month)
              : formatWeekRangeLabel(weekDays[0].date, weekDays[6].date)}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 rounded-control p-0"
            aria-label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
            onClick={() =>
              setAnchor((current) =>
                vista === 'mes'
                  ? new Date(current.getFullYear(), current.getMonth() + 1, 1)
                  : addDays(current, 7),
              )
            }
          >
            ›
          </Button>
        </div>
        {selectedKey && (
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="type-body font-medium text-primary hover:underline"
          >
            Ver todas las fechas
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[1fr_320px]">
        <div className="space-y-section">
          {vista === 'mes' ? (
            <MonthView
              year={year}
              month={month}
              todayKey={hoyKey}
              selectedKey={selectedKey}
              itemsByDay={itemsByDay}
              onSelectDay={(key) => setSelectedKey((current) => (current === key ? null : key))}
            />
          ) : (
            <WeekView
              days={weekDays}
              todayKey={hoyKey}
              itemsByDay={itemsByDay}
              isEventEditable={isEventEditable}
              onEditEvento={handleEditEvento}
            />
          )}

          {/* T-264: un fetch fallido no puede verse igual que "sin actividad" en
              ninguna vista — antes esto solo se mostraba en vista mensual y la
              semanal quedaba mostrando "Sin actividad" en las 7 columnas. */}
          {isLoading && (
            <div className="py-16 text-center text-sm text-tertiary" role="status">
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
                  onClick={() => {
                    void refetchTareas();
                    void refetchEventos();
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {vista === 'mes' && (
            <div className="space-y-section">
              {!isLoading && !isError && agendaSeleccionada.length === 0 && (
                <Empty className="surface-enter" aria-live="polite">
                  <EmptyMedia variant="icon">
                    <CalendarDays aria-hidden="true" className="h-7 w-7" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>
                      {selectedKey ? 'Nada programado ese día' : 'Sin actividad en este rango'}
                    </EmptyTitle>
                    <EmptyDescription>
                      {selectedKey
                        ? 'Elige otro día en el calendario o vuelve a ver todas las fechas.'
                        : 'Cuando tengas tareas con fecha límite o eventos de proyecto, aparecerán aquí.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}

              {!isLoading && !isError && agendaSeleccionada.length > 0 && (
                <div className="space-y-tight">
                  {agendaSeleccionada.map((item) => (
                    <AgendaItemRow
                      key={`${item.kind}-${item.id}-${item.key}`}
                      item={item}
                      editable={item.kind === 'evento' && isEventEditable(item.projectId)}
                      onEditEvento={handleEditEvento}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-gap">
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

          <Link
            href="/dashboard/mis-tareas"
            className="inline-flex items-center gap-tight text-sm font-medium text-primary hover:underline"
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Ver todas mis tareas
          </Link>
        </div>
      </div>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ledProjects={misProyectos.map((p) => ({ idProyecto: p.idProyecto, tituloProyecto: p.tituloProyecto }))}
        editingEvent={editingEvent}
        defaultProjectId={misProyectos[0]?.idProyecto}
        initialDate={initialDateParaNuevoEvento}
      />
    </div>
  );
}
