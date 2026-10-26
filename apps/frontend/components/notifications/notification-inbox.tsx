'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useConteoNoLeidas } from '@/hooks/use-notifications';
import { aviso } from '@/lib/mensajes';
import {
  getNotificacionesPagina,
  getProyectosDeNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  type FiltrosBandeja,
  type FiltrosMarcado,
  type Notificacion,
  type NotificacionesPagina,
} from '@/lib/services/notifications';
import { INBOX_CATEGORIES } from '@/lib/notifications/inbox-model';
import type { NotificationGroupId } from '@/lib/notifications/preference-groups';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { InboxList } from './inbox-list';
import { InboxToolbar, type InboxProjectFilter, type InboxReadTab } from './inbox-toolbar';
import { MOBILE_QUERY, INBOX_PANELS_AUTOSAVE_ID, useMediaQuery } from './inbox-preferences';
import { NotificationReaderContent, NotificationReaderEmpty, NotificationReaderToolbar } from './notification-reader';

/**
 * Reparto bandeja/visor en porcentaje del ancho tras la sidebar global
 * (~1200 px en escritorio): ~420 px por defecto, ~300 px mínimo, ~600 px máximo.
 */
const LISTA_DEFAULT = 35;
const LISTA_MIN = 25;
const LISTA_MAX = 50;

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

function etiquetaMarcar(categoria: NotificationGroupId | null, busqueda: string, proyecto: InboxProjectFilter, lectura: InboxReadTab): string {
  const hayOtros = busqueda.trim() !== '' || proyecto !== null || lectura === 'leidas';
  if (hayOtros) return 'Marcar filtradas como leídas';
  if (categoria) return 'Marcar como leídas las de esta categoría';
  return 'Marcar todas como leídas';
}

/**
 * Sprint 10 — bandeja de notificaciones (HU-198 + rediseño Outlook/Gmail).
 * La página la monta como fila a altura de ventana (patrón del workspace del
 * proyecto): bandeja pegada a la sidebar global y visor con scroll propio
 * hasta el borde derecho. El título vive en la columna de la bandeja y el
 * marcado masivo en la barra del visor. Tres regiones: la sidebar global queda
 * fuera (DashboardLayout); aquí van la bandeja compacta (con categoría,
 * proyecto, lectura y orden en su barra de filtros) y el visor. Todo
 * filtro viaja al servidor (tipos, leída, q, proyecto, orden) y se aplica
 * antes de paginar: los contadores y «marcar filtradas» abarcan toda la
 * colección, no la página cargada.
 */
