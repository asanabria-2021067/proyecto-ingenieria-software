'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { CALENDAR_DAY_CHIP_CLASS, CalendarMonthGrid } from '@/components/calendar/month-view';
import { TimeGridView } from '@/components/calendar/time-grid-view';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useAdminMeetingParticipants, useAdminMeetingsInRange } from '@/hooks/use-admin-meetings';
import {
  agruparEntradasPorDia,
  contarReuniones,
  contarReunionesEnDias,
  describirHorarioReunion,
  diaInicioReunion,
  entradaKey,
  searchReuniones,
  separarReunionesVisibles,
  type EntradaAdmin,
  type ReunionVisible,
} from '@/lib/admin/admin-calendar';
import {
  SITUACION_SPRINT_LABEL_CORTA,
  SITUACION_SPRINT_TONE,
  adminProjectHref,
  contarFinalizaciones,
  describeDiasRestantes,
  formatDiaConAnio,
  formatDiaLargoConAnio,
} from '@/lib/admin/sprint-calendar';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { safeExternalHref } from '@/lib/security/safe-url';
import { IconoTipoEvento, TONO_CLASES } from '@/lib/calendar/paleta';
import { etiquetaRango, navegar, rangoVisible, type VistaCalendario } from '@/lib/calendar/vista';
import { formatMonthLabel, parseFechaSolo, toDateKey } from '@/lib/calendar/utils';
import type { AdminSprintCalendarItem } from '@/lib/types/admin-sprints';

/**
 * Vistas Día, Semana y Mes del calendario administrativo (Sprints y
 * reuniones de Administración).
 *
 * Es la MISMA interfaz del calendario del estudiante: la rejilla mensual
 * compartida (`CalendarMonthGrid`) y la cuadrícula por horas (`TimeGridView`),
 * con el rango y la navegación de `lib/calendar/vista`. Lo propio es el
 * contenido: en Mes cada día lleva cuántas finalizaciones y cuántas reuniones
 * caen en él (los nombres no escalan a decenas de proyectos); en Día y Semana
 * las reuniones van a su hora real y las finalizaciones —un día calendario,
 * sin hora— en la franja «Todo el día». La columna lateral muestra el día
 * elegido en vez de las tarjetas del estudiante. Hoy se marca con el acento.
 *
 * El día elegido es el ancla de las tres vistas: lo lleva la página (vive en
 * la URL) y las flechas lo mueven un día, una semana o un mes. «Hoy» es el día
 * que usó el servidor (Guatemala), y qué Sprint venció lo dice su `situacion`.
 * Los Sprints salen del payload único de la página; las reuniones se piden
 * por el rango visible y solo se leen: aquí no se crea ni se gestiona nada.
 */
const ETIQUETA_PASO: Record<VistaCalendario, { anterior: string; siguiente: string; periodo: string }> = {
  dia: { anterior: 'Día anterior', siguiente: 'Día siguiente', periodo: 'este día' },
  semana: { anterior: 'Semana anterior', siguiente: 'Semana siguiente', periodo: 'esta semana' },
  mes: { anterior: 'Mes anterior', siguiente: 'Mes siguiente', periodo: 'este mes' },
};

