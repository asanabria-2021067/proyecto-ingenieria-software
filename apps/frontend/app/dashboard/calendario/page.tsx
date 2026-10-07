'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Plus, Share2 } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  getDashboardStats,
  getMisTareas,
  type DashboardStats,
  type MiTareaDTO,
} from '@/lib/services/users';
import { getMyProjects } from '@/lib/services/projects';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';
import { getMisEventos, type EventoProyectoDTO, type MiEventoDTO, type TipoEvento } from '@/lib/services/events';
import { toDateKey } from '@/lib/calendar/utils';
import {
  agendaItemKey,
  eventoToAgendaItems,
  groupAgendaItemsByDay,
  tareaCompartidaToAgendaItem,
  tareaToAgendaItem,
  type AgendaItem,
  type OrigenCompartido,
} from '@/lib/calendar/agenda';
import { tonoPorIndice } from '@/lib/calendar/paleta';
import type { EventoItem } from '@/lib/calendar/time-grid';
import {
  contarItems,
  etiquetaRango,
  filtrarItems,
  navegar,
  proyectosDelCalendario,
  rangoVisible,
  type VistaCalendario,
} from '@/lib/calendar/vista';
import { useAgendasCompartidas, useCalendariosCompartidos } from '@/hooks/use-calendar-shares';
import { MonthView } from '@/components/calendar/month-view';
import { WeekView } from '@/components/calendar/week-view';
import { TimeGridView } from '@/components/calendar/time-grid-view';
import { AgendaItemRow } from '@/components/calendar/agenda-item-row';
import { EventFormDialog } from '@/components/calendar/event-form-dialog';
import { EventDetailDialog } from '@/components/calendar/event-detail-dialog';
import { ShareCalendarDialog } from '@/components/calendar/share-calendar-dialog';
import { CalendarSidebar, type MetaHoras } from '@/components/calendar/calendar-sidebar';
import { CalendarFilterMenu } from '@/components/calendar/calendar-filter-menu';
import { iniciales } from '@/components/calendar/invitados-field';
import { dashboardPage } from '@/components/layout/dashboard-page';

