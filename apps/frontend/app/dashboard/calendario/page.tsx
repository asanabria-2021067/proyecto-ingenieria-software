'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Share2 } from 'lucide-react';
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
import {
  calendariosCompartidosQueryKey,
  useAgendasCompartidas,
  useCalendariosCompartidos,
  useDejarDeRecibirCalendario,
} from '@/hooks/use-calendar-shares';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';
import { getCalendariosCompartidos, type EventoCompartidoDTO } from '@/lib/services/calendar-shares';
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
import { idUsuarioSeguro } from '@/lib/services/notifications';

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

// G04 (UI-11): mientras una consulta no tiene datos, el valor por defecto debe
// ser SIEMPRE el mismo array: un `[]` literal en la desestructuración sería una
// referencia nueva por render y rompería toda la cadena de `useMemo`.
const SIN_TAREAS: MiTareaDTO[] = [];
const SIN_EVENTOS: MiEventoDTO[] = [];
const SIN_PROYECTOS: MiProyectoListItemDTO[] = [];

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
    data: tareas = SIN_TAREAS,
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

  const { data: misProyectos = SIN_PROYECTOS } = useQuery<MiProyectoListItemDTO[]>({
    queryKey: ['dashboard-mis-proyectos'],
    queryFn: getMyProjects,
  });

  const {
    data: compartidos,
    isLoading: isLoadingCompartidos,
    isError: isErrorCompartidos,
    refetch: refetchCompartidos,
  } = useCalendariosCompartidos();
  const queryClient = useQueryClient();
  const dejarDeRecibir = useDejarDeRecibirCalendario();

  // G03 (UI-28): la hora "ahora" y el día "hoy" avanzan mientras la página
  // sigue abierta (línea de ahora cada minuto; "Hoy" cambia a medianoche sin
  // recargar). Solo mueve estos indicadores: las consultas dependen del rango
  // (ancla), no de este reloj, así que un tick no vuelve a pedir la agenda.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
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
  // G01 (UI-01): un evento compartido llega reducido (EventoCompartidoDTO), nunca como MiEventoDTO.
  const [detalle, setDetalle] = useState<
    { evento: MiEventoDTO; compartidoPor: null } | { evento: EventoCompartidoDTO; compartidoPor: OrigenCompartido } | null
  >(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // G03 (UI-10): clave (data-evento-key) del bloque o fila que abrió el detalle, para devolverle el foco al cerrar.
  const [claveDisparador, setClaveDisparador] = useState<string | null>(null);

  // localStorage solo existe en el navegador: se lee después de montar.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCompartidosActivos(leerCompartidosActivos()), []);

  // G03 (UI-40): `?compartido=<ownerId>` llega desde la notificación. Se lee
  // una sola vez al montar, se retira de la URL en el acto (sin navegación ni
  // bucles) y se activa SOLO si la API lo lista entre los calendarios
  // recibidos (misma consulta que la columna izquierda: no hay petición
  // extra). Si no está (revocado o id ajeno) se avisa y no se consulta ninguna
  // agenda; un id inválido se ignora en silencio.
  // El id leído se guarda en una ref: en desarrollo React monta el efecto dos
  // veces (StrictMode) y la URL ya está limpia en la segunda pasada.
  const compartidoSolicitadoRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (compartidoSolicitadoRef.current === undefined) {
      const params = new URLSearchParams(window.location.search);
      compartidoSolicitadoRef.current = params.has('compartido') ? idUsuarioSeguro(params.get('compartido')) : null;
      if (params.has('compartido')) {
        params.delete('compartido');
        const resto = params.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`);
      }
    }
    const idSolicitado = compartidoSolicitadoRef.current;
    if (idSolicitado === null) return;
    let vigente = true;
    queryClient
      .fetchQuery({ queryKey: calendariosCompartidosQueryKey, queryFn: getCalendariosCompartidos })
      .then((lista) => {
        if (!vigente) return;
        compartidoSolicitadoRef.current = null;
        const persona = lista.compartidosConmigo.find((p) => p.idUsuario === idSolicitado);
        if (!persona) {
          aviso.advertencia('Ese calendario ya no está compartido contigo', 'Quien lo compartió pudo retirarlo. Revisa la columna izquierda.');
          return;
        }
        setCompartidosActivos((actuales) => {
          const nuevos = actuales.includes(persona.idUsuario) ? actuales : [...actuales, persona.idUsuario];
          guardarCompartidosActivos(nuevos);
          return nuevos;
        });
        aviso.exito('Calendario activado', `Ya ves el calendario de ${persona.nombre} ${persona.apellido} junto al tuyo.`);
      })
      .catch(() => {
        // La lista falló: la columna izquierda ya lo muestra con "Reintentar".
      });
    return () => {
      vigente = false;
    };
  }, [queryClient]);

  const rango = useMemo(() => rangoVisible(vista, anchor), [vista, anchor]);

  const {
    data: eventos = SIN_EVENTOS,
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
  // G04 (UI-11): el Set que recibe la columna izquierda solo cambia si cambian los activos.
  const compartidosActivosSet = useMemo(() => new Set(idsActivos), [idsActivos]);
  const { agendas: agendasCompartidas, estados: estadosCompartidos } = useAgendasCompartidas(idsActivos, rango.desde, rango.hasta);

  // G03 (UI-12): un fallo por persona se avisa una sola vez (al pasar a error),
  // nunca en cada render; si fue revocación (403) se refresca la lista para que
  // la persona desaparezca de "compartidos conmigo". El estado se resume en un
  // texto estable ("id:revocada,…") para que el efecto solo corra al cambiar.
  const fallosCompartidos = idsActivos
    .filter((id) => estadosCompartidos.get(id)?.isError)
    .map((id) => `${id}:${estadosCompartidos.get(id)?.revocada ? 1 : 0}`)
    .join(',');
  const avisadosRef = useRef(new Set<number>());
  useEffect(() => {
    const actuales = new Map(fallosCompartidos ? fallosCompartidos.split(',').map((f) => f.split(':')).map(([id, r]) => [Number(id), r === '1']) : []);
    for (const [id, revocada] of actuales) {
      if (avisadosRef.current.has(id)) continue;
      avisadosRef.current.add(id);
      const persona = personasCompartidas.find((p) => p.idUsuario === id);
      const nombre = persona ? `${persona.nombre} ${persona.apellido}` : 'esa persona';
      if (revocada) {
        aviso.advertencia('Calendario ya no disponible', `${nombre} dejó de compartir su calendario contigo.`);
        void queryClient.invalidateQueries({ queryKey: calendariosCompartidosQueryKey });
      } else {
        aviso.error('No se pudo cargar un calendario compartido', `El calendario de ${nombre} no respondió. Puedes reintentarlo desde la columna izquierda.`);
      }
    }
    for (const id of avisadosRef.current) if (!actuales.has(id)) avisadosRef.current.delete(id);
  }, [fallosCompartidos, personasCompartidas, queryClient]);

  const ledProjectIds = useMemo(() => new Set(misProyectos.map((p) => p.idProyecto)), [misProyectos]);
  const proyectosLiderados = useMemo(
    () => misProyectos.map((p) => ({ idProyecto: p.idProyecto, tituloProyecto: p.tituloProyecto, tipoProyecto: p.tipoProyecto })),
    [misProyectos],
  );

  const itemsPropios = useMemo<AgendaItem[]>(
    () => [
      ...tareas.filter(tieneFechaLimite).filter((t) => t.estadoTarea !== 'HECHO').map(tareaToAgendaItem),
      ...eventos.flatMap((e) => eventoToAgendaItems(e, rango.desde, rango.hasta)),
    ],
    [tareas, eventos, rango],
  );

  // Eventos de calendarios compartidos, indexados para abrir su detalle.
  const eventosCompartidos = useMemo(() => {
    const mapa = new Map<string, { evento: EventoCompartidoDTO; origen: OrigenCompartido }>();
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

  // G03 (UI-17): el mini calendario muestra un mes completo, pero en Día/Semana
  // el rango cargado es un día o una semana: sus marcas se calculan con una
  // consulta del mes del mini (en Mes es la misma clave y TanStack la comparte).
  // Mientras ese mes carga no hay marcas: nunca se enseñan las del mes anterior.
  const rangoMini = useMemo(() => rangoVisible('mes', miniMes), [miniMes]);
  const { data: eventosMini } = useQuery<MiEventoDTO[]>({
    queryKey: ['mis-eventos', rangoMini.desde.toISOString(), rangoMini.hasta.toISOString()],
    queryFn: () => getMisEventos(rangoMini.desde, rangoMini.hasta),
  });
  const miniMuestraElMesVisible =
    vista === 'mes' && miniMes.getFullYear() === anchor.getFullYear() && miniMes.getMonth() === anchor.getMonth();
  const marcasMini = useMemo(() => {
    if (miniMuestraElMesVisible) return diasConActividad;
    const items = filtrarItems(
      [
        ...tareas.filter(tieneFechaLimite).filter((t) => t.estadoTarea !== 'HECHO').map(tareaToAgendaItem),
        ...(eventosMini ?? []).flatMap((e) => eventoToAgendaItems(e, rangoMini.desde, rangoMini.hasta)),
      ],
      { mostrarTareas, tiposOcultos, proyectosOcultos },
    );
    return new Set(items.map((i) => i.key));
  }, [miniMuestraElMesVisible, diasConActividad, tareas, eventosMini, rangoMini, mostrarTareas, tiposOcultos, proyectosOcultos]);

  const agendaSeleccionada = useMemo(() => {
    const base = selectedKey ? (itemsByDay.get(selectedKey) ?? []) : itemsVisibles;
    return [...base].sort((a, b) => (a.key + a.sortKey).localeCompare(b.key + b.sortKey));
  }, [itemsByDay, itemsVisibles, selectedKey]);

  const isLoading = isLoadingTareas || isLoadingEventos;
  const isError = isErrorTareas || isErrorEventos;

  const handleSelectEvento = (item: EventoItem) => {
    setClaveDisparador(agendaItemKey(item));
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
    // Abierto desde "Agendar actividad": el foco vuelve a ese botón (comportamiento de Radix), no a un bloque.
    setClaveDisparador(null);
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

  // G01 (UI-31): quitarme un calendario recibido. Si falla, la persona sigue en la lista.
  const handleQuitarCompartido = (idUsuario: number) => {
    const persona = personasCompartidas.find((p) => p.idUsuario === idUsuario);
    const nombre = persona ? `${persona.nombre} ${persona.apellido}` : 'esa persona';
    dejarDeRecibir.mutate(idUsuario, {
      onSuccess: () => {
        setCompartidosActivos((actuales) => {
          const nuevos = actuales.filter((id) => id !== idUsuario);
          guardarCompartidosActivos(nuevos);
          return nuevos;
        });
        aviso.exito('Calendario quitado', `Ya no verás el calendario de ${nombre}.`);
      },
      onError: (err) => aviso.error('No se pudo quitar el calendario', getApiErrorMessage(err, 'calendar')),
    });
  };

  const irA = (fecha: Date) => {
    setAnchor(fecha);
    setMiniMes(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    // G03 (UI-17): un día elegido que ya no se ve dejaría la lista del mes
    // filtrada por una fecha fuera del periodo (vacío falso). Si sigue
    // visible (p. ej. "Hoy" dentro del mismo mes) se conserva.
    setSelectedKey((actual) => (actual && rangoVisible(vista, fecha).days.some((d) => d.key === actual) ? actual : null));
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
              // En Mes el mini refleja el día elegido; en Día/Semana, la fecha ancla que se está viendo.
              selectedKey: vista === 'mes' ? (selectedKey ?? undefined) : toDateKey(anchor),
              markedDates: marcasMini,
              onPrevMonth: () => setMiniMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)),
              onNextMonth: () => setMiniMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)),
              onSelectDay: handleMiniSelect,
            }}
            metaHoras={metaHoras}
            proyectos={proyectos}
            proyectosOcultos={proyectosOcultos}
            onToggleProyecto={(id) => setProyectosOcultos((s) => alternar(s, id))}
            compartidos={personasCompartidas}
            compartidosActivos={compartidosActivosSet}
            onToggleCompartido={handleToggleCompartido}
            onQuitarCompartido={handleQuitarCompartido}
            quitandoCompartido={dejarDeRecibir.isPending ? dejarDeRecibir.variables : null}
            compartidosEstado={isLoadingCompartidos ? 'cargando' : isErrorCompartidos ? 'error' : 'listo'}
            onReintentarCompartidos={() => void refetchCompartidos()}
            estadoAgendas={estadosCompartidos}
          />
        </div>

        <div className="order-1 min-w-0 space-y-section lg:order-2" aria-busy={isLoading}>
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

            {/* G03 (UI-08): mismo primitivo accesible que la modalidad del diálogo (G03-C12):
                un solo tab stop, ←/→ cambian la vista y aria-checked es real. Los E2E
                siguen usando getByRole('radio', { name: 'Día' | 'Semana' | 'Mes' }). */}
            <RadioGroupPrimitive.Root
              value={vista}
              onValueChange={(v) => {
                setVista(v as VistaCalendario);
                setSelectedKey(null);
              }}
              aria-label="Vista del calendario"
              orientation="horizontal"
              loop
              className="flex rounded-pill bg-surface-container p-1"
            >
              {VISTAS.map((opcion) => (
                <RadioGroupPrimitive.Item
                  key={opcion.value}
                  value={opcion.value}
                  className={`rounded-pill px-3 py-1 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    vista === opcion.value ? 'bg-surface-container-lowest text-on-surface shadow-card' : 'text-on-surface-variant'
                  }`}
                >
                  {opcion.label}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>

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

          {/* T-264: un fetch fallido no puede verse igual que "sin actividad".
              G03 (UI-39): el estado va ANTES de la rejilla (que mientras tanto
              está vacía y marcada aria-busy), con el botón del sistema. */}
          {isLoading && (
            <div className="flex items-center justify-center gap-tight py-3 text-sm text-tertiary" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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
                <Button
                  type="button"
                  onClick={() => {
                    void refetchTareas();
                    void refetchEventos();
                  }}
                  className="h-10 rounded-pill bg-primary px-5 text-sm font-bold text-on-primary hover:bg-primary/90"
                >
                  Reintentar
                </Button>
              </EmptyContent>
            </Empty>
          )}

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
              {/* G02 (UI-02): con las dos barras laterales, 7 columnas de horas solo son
                  legibles desde xl (1280 px); por debajo, la semana se ve como lista de días. */}
              <div className="hidden xl:block">
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
              <div className="xl:hidden">
                <WeekView days={rango.days} todayKey={hoyKey} itemsByDay={itemsByDay} onSelectEvento={handleSelectEvento} />
              </div>
            </>
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
        editable={detalle !== null && detalle.compartidoPor === null && ledProjectIds.has(detalle.evento.idProyecto)}
        compartidoPor={detalle?.compartidoPor ?? null}
        onEditar={handleEditarDesdeDetalle}
        restaurarFocoA={claveDisparador}
      />

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ledProjects={proyectosLiderados}
        editingEvent={editingEvent}
        defaultProjectId={misProyectos[0]?.idProyecto}
        initialDate={initialDateParaNuevoEvento}
        restaurarFocoA={claveDisparador}
      />

      <ShareCalendarDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