export function AdminCalendarView({
  vista,
  hoy,
  selectedKey,
  onSelectDay,
  onVerDia,
  itemsByDay,
  busqueda,
  selectorVista,
  onProgramarReunion,
}: {
  vista: VistaCalendario;
  /** Día actual `YYYY-MM-DD` según el backend. */
  hoy: string;
  /** Día seleccionado `YYYY-MM-DD`; lo lleva la página porque vive en la URL (`?fecha=`). */
  selectedKey: string;
  onSelectDay: (dia: string) => void;
  /** Semana: el «+N» de un horario cargado abre ese día en la vista Día. */
  onVerDia: (dia: string) => void;
  /** Sprints (ya filtrados) por día de finalización esperada. */
  itemsByDay: ReadonlyMap<string, AdminSprintCalendarItem[]>;
  /** Búsqueda de la página: también filtra reuniones por título o proyecto. El filtro de situación no les aplica. */
  busqueda: string;
  /** Selector Día | Semana | Mes | Lista de la página: abre la barra de navegación, a la izquierda. */
  selectorVista: ReactNode;
  /** Abre «Programar reunión» con el día elegido (solo hoy o días futuros). */
  onProgramarReunion?: (dia: string) => void;
}) {
  const ancla = parseFechaSolo(selectedKey);
  const rango = useMemo(() => rangoVisible(vista, parseFechaSolo(selectedKey)), [vista, selectedKey]);
  const reunionesQuery = useAdminMeetingsInRange(rango.desde, rango.hasta);
  const { visibles, inconsistentes } = useMemo(
    () => separarReunionesVisibles(reunionesQuery.data?.reuniones ?? []),
    [reunionesQuery.data],
  );
  const reuniones = useMemo(() => searchReuniones(visibles, busqueda), [visibles, busqueda]);
  const porDia = useMemo(
    () => agruparEntradasPorDia(itemsByDay, reuniones, rango.desde, rango.hasta),
    [itemsByDay, reuniones, rango],
  );
  const reunionesListas = reunionesQuery.isSuccess && !reunionesQuery.isPlaceholderData;
  const agendaPorDia = useMemo(
    () => new Map([...porDia].map(([dia, entradas]) => [dia, entradas.map((e) => e.agenda)])),
    [porDia],
  );

  // La línea de «ahora» de la cuadrícula avanza cada minuto, como en el calendario del estudiante.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Entrada elegida en Día o Semana: su tarjeta del panel se resalta y se hace visible.
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const elegirEntrada = (entrada: EntradaAdmin) => {
    setSeleccion(entradaKey(entrada));
    onSelectDay(entrada.dia);
  };
  const elegirDia = (dia: string) => {
    setSeleccion(null);
    onSelectDay(dia);
  };

  // Resumen del periodo: en Mes solo cuentan los días del mes (no el relleno de la rejilla).
  const diasDelPeriodo = rango.days.filter((day) => vista !== 'mes' || day.inCurrentMonth).map((day) => day.key);
  let finalizacionesDelPeriodo = 0;
  for (const dia of diasDelPeriodo) finalizacionesDelPeriodo += itemsByDay.get(dia)?.length ?? 0;
  const reunionesDelPeriodo = contarReunionesEnDias(porDia, diasDelPeriodo);

  const delDia = porDia.get(selectedKey) ?? [];
  const sprintsDelDia = delDia.filter((e) => e.origen === 'SPRINT_FINALIZACION').length;
  const reunionesDelDia = delDia.length - sprintsDelDia;

  // Carrusel vertical del día: la lista toma el alto del calendario y, si las
  // tarjetas no caben, se desplaza. Es scroll nativo (rueda, tacto y teclado
  // funcionan solos); las flechas solo aparecen cuando hay algo que mover.
  const listaRef = useRef<HTMLUListElement>(null);
  const [desplazable, setDesplazable] = useState({ arriba: false, abajo: false });
  const medirLista = () => {
    const lista = listaRef.current;
    if (!lista) return;
    setDesplazable({
      arriba: lista.scrollTop > 1,
      abajo: lista.scrollTop + lista.clientHeight < lista.scrollHeight - 1,
    });
  };
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    lista.scrollTop = 0;
    // El observador avisa al empezar a observar y cada vez que cambia el alto disponible.
    const observador = new ResizeObserver(medirLista);
    observador.observe(lista);
    return () => observador.disconnect();
  }, [selectedKey, delDia.length]);
  useEffect(() => {
    if (seleccion) listaRef.current?.querySelector(`[data-entrada="${seleccion}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [seleccion, delDia.length]);
  const moverLista = (direccion: 1 | -1) => {
    const lista = listaRef.current;
    lista?.scrollBy({ top: direccion * lista.clientHeight * 0.8 });
  };

  const pasos = ETIQUETA_PASO[vista];
  const mover = (paso: 1 | -1) => elegirDia(toDateKey(navegar(vista, ancla, paso)));

  return (
    <div>
      {/* Barra de navegación con la distribución del calendario del estudiante: vistas a la
          izquierda; Hoy, flechas y periodo visible a la derecha. */}
      <div className="flex flex-wrap items-center justify-between gap-x-gap gap-y-tight">
        {selectorVista}
        <div className="flex min-w-0 items-center gap-tight">
          <Button type="button" variant="outline" className="h-8 rounded-pill px-3 text-xs font-bold" onClick={() => elegirDia(hoy)}>
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 shrink-0 rounded-pill p-0"
            aria-label={pasos.anterior}
            onClick={() => mover(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 shrink-0 rounded-pill p-0"
            aria-label={pasos.siguiente}
            onClick={() => mover(1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          {/* Las dos etiquetas ya llegan con su mayúscula inicial (`capitalize` daría «28 De Octubre De 2026»). */}
          <h2 className="type-subtitle min-w-0 text-text-primary" aria-live="polite">
            {vista === 'mes' ? formatMonthLabel(ancla.getFullYear(), ancla.getMonth()) : etiquetaRango(vista, ancla)}
          </h2>
        </div>
      </div>

      {/* Resumen del periodo visible, bajo la barra. */}
      <div className="mb-4 mt-tight flex flex-wrap items-center gap-x-gap gap-y-micro">
        <span className="type-meta tabular-nums">
          {finalizacionesDelPeriodo === 0
            ? `Sin finalizaciones planificadas ${pasos.periodo}`
            : `${contarFinalizaciones(finalizacionesDelPeriodo)} ${pasos.periodo}`}
        </span>
        {/* Conteo secundario: solo cuando la consulta del rango terminó (nunca un cero provisional). */}
        {reunionesListas ? (
          <span className="type-meta tabular-nums">{contarReuniones(reunionesDelPeriodo)}</span>
        ) : (
          reunionesQuery.isFetching && (
            <span className="type-meta" role="status">
              Cargando reuniones…
            </span>
          )
        )}
      </div>

      {/* Un fallo de reuniones no se ve como «sin reuniones»: se avisa y los Sprints siguen operativos. */}
      {reunionesQuery.isError && (
        <div role="alert" className="card-base mb-4 flex flex-wrap items-center justify-between gap-inline">
          <p className="type-body flex items-center gap-tight text-text-primary">
            <AlertCircle className="size-4 shrink-0 text-status-error" aria-hidden="true" />
            No se pudieron cargar las reuniones administrativas.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reunionesQuery.refetch()} disabled={reunionesQuery.isFetching}>
            Reintentar
          </Button>
        </div>
      )}
      {reunionesListas && (reunionesQuery.data.completo === false || inconsistentes > 0) && (
        <p role="status" className="type-meta mb-4">
          {reunionesQuery.data.completo === false && 'Hay más reuniones en este periodo de las que se pudieron cargar; el conteo puede estar incompleto. '}
          {inconsistentes > 0 &&
            `${inconsistentes === 1 ? '1 reunión no se muestra' : `${inconsistentes} reuniones no se muestran`} porque sus datos no son consistentes.`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-[1fr_320px]">
        <div className="@container/mes min-w-0">
          {vista === 'mes' ? (
            <CalendarMonthGrid
              year={ancla.getFullYear()}
              month={ancla.getMonth()}
              todayKey={hoy}
              todayTone="accent"
              selectedKey={selectedKey}
              onSelectDay={elegirDia}
              getDayLabel={(day) => {
                const sprints = itemsByDay.get(day.key) ?? [];
                const enReunion = contarReunionesEnDias(porDia, [day.key]);
                return `${formatDiaLargoConAnio(day.key)}${day.key === hoy ? ', hoy' : ''}, ${
                  sprints.length === 0 ? 'sin finalizaciones planificadas' : contarFinalizaciones(sprints.length)
                }${sprints.some((item) => item.situacion === 'PLAN_VENCIDO') ? ', con plan vencido' : ''}${
                  enReunion > 0 ? `, ${contarReuniones(enReunion)}` : ''
                }`;
              }}
              renderDay={(day) => {
                const sprints = itemsByDay.get(day.key) ?? [];
                const enReunion = contarReunionesEnDias(porDia, [day.key]);
                const conVencido = sprints.some((item) => item.situacion === 'PLAN_VENCIDO');
                return (
                  <>
                    {sprints.length > 0 && (
                      <span className={`${CALENDAR_DAY_CHIP_CLASS} tabular-nums`}>
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-pill ${conVencido ? 'bg-attention' : 'bg-primary'}`}
                        />
                        <span className="truncate">
                          {sprints.length}
                          {/* La palabra solo cuando la celda tiene ancho para ella. */}
                          <span className="hidden @xl/mes:inline"> {sprints.length === 1 ? 'Sprint' : 'Sprints'}</span>
                        </span>
                      </span>
                    )}
                    {enReunion > 0 && (
                      <span className={`${CALENDAR_DAY_CHIP_CLASS} tabular-nums`}>
                        {/* En una celda angosta el ícono no cabe junto al número: punto del tono de Reunión. */}
                        <span aria-hidden="true" className="hidden @xl/mes:contents">
                          <IconoTipoEvento tipo="REUNION" tono={3} />
                        </span>
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-pill @xl/mes:hidden ${TONO_CLASES[3].punto}`} />
                        <span className="truncate">
                          {enReunion}
                          <span className="hidden @xl/mes:inline"> {enReunion === 1 ? 'reunión' : 'reuniones'}</span>
                        </span>
                      </span>
                    )}
                  </>
                );
              }}
            />
          ) : (
            <TimeGridView
              days={rango.days}
              todayKey={hoy}
              itemsByDay={agendaPorDia}
              ahora={ahora}
              onVerDia={onVerDia}
              onSelectEvento={(item) => {
                const entrada = porDia
                  .get(item.key)
                  ?.find((e) => e.origen === 'REUNION_ADMINISTRATIVA' && e.reunion.idReunion === item.id);
                if (entrada) elegirEntrada(entrada);
              }}
              renderTodoElDia={(item) => {
                if (item.kind !== 'tarea') return undefined;
                const entrada = porDia
                  .get(item.key)
                  ?.find((e) => e.origen === 'SPRINT_FINALIZACION' && e.sprint.idSprint === item.id);
                return entrada?.origen === 'SPRINT_FINALIZACION' ? (
                  <FichaFinalizacion sprint={entrada.sprint} onSelect={() => elegirEntrada(entrada)} />
                ) : undefined;
              }}
            />
          )}
        </div>

        {/* Donde el estudiante tiene «Mis Proyectos», el admin ve el día elegido:
            una tarjeta con la fecha y, debajo, una tarjeta por actividad. Desde `lg`
            la columna mide lo mismo que el calendario (capa absoluta: no estira
            la fila) y la lista se desplaza dentro de ese alto. */}
        <section aria-labelledby="sprints-dia-titulo" className="relative min-h-0">
          <div className="flex flex-col gap-gap lg:absolute lg:inset-0">
            <div className="card-base flex shrink-0 items-start justify-between gap-inline" aria-live="polite">
              <div className="min-w-0">
                <h2 id="sprints-dia-titulo" className="type-subtitle text-text-primary">
                  {formatDiaLargoConAnio(selectedKey)}
                </h2>
                {sprintsDelDia > 0 && <p className="type-meta mt-micro tabular-nums">{contarFinalizaciones(sprintsDelDia)}</p>}
                {reunionesDelDia > 0 && <p className="type-meta mt-micro tabular-nums">{contarReuniones(reunionesDelDia)}</p>}
                {onProgramarReunion && selectedKey >= hoy && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onProgramarReunion(selectedKey)}
                    className="-ml-tight mt-micro h-8 gap-1.5 rounded-pill px-tight text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary"
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    Programar reunión este día
                  </Button>
                )}
              </div>
              {delDia.length > 0 && (desplazable.arriba || desplazable.abajo) && (
                <div className="flex shrink-0 gap-micro">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-8 rounded-control p-0"
                    aria-label="Actividades anteriores"
                    disabled={!desplazable.arriba}
                    onClick={() => moverLista(-1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-8 rounded-control p-0"
                    aria-label="Actividades siguientes"
                    disabled={!desplazable.abajo}
                    onClick={() => moverLista(1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>

            {/* Día sin actividad: mismo vacío que «Nada programado ese día» del calendario del estudiante. */}
            {delDia.length === 0 && (
              <Empty className="surface-enter flex-none" aria-live="polite">
                {/* 25 % más pequeño que el vacío del estudiante (64→48 px, 28→21 px, 20→15 px). */}
                <EmptyMedia variant="icon" className="size-12 ring-6">
                  <CalendarDays aria-hidden="true" className="size-[21px]" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle className="text-[15px]">
                    {/* Sin la consulta de reuniones terminada no se afirma que no haya reuniones. */}
                    {reunionesListas
                      ? 'No hay finalizaciones ni reuniones para este día.'
                      : 'No hay finalizaciones planificadas para este día.'}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}

            {delDia.length > 0 && (
              <ul
                ref={listaRef}
                onScroll={medirLista}
                aria-label={`Actividades del ${formatDiaLargoConAnio(selectedKey)}`}
                className="-mx-1 flex flex-col gap-gap px-1 pb-1 motion-safe:scroll-smooth lg:min-h-0 lg:flex-1 lg:snap-y lg:overflow-y-auto lg:overscroll-contain"
              >
                {delDia.map((entrada) => {
                  const clave = entradaKey(entrada);
                  return entrada.origen === 'SPRINT_FINALIZACION' ? (
                    <DiaSprintRow key={clave} clave={clave} item={entrada.sprint} seleccionada={seleccion === clave} />
                  ) : (
                    <DiaReunionRow key={clave} clave={clave} reunion={entrada.reunion} seleccionada={seleccion === clave} />
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Finalización de un Sprint en la franja «Todo el día»: punto de su estado, proyecto y Sprint. */
function FichaFinalizacion({ sprint, onSelect }: { sprint: AdminSprintCalendarItem; onSelect: () => void }) {
  const vencido = sprint.situacion === 'PLAN_VENCIDO';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Finalización planificada: ${sprint.tituloProyecto}, Sprint ${sprint.numero}, ${SITUACION_SPRINT_LABEL_CORTA[sprint.situacion]}`}
      className="flex min-h-6 w-full items-center gap-1 rounded-control border border-outline-variant/60 bg-surface-container-lowest px-1.5 py-0.5 text-left type-micro text-text-primary outline-none hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className={`size-1.5 shrink-0 rounded-pill ${vencido ? 'bg-attention' : 'bg-primary'}`} aria-hidden="true" />
      <span className="truncate">
        {sprint.tituloProyecto} · Sprint {sprint.numero}
      </span>
    </button>
  );
}