export function NotificationInbox() {
  const queryClient = useQueryClient();
  const esMovil = useMediaQuery(MOBILE_QUERY);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [categoria, setCategoria] = useState<NotificationGroupId | null>(null);
  const [lectura, setLectura] = useState<InboxReadTab>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [proyecto, setProyecto] = useState<InboxProjectFilter>(null);
  const [orden, setOrden] = useState<'desc' | 'asc'>('desc');

  const tipos = useMemo(() => INBOX_CATEGORIES.find((c) => c.id === categoria)?.tipos, [categoria]);
  const filtrosMarcado = useMemo<FiltrosMarcado>(
    () => ({ tipos, q: busqueda.trim() || undefined, proyecto: proyecto ?? undefined }),
    [tipos, busqueda, proyecto],
  );
  const filtros = useMemo<FiltrosBandeja>(
    () => ({ ...filtrosMarcado, leida: lectura === 'todas' ? undefined : lectura === 'leidas', orden }),
    [filtrosMarcado, lectura, orden],
  );
  const hayFiltros = categoria !== null || lectura !== 'todas' || busqueda.trim() !== '' || proyecto !== null;

  const limpiarFiltros = () => {
    setCategoria(null);
    setLectura('todas');
    setBusqueda('');
    setProyecto(null);
  };

  // ── Datos ──────────────────────────────────────────────────────────────────
  const lista = useInfiniteQuery({
    queryKey: ['notificaciones', 'bandeja', filtros],
    queryFn: ({ pageParam }) => getNotificacionesPagina(pageParam, filtros),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.page < ultima.totalPages ? ultima.page + 1 : undefined),
    refetchOnMount: 'always',
    placeholderData: (previa) => previa,
  });
  const notificaciones = useMemo(() => lista.data?.pages.flatMap((p) => p.data) ?? [], [lista.data]);
  const totalFiltrado = lista.data?.pages[0]?.total ?? 0;

  // Sin leer dentro del MISMO filtro (sin la pestaña de lectura): es lo que
  // «marcar filtradas» va a tocar y lo que el encabezado anuncia.
  const noLeidasFiltro = useQuery({
    queryKey: ['notificaciones', 'bandeja-no-leidas', filtrosMarcado],
    queryFn: () => getNotificacionesPagina(1, { ...filtrosMarcado, leida: false }),
    select: (pagina) => pagina.total,
  });
  // Conteo global de no leídas (badge «N nuevas»), distinto del total filtrado y
  // de las no leídas dentro del filtro que anuncia la cabecera de la bandeja.
  const { data: conteoGlobal } = useConteoNoLeidas();
  const nuevas = conteoGlobal?.total ?? 0;

  const { data: proyectos = [] } = useQuery({ queryKey: ['notificaciones', 'proyectos'], queryFn: getProyectosDeNotificaciones, staleTime: 60 * 1000 });

  // ── Selección y lectura ────────────────────────────────────────────────────
  // El aviso seleccionado se guarda entero junto con la clave del filtro que lo
  // listaba: si ese mismo filtro deja de mostrarlo (p. ej. «No leídas» al
  // leerlo), el visor lo conserva; si el usuario cambia de filtro y ya no
  // pertenece al resultado, la selección se limpia y el visor queda vacío.
  const claveFiltros = JSON.stringify(filtrosMarcado) + (lectura === 'todas' ? '' : lectura);
  const [seleccion, setSeleccion] = useState<{ aviso: Notificacion; clave: string } | null>(null);
  const seleccionada = seleccion?.aviso ?? null;
  const setSeleccionada = useCallback(
    (valor: Notificacion | null | ((actual: Notificacion | null) => Notificacion | null)) => {
      setSeleccion((actual) => {
        const siguiente = typeof valor === 'function' ? valor(actual?.aviso ?? null) : valor;
        return siguiente ? { aviso: siguiente, clave: actual && actual.aviso.idNotificacion === siguiente.idNotificacion ? actual.clave : claveFiltros } : null;
      });
    },
    [claveFiltros],
  );
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'detalle'>('lista');

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  }, [queryClient]);

  const marcarUna = useMutation({
    mutationFn: marcarLeida,
    onSuccess: (actualizada) => {
      setSeleccionada((actual) => (actual && actual.idNotificacion === actualizada.idNotificacion ? { ...actual, leidaEn: actualizada.leidaEn } : actual));
      // La fila pierde el énfasis de no leída al instante, sin esperar a que la lista vuelva del servidor.
      queryClient.setQueriesData<InfiniteData<NotificacionesPagina>>({ queryKey: ['notificaciones', 'bandeja'] }, (datos) =>
        datos?.pages
          ? {
              ...datos,
              pages: datos.pages.map((pagina) => ({
                ...pagina,
                data: pagina.data.map((x) => (x.idNotificacion === actualizada.idNotificacion ? { ...x, leidaEn: actualizada.leidaEn } : x)),
              })),
            }
          : datos,
      );
      invalidar();
    },
    onError: () => aviso.error('No se pudo marcar como leída', 'Inténtalo de nuevo en unos segundos.'),
  });

  // Evita repetir la petición si el usuario vuelve a abrir el mismo aviso
  // antes de que la lista se refresque.
  const marcandoIds = useRef(new Set<number>());
  const leerAlAbrir = useCallback(
    (n: Notificacion) => {
      if (n.leidaEn !== null || marcandoIds.current.has(n.idNotificacion)) return;
      marcandoIds.current.add(n.idNotificacion);
      marcarUna.mutate(n.idNotificacion, { onSettled: () => marcandoIds.current.delete(n.idNotificacion) });
    },
    [marcarUna],
  );

  const seleccionar = useCallback(
    (n: Notificacion) => {
      setSeleccionada(n);
      setVistaMovil('detalle');
      leerAlAbrir(n);
    },
    [leerAlAbrir, setSeleccionada],
  );

  // La fila refrescada (p. ej. ya leída) manda sobre la copia guardada. Fuera de
  // la lista, la copia solo se muestra mientras el filtro sea el que la listó
  // (o la lista aún carga); con otro filtro, el visor se vacía.
  const indice = seleccionada ? notificaciones.findIndex((n) => n.idNotificacion === seleccionada.idNotificacion) : -1;
  const mostrada = indice >= 0 ? notificaciones[indice] : seleccion && (seleccion.clave === claveFiltros || lista.isPending) ? seleccionada : null;
  const anterior = indice > 0 ? notificaciones[indice - 1] : null;
  const siguiente = indice >= 0 && indice < notificaciones.length - 1 ? notificaciones[indice + 1] : null;
  const irAnterior = anterior ? () => seleccionar(anterior) : undefined;
  const irSiguiente = siguiente
    ? () => seleccionar(siguiente)
    : indice >= 0 && lista.hasNextPage
      ? () => {
          if (!lista.isFetchingNextPage) lista.fetchNextPage();
        }
      : undefined;

  const marcarFiltradas = useMutation({
    mutationFn: () => marcarTodasLeidas(filtrosMarcado),
    onSuccess: ({ actualizadas }) => {
      invalidar();
      aviso.exito(actualizadas === 0 ? 'No había avisos pendientes' : `${plural(actualizadas, 'aviso marcado', 'avisos marcados')} como leídos`);
    },
    onError: () => aviso.error('No se pudieron marcar las notificaciones'),
  });

  // ── Panel de la bandeja (restablecer el reparto) ──────────────────────────
  const panelLista = useRef<ImperativePanelHandle>(null);
  const restablecerReparto = () => panelLista.current?.resize(LISTA_DEFAULT);

  // «Sin leer» del encabezado = lo que «marcar filtradas» tocaría: bajo la
  // pestaña Leídas no hay nada que marcar.
  const pendientesFiltro = lectura === 'leidas' ? 0 : (noLeidasFiltro.data ?? (lectura === 'no-leidas' ? totalFiltrado : 0));

  const etiquetaMarcado = etiquetaMarcar(categoria, busqueda, proyecto, lectura);

  // Título de la página dentro de la columna de la bandeja (sin cabecera aparte).
  const cabeceraBandeja = (
    <div className="flex shrink-0 items-start gap-tight px-stack pb-tight pt-inline">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-tight">
          <h1 className="type-display">Notificaciones</h1>
          {nuevas > 0 && (
            <span className="pill pill-accent">
              {nuevas} nueva{nuevas !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <h2 className="mt-micro text-sm font-bold text-on-surface">Bandeja de entrada</h2>
        <p className="type-meta truncate text-[11px]" aria-live="polite">
          {lista.isPending ? 'Cargando…' : `${plural(totalFiltrado, 'aviso', 'avisos')} · ${pendientesFiltro} sin leer`}
        </p>
      </div>
    </div>
  );

  const toolbar = (
    <InboxToolbar
      busqueda={busqueda}
      onBusqueda={setBusqueda}
      proyecto={proyecto}
      onProyecto={setProyecto}
      proyectos={proyectos}
      orden={orden}
      onOrden={setOrden}
      lectura={lectura}
      onLectura={setLectura}
      categoria={categoria}
      onCategoria={setCategoria}
    />
  );

  const listado = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-busy={lista.isPlaceholderData || undefined}>
      <InboxList
        notificaciones={notificaciones}
        seleccionadaId={seleccionada?.idNotificacion ?? null}
        onSeleccionar={seleccionar}
        isLoading={lista.isPending}
        isError={lista.isError}
        onReintentar={() => lista.refetch()}
        hasNextPage={Boolean(lista.hasNextPage)}
        isFetchingNextPage={lista.isFetchingNextPage}
        onCargarMas={() => lista.fetchNextPage()}
        filtrada={hayFiltros}
        onLimpiarFiltros={limpiarFiltros}
      />
    </div>
  );

  const visor = (
    <div className="flex h-full min-h-0 flex-col">
      <NotificationReaderToolbar
        onAnterior={irAnterior}
        onSiguiente={irSiguiente}
        onMarcarLeida={mostrada && mostrada.leidaEn === null ? () => marcarUna.mutate(mostrada.idNotificacion) : undefined}
        marcando={marcarUna.isPending}
        onMarcarFiltradas={() => marcarFiltradas.mutate()}
        etiquetaMarcarFiltradas={etiquetaMarcado}
        marcarFiltradasDeshabilitado={marcarFiltradas.isPending || pendientesFiltro === 0}
        onVolver={esMovil ? () => setVistaMovil('lista') : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mostrada ? (
          <NotificationReaderContent key={mostrada.idNotificacion} notificacion={mostrada} />
        ) : (
          <NotificationReaderEmpty />
        )}
      </div>
    </div>
  );

  return (
    <>
      {esMovil ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-page">
          {vistaMovil === 'detalle' && mostrada ? (
            visor
          ) : (
            <div role="region" aria-label="Bandeja de entrada" className="flex min-h-0 flex-1 flex-col">
              {cabeceraBandeja}
              {toolbar}
              {listado}
            </div>
          )}
        </div>
      ) : (
        <ResizablePanelGroup direction="horizontal" autoSaveId={INBOX_PANELS_AUTOSAVE_ID} className="min-w-0 flex-1 bg-page">
          <ResizablePanel
            ref={panelLista}
            role="region"
            aria-label="Bandeja de entrada"
            defaultSize={LISTA_DEFAULT}
            minSize={LISTA_MIN}
            maxSize={LISTA_MAX}
            className="flex min-h-0 flex-col"
          >
            {cabeceraBandeja}
            {toolbar}
            {listado}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label="Redimensionar bandeja"
            title="Arrastra para redimensionar; doble clic para restablecer"
            onDoubleClick={restablecerReparto}
            className="w-1.5 bg-outline-variant/40 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 data-[resize-handle-active]:bg-primary/60 [&>div]:border-outline-variant [&>div]:bg-surface-container-lowest motion-reduce:transition-none"
          />
          <ResizablePanel className="flex min-h-0 flex-col">{visor}</ResizablePanel>
        </ResizablePanelGroup>
      )}
    </>
  );
}