const VISTAS: { value: VistaCalendario; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

/** Preferencia por persona: qué calendarios compartidos tiene activados (solo comodidad local). */
const CLAVE_COMPARTIDOS_ACTIVOS = 'calendario:compartidos-activos';

function leerCompartidosActivos(): number[] {
  try {
    const valor = JSON.parse(window.localStorage.getItem(CLAVE_COMPARTIDOS_ACTIVOS) ?? '[]');
    return Array.isArray(valor) ? valor.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

function guardarCompartidosActivos(ids: number[]) {
  try {
    window.localStorage.setItem(CLAVE_COMPARTIDOS_ACTIVOS, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento (modo privado): la selección vive solo en esta visita.
  }
}

function tieneFechaLimite(tarea: MiTareaDTO): tarea is MiTareaDTO & { fechaLimite: string } {
  return tarea.fechaLimite !== null;
}

function alternar<T>(conjunto: Set<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto);
  if (nuevo.has(valor)) nuevo.delete(valor);
  else nuevo.add(valor);
  return nuevo;
}

/**
 * HU-169: calendario de actividades. HU-184 (T-324), rediseñado según la
 * maqueta del equipo: vistas Día/Semana (cuadrícula por horas) y Mes, filtro
 * por tipo de actividad, columna izquierda con mini calendario, meta de
 * horas, "Mis proyectos" con checks y, estilo Teams, los calendarios que
 * otras personas me compartieron, superpuestos al mío con su color.
 * Crear/editar eventos sigue siendo exclusivo de quien lidera el proyecto.
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

  const { data: compartidos } = useCalendariosCompartidos();

  const ahora = useMemo(() => new Date(), []);
  const hoyKey = toDateKey(ahora);
  const [vista, setVista] = useState<VistaCalendario>('semana');
  const [anchor, setAnchor] = useState(() => new Date());
  const [miniMes, setMiniMes] = useState(() => new Date(ahora.getFullYear(), ahora.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mostrarTareas, setMostrarTareas] = useState(true);
  const [tiposOcultos, setTiposOcultos] = useState<Set<TipoEvento>>(new Set());
  const [proyectosOcultos, setProyectosOcultos] = useState<Set<number>>(new Set());
  const [compartidosActivos, setCompartidosActivos] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventoProyectoDTO | null>(null);
  const [detalle, setDetalle] = useState<{ evento: MiEventoDTO; compartidoPor: OrigenCompartido | null } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // localStorage solo existe en el navegador: se lee después de montar.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCompartidosActivos(leerCompartidosActivos()), []);

  const rango = useMemo(() => rangoVisible(vista, anchor), [vista, anchor]);

  const {
    data: eventos = [],
    isLoading: isLoadingEventos,
    isError: isErrorEventos,
    refetch: refetchEventos,
  } = useQuery<MiEventoDTO[]>({
    queryKey: ['mis-eventos', rango.desde.toISOString(), rango.hasta.toISOString()],
    queryFn: () => getMisEventos(rango.desde, rango.hasta),
  });

  // Calendarios compartidos conmigo, cada uno con su tono (orden de la lista = color estable).
  const personasCompartidas = useMemo(
    () => (compartidos?.compartidosConmigo ?? []).map((p, i) => ({ ...p, tono: tonoPorIndice(i) })),
    [compartidos],
  );
  const idsActivos = useMemo(
    () => personasCompartidas.filter((p) => compartidosActivos.includes(p.idUsuario)).map((p) => p.idUsuario),
    [personasCompartidas, compartidosActivos],
  );
  const { agendas: agendasCompartidas } = useAgendasCompartidas(idsActivos, rango.desde, rango.hasta);

  const ledProjectIds = useMemo(() => new Set(misProyectos.map((p) => p.idProyecto)), [misProyectos]);

  const itemsPropios = useMemo<AgendaItem[]>(
    () => [
      ...tareas.filter(tieneFechaLimite).filter((t) => t.estadoTarea !== 'HECHO').map(tareaToAgendaItem),
      ...eventos.flatMap((e) => eventoToAgendaItems(e, rango.desde, rango.hasta)),
    ],
    [tareas, eventos, rango],
  );

  // Eventos de calendarios compartidos, indexados para abrir su detalle.
  const eventosCompartidos = useMemo(() => {
    const mapa = new Map<string, { evento: MiEventoDTO; origen: OrigenCompartido }>();
    for (const persona of personasCompartidas) {
      const agenda = agendasCompartidas.get(persona.idUsuario);
      if (!agenda) continue;
      const origen = { idUsuario: persona.idUsuario, nombre: `${persona.nombre} ${persona.apellido}`, tono: persona.tono };
      for (const evento of agenda.eventos) mapa.set(`${persona.idUsuario}-${evento.idEvento}`, { evento, origen });
    }
    return mapa;
  }, [personasCompartidas, agendasCompartidas]);

  const itemsCompartidos = useMemo<AgendaItem[]>(() => {
    const misEventos = new Set(eventos.map((e) => e.idEvento));
    const misTareas = new Set(tareas.map((t) => t.idTarea));
    const items: AgendaItem[] = [];
    for (const persona of personasCompartidas) {
      const agenda = agendasCompartidas.get(persona.idUsuario);
      if (!agenda) continue;
      const origen = { idUsuario: persona.idUsuario, nombre: `${persona.nombre} ${persona.apellido}`, tono: persona.tono };
      // Lo que ya está en mi calendario no se duplica.
      for (const evento of agenda.eventos) {
        if (!misEventos.has(evento.idEvento)) items.push(...eventoToAgendaItems(evento, rango.desde, rango.hasta, origen));
      }
      for (const tarea of agenda.tareas) {
        if (!misTareas.has(tarea.idTarea)) items.push(tareaCompartidaToAgendaItem(tarea, origen));
      }
    }
    return items;
  }, [personasCompartidas, agendasCompartidas, eventos, tareas, rango]);

  const proyectos = useMemo(() => proyectosDelCalendario(itemsPropios, misProyectos), [itemsPropios, misProyectos]);

  const itemsVisibles = useMemo(
    () => filtrarItems([...itemsPropios, ...itemsCompartidos], { mostrarTareas, tiposOcultos, proyectosOcultos }),
    [itemsPropios, itemsCompartidos, mostrarTareas, tiposOcultos, proyectosOcultos],
  );
  const itemsByDay = useMemo(() => groupAgendaItemsByDay(itemsVisibles), [itemsVisibles]);
  const diasConActividad = useMemo(() => new Set(itemsByDay.keys()), [itemsByDay]);

  const agendaSeleccionada = useMemo(() => {
    const base = selectedKey ? (itemsByDay.get(selectedKey) ?? []) : itemsVisibles;
    return [...base].sort((a, b) => (a.key + a.sortKey).localeCompare(b.key + b.sortKey));
  }, [itemsByDay, itemsVisibles, selectedKey]);

  const isLoading = isLoadingTareas || isLoadingEventos;
  const isError = isErrorTareas || isErrorEventos;

  const handleSelectEvento = (item: EventoItem) => {
    if (item.compartidoPor) {
      const compartido = eventosCompartidos.get(`${item.compartidoPor.idUsuario}-${item.id}`);
      if (!compartido) return;
      setDetalle({ evento: compartido.evento, compartidoPor: compartido.origen });
    } else {
      const evento = eventos.find((e) => e.idEvento === item.id);
      if (!evento) return;
      setDetalle({ evento, compartidoPor: null });
    }
    setDetailOpen(true);
  };

  const handleEditarDesdeDetalle = (evento: MiEventoDTO) => {
    setDetailOpen(false);
    setEditingEvent(evento);
    setDialogOpen(true);
  };

  const handleNuevoEvento = () => {
    setEditingEvent(null);
    setDialogOpen(true);
  };

  const handleToggleCompartido = (idUsuario: number) => {
    setCompartidosActivos((actuales) => {
      const nuevos = actuales.includes(idUsuario) ? actuales.filter((id) => id !== idUsuario) : [...actuales, idUsuario];
      guardarCompartidosActivos(nuevos);
      return nuevos;
    });
  };

  const irA = (fecha: Date) => {
    setAnchor(fecha);
    setMiniMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
  };

  const handleMiniSelect = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    irA(new Date(y, m - 1, d));
    if (vista === 'mes') setSelectedKey(key);
  };

  // Meta de horas: misma fuente y misma regla que el dashboard (VIEW-08) —
  // Beca y Extensión nunca se suman. Se muestra la primera que aplique.
  const metaHoras = useMemo<MetaHoras | null>(() => {
    if (!stats) return null;
    if (stats.horasBecaRequeridas !== null && stats.horasBecaRequeridas > 0) {
      return { etiqueta: 'Horas Beca', actual: stats.horasBeca, requeridas: stats.horasBecaRequeridas };
    }
    if (stats.horasExtensionRequeridas !== null && stats.horasExtensionRequeridas > 0) {
      return { etiqueta: 'Horas de Extensión', actual: stats.horasExtension, requeridas: stats.horasExtensionRequeridas };
    }
    return null;
  }, [stats]);

  // Nuevo evento: en Día, ese día a las 09:00; en Mes con un día elegido, ese día; si no, la siguiente hora.
  const initialDateParaNuevoEvento =
    vista === 'dia'
      ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 9)
      : selectedKey
        ? new Date(`${selectedKey}T09:00:00`)
        : undefined;

  const compartidoPorMi = compartidos?.compartidoPorMi ?? [];

  return (
    <div className={dashboardPage('py-8')}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-gap">
        <div>
          <h1 className="mb-1 font-headline text-3xl font-extrabold text-on-surface">Calendario académico y proyectos</h1>
          <p className="text-sm text-tertiary">Organiza tus tutorías, reuniones, entregas y fechas límite de tus proyectos.</p>
        </div>

        <div className="flex flex-wrap items-center gap-tight">
          {compartidoPorMi.length > 0 && (
            <div className="flex -space-x-2" aria-label={`Compartida con ${compartidoPorMi.length} personas`}>
              {compartidoPorMi.slice(0, 3).map((persona) => (
                <Avatar key={persona.idUsuario} className="size-8 ring-2 ring-card" title={`${persona.nombre} ${persona.apellido}`}>
                  {persona.fotoUrl && <AvatarImage src={persona.fotoUrl} alt="" />}
                  <AvatarFallback className="bg-surface-container-high text-[10px] font-bold">
                    {iniciales(persona.nombre, persona.apellido)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {compartidoPorMi.length > 3 && (
                <span className="flex size-8 items-center justify-center rounded-pill bg-surface-container-high text-[10px] font-bold ring-2 ring-card">
                  +{compartidoPorMi.length - 3}
                </span>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShareOpen(true)}
            className="h-9 gap-1.5 rounded-pill border-outline-variant text-xs font-bold"
          >
            <Share2 className="size-4" aria-hidden="true" />
            Compartir agenda
          </Button>
          {misProyectos.length > 0 && (
            <Button
              type="button"
              onClick={handleNuevoEvento}
              className="h-9 gap-1.5 rounded-pill bg-primary px-4 text-xs font-bold text-on-primary hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Agendar actividad
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="order-2 lg:order-1">
          <CalendarSidebar
            mini={{
              year: miniMes.getFullYear(),
              month: miniMes.getMonth(),
              todayKey: hoyKey,
              selectedKey: selectedKey ?? undefined,
              markedDates: diasConActividad,
              onPrevMonth: () => setMiniMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)),
              onNextMonth: () => setMiniMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)),
              onSelectDay: handleMiniSelect,
            }}
            metaHoras={metaHoras}
            proyectos={proyectos}
            proyectosOcultos={proyectosOcultos}
            onToggleProyecto={(id) => setProyectosOcultos((s) => alternar(s, id))}
            compartidos={personasCompartidas}
            compartidosActivos={new Set(idsActivos)}
            onToggleCompartido={handleToggleCompartido}
          />
        </div>

        <div className="order-1 min-w-0 space-y-section lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-tight">
            <CalendarFilterMenu
              total={contarItems(itemsVisibles)}
              mostrarTareas={mostrarTareas}
              onToggleTareas={() => setMostrarTareas((v) => !v)}
              tiposOcultos={tiposOcultos}
              onToggleTipo={(tipo) => setTiposOcultos((s) => alternar(s, tipo))}
              onMostrarTodo={() => {
                setMostrarTareas(true);
                setTiposOcultos(new Set());
              }}
            />

            <div role="radiogroup" aria-label="Vista del calendario" className="flex rounded-pill bg-surface-container p-1">
              {VISTAS.map((opcion) => (
                <button
                  key={opcion.value}
                  type="button"
                  role="radio"
                  aria-checked={vista === opcion.value}
                  onClick={() => {
                    setVista(opcion.value);
                    setSelectedKey(null);
                  }}
                  className={`rounded-pill px-3 py-1 text-xs font-bold transition-colors ${
                    vista === opcion.value ? 'bg-surface-container-lowest text-on-surface shadow-card' : 'text-on-surface-variant'
                  }`}
                >
                  {opcion.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-tight">
              <Button type="button" variant="outline" className="h-8 rounded-pill px-3 text-xs font-bold" onClick={() => irA(new Date())}>
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8 rounded-control p-0"
                aria-label="Anterior"
                onClick={() => irA(navegar(vista, anchor, -1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8 rounded-control p-0"
                aria-label="Siguiente"
                onClick={() => irA(navegar(vista, anchor, 1))}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <span className="type-subtitle min-w-0 text-text-primary" aria-live="polite">
                {etiquetaRango(vista, anchor)}
              </span>
            </div>
          </div>

          {vista === 'mes' && (
            <MonthView
              year={anchor.getFullYear()}
              month={anchor.getMonth()}
              todayKey={hoyKey}
              selectedKey={selectedKey}
              itemsByDay={itemsByDay}
              onSelectDay={(key) => setSelectedKey((current) => (current === key ? null : key))}
            />
          )}

          {vista === 'dia' && (
            <TimeGridView days={rango.days} todayKey={hoyKey} itemsByDay={itemsByDay} onSelectEvento={handleSelectEvento} ahora={ahora} />
          )}

          {vista === 'semana' && (
            <>
              {/* En móvil 7 columnas de horas no caben: la semana se ve como lista de días. */}
              <div className="hidden md:block">
                <TimeGridView
                  days={rango.days}
                  todayKey={hoyKey}
                  itemsByDay={itemsByDay}
                  onSelectEvento={handleSelectEvento}
                  onVerDia={(key) => {
                    const [y, m, d] = key.split('-').map(Number);
                    irA(new Date(y, m - 1, d));
                    setVista('dia');
                  }}
                  ahora={ahora}
                />
              </div>
              <div className="md:hidden">
                <WeekView days={rango.days} todayKey={hoyKey} itemsByDay={itemsByDay} onSelectEvento={handleSelectEvento} />
              </div>
            </>
          )}

          {/* T-264: un fetch fallido no puede verse igual que "sin actividad". */}
          {isLoading && (
            <div className="py-6 text-center text-sm text-tertiary" role="status">
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
                <EmptyDescription>Verifica que tu sesión siga activa o intenta actualizar.</EmptyDescription>
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

          {vista === 'mes' && !isLoading && !isError && (
            <div className="space-y-tight">
              {selectedKey && (
                <button type="button" onClick={() => setSelectedKey(null)} className="type-body font-medium text-primary hover:underline">
                  Ver todas las fechas
                </button>
              )}
              {agendaSeleccionada.length === 0 ? (
                <Empty className="surface-enter" aria-live="polite">
                  <EmptyMedia variant="icon">
                    <CalendarDays aria-hidden="true" className="h-7 w-7" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>{selectedKey ? 'Nada programado ese día' : 'Sin actividad en este rango'}</EmptyTitle>
                    <EmptyDescription>
                      {selectedKey
                        ? 'Elige otro día en el calendario o vuelve a ver todas las fechas.'
                        : 'Cuando tengas tareas con fecha límite o eventos de proyecto, aparecerán aquí.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                agendaSeleccionada.map((item) => (
                  <AgendaItemRow key={agendaItemKey(item)} item={item} onSelectEvento={handleSelectEvento} />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <EventDetailDialog
        evento={detalle?.evento ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        editable={detalle !== null && !detalle.compartidoPor && ledProjectIds.has(detalle.evento.idProyecto)}
        compartidoPor={detalle?.compartidoPor ?? null}
        onEditar={handleEditarDesdeDetalle}
      />

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ledProjects={misProyectos.map((p) => ({
          idProyecto: p.idProyecto,
          tituloProyecto: p.tituloProyecto,
          tipoProyecto: p.tipoProyecto,
        }))}
        editingEvent={editingEvent}
        defaultProjectId={misProyectos[0]?.idProyecto}
        initialDate={initialDateParaNuevoEvento}
      />

      <ShareCalendarDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