const TARJETA = 'card-base shrink-0 lg:snap-start';
/** La tarjeta elegida en Día o Semana: borde primario, no solo color de fondo, y `aria-current`. */
const TARJETA_ELEGIDA = 'border-primary ring-1 ring-primary';

/** Tarjeta de un Sprint que finaliza el día elegido: proyecto, Sprint, situación, líder y fecha. */
function DiaSprintRow({ item, clave, seleccionada }: { item: AdminSprintCalendarItem; clave: string; seleccionada: boolean }) {
  const dias = describeDiasRestantes(item);
  return (
    <li data-entrada={clave} aria-current={seleccionada || undefined} className={`${TARJETA} ${seleccionada ? TARJETA_ELEGIDA : ''}`}>
      <p className="type-body break-words font-semibold text-text-primary">{item.tituloProyecto}</p>
      <p className="mt-micro flex flex-wrap items-center gap-tight">
        <span className="type-body font-medium">Sprint {item.numero}</span>
        <span className={`pill whitespace-nowrap ${SITUACION_SPRINT_TONE[item.situacion]}`}>
          {SITUACION_SPRINT_LABEL_CORTA[item.situacion]}
        </span>
      </p>
      <dl className="mt-tight grid grid-cols-[auto_1fr] gap-x-inline gap-y-micro type-meta">
        <dt>Líder</dt>
        <dd className="font-medium text-text-primary">
          {item.lider.nombre} {item.lider.apellido}
        </dd>
        <dt>Finalización</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {item.fechaFinPlaneada ? formatDiaConAnio(item.fechaFinPlaneada) : 'Sin fecha'}
          {dias && <span className="font-normal text-text-secondary"> · {dias}</span>}
        </dd>
      </dl>
      <Link
        href={adminProjectHref(item.idProyecto)}
        aria-label={`Ver proyecto ${item.tituloProyecto}`}
        className="type-meta mt-tight inline-flex items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Ver proyecto
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Tarjeta de una reunión de Administración: título, estado, descripción,
 * fecha, horario, modalidad con su lugar y enlace, equipos, convocados,
 * organizador y proyectos convocados (enlazan al detalle administrativo de
 * cada proyecto). El total de convocados sale de `/participantes`.
 */
function DiaReunionRow({ reunion, clave, seleccionada }: { reunion: ReunionVisible; clave: string; seleccionada: boolean }) {
  const { contenido } = reunion;
  const modalidad = MODALIDAD_ESTILO[contenido.modalidad];
  const participantes = useAdminMeetingParticipants(reunion.idReunion);
  const equipos = reunion.proyectos.length;
  const convocados = participantes.data?.totalDestinatariosUnicos;
  const enlace = safeExternalHref(contenido.linkSesion ?? null);
  return (
    <li data-entrada={clave} aria-current={seleccionada || undefined} className={`${TARJETA} ${seleccionada ? TARJETA_ELEGIDA : ''}`}>
      <p className="type-body break-words font-semibold text-text-primary">{contenido.tituloEvento}</p>
      <p className="mt-micro flex flex-wrap items-center gap-tight">
        <span className="type-body inline-flex items-center gap-micro font-medium">
          <span aria-hidden="true">
            <IconoTipoEvento tipo="REUNION" tono={3} />
          </span>
          Reunión administrativa
        </span>
        <span className={`pill ${reunion.estado === 'ACTIVA' ? 'pill-success' : 'pill-neutral'}`}>
          {reunion.estado === 'ACTIVA' ? 'Programada' : reunion.estado === 'PASADA' ? 'Realizada' : 'Cancelada'}
        </span>
      </p>
      {contenido.descripcionEvento && (
        <p className="type-meta mt-tight whitespace-pre-line break-words text-text-primary">{contenido.descripcionEvento}</p>
      )}
      <dl className="mt-tight grid grid-cols-[auto_1fr] gap-x-inline gap-y-micro type-meta">
        <dt>Fecha</dt>
        <dd className="font-medium tabular-nums text-text-primary">{formatDiaConAnio(diaInicioReunion(contenido))}</dd>
        <dt>Horario</dt>
        <dd className="font-medium tabular-nums text-text-primary">{describirHorarioReunion(contenido)}</dd>
        <dt>Modalidad</dt>
        <dd className="inline-flex min-w-0 items-center gap-micro font-medium text-text-primary">
          <modalidad.icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">
            {modalidad.label}
            {contenido.ubicacionNombre && <span className="font-normal text-text-secondary"> · {contenido.ubicacionNombre}</span>}
          </span>
        </dd>
        {enlace && (
          <>
            <dt>Enlace</dt>
            <dd className="min-w-0">
              <a
                href={enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="truncate">{new URL(enlace).hostname}</span>
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </dd>
          </>
        )}
        <dt>Equipos</dt>
        <dd className="font-medium tabular-nums text-text-primary">{equipos === 1 ? '1 equipo' : `${equipos} equipos`}</dd>
        <dt>Convocados</dt>
        <dd className="font-medium tabular-nums text-text-primary">
          {convocados !== undefined
            ? convocados === 1
              ? '1 persona'
              : `${convocados} personas`
            : participantes.isError
              ? <span className="font-normal text-text-secondary">No disponible</span>
              : <span className="font-normal text-text-secondary">Cargando…</span>}
        </dd>
        <dt>Organiza</dt>
        <dd className="font-medium text-text-primary">
          {reunion.creador.nombre} {reunion.creador.apellido}
        </dd>
      </dl>
      <p className="type-meta mt-tight">Proyectos convocados</p>
      <ul className="mt-micro flex flex-col gap-micro" aria-label={`Proyectos convocados a ${contenido.tituloEvento}`}>
        {reunion.proyectos.map((proyecto) => (
          <li key={proyecto.idProyecto}>
            <Link
              href={adminProjectHref(proyecto.idProyecto)}
              aria-label={`Ver proyecto ${proyecto.tituloProyecto}`}
              className="type-meta inline-flex max-w-full items-center gap-micro rounded-control font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="break-words">{proyecto.tituloProyecto}</span>
              <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}
