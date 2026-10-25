'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
} from '@/lib/services/notifications';
import { INBOX_CATEGORIES, conteosPorCategoria } from '@/lib/notifications/inbox-model';
import type { NotificationGroupId } from '@/lib/notifications/preference-groups';
import { cn } from '@/lib/utils';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { InboxFoldersSidebar, type InboxFoldersSelection } from './inbox-folders-sidebar';
import { InboxList } from './inbox-list';
import { InboxToolbar, type InboxProjectFilter, type InboxReadTab } from './inbox-toolbar';
import { MOBILE_QUERY, RAIL_ONLY_QUERY, INBOX_PANELS_AUTOSAVE_ID, useInboxFoldersCollapsed, useMediaQuery } from './inbox-preferences';
import { NotificationReaderContent, NotificationReaderEmpty, NotificationReaderToolbar } from './notification-reader';

/** Reparto por defecto bandeja/visor (porcentaje del ancho disponible; ~340 px en un portátil). */
const LISTA_DEFAULT = 36;
const LISTA_MIN = 24;
const LISTA_MAX = 55;

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;

function etiquetaMarcar(categoria: NotificationGroupId | null, busqueda: string, proyecto: InboxProjectFilter, lectura: InboxReadTab): string {
  const hayOtros = busqueda.trim() !== '' || proyecto !== null || lectura === 'leidas';
  if (hayOtros) return 'Marcar filtradas como leídas';
  if (categoria) return 'Marcar como leídas las de esta categoría';
  return 'Marcar todas como leídas';
}

/**
 * Sprint 10 — bandeja de notificaciones (HU-198 + rediseño Outlook/Gmail).
 * La página la envuelve en el contenedor compartido (`dashboardPage`) a altura
 * de ventana: cabecera arriba y, debajo, los paneles con scroll propio.
 * Cuatro regiones: la sidebar global queda fuera (DashboardLayout); aquí van
 * la sidebar secundaria de carpetas, la bandeja compacta y el visor. Todo
 * filtro viaja al servidor (tipos, leída, q, proyecto, orden) y se aplica
 * antes de paginar: los contadores y «marcar filtradas» abarcan toda la
 * colección, no la página cargada.
 */
export function NotificationInbox() {
  const queryClient = useQueryClient();
  const esMovil = useMediaQuery(MOBILE_QUERY);
  const soloRail = useMediaQuery(RAIL_ONLY_QUERY);
  const { collapsed: carpetasPref, toggleCollapsed: alternarCarpetas } = useInboxFoldersCollapsed();
  const carpetasContraidas = soloRail || carpetasPref;

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

  const seleccionCarpetas: InboxFoldersSelection = { bandeja: lectura === 'no-leidas' ? 'no-leidas' : 'recibidas', categoria };
  const elegirCarpeta = (s: InboxFoldersSelection) => {
    setCategoria(s.categoria);
    if (s.bandeja === 'no-leidas') setLectura('no-leidas');
    else if (lectura === 'no-leidas') setLectura('todas');
  };
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
  // Un solo conteo del servidor alimenta «N nuevas», la carpeta «No leídas» y
  // el contador de cada categoría (sumando su desglose por tipo).
  const { data: conteoGlobal } = useConteoNoLeidas();
  const nuevas = conteoGlobal?.total ?? 0;
  const porCategoria = useMemo(() => conteosPorCategoria(conteoGlobal?.porTipo), [conteoGlobal?.porTipo]);

  const { data: proyectos = [] } = useQuery({ queryKey: ['notificaciones', 'proyectos'], queryFn: getProyectosDeNotificaciones, staleTime: 60 * 1000 });

  // ── Selección y lectura ────────────────────────────────────────────────────
  // El aviso seleccionado se guarda entero: si el filtro «No leídas» lo saca de
  // la lista al leerlo, el visor lo conserva sin perder el contexto.
  const [seleccionada, setSeleccionada] = useState<Notificacion | null>(null);
  const [vistaMovil, setVistaMovil] = useState<'lista' | 'detalle'>('lista');

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
  }, [queryClient]);

  const marcarUna = useMutation({
    mutationFn: marcarLeida,
    onSuccess: (actualizada) => {
      setSeleccionada((actual) => (actual && actual.idNotificacion === actualizada.idNotificacion ? { ...actual, leidaEn: actualizada.leidaEn } : actual));
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
    [leerAlAbrir],
  );

  // La fila refrescada (p. ej. ya leída) manda sobre la copia guardada; si el
  // filtro la sacó de la lista, se muestra la copia.
  const indice = seleccionada ? notificaciones.findIndex((n) => n.idNotificacion === seleccionada.idNotificacion) : -1;
  const mostrada = indice >= 0 ? notificaciones[indice] : seleccionada;
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

  // ── Panel de la bandeja (contraer / restaurar / restablecer) ───────────────
  const panelLista = useRef<ImperativePanelHandle>(null);
  const [listaContraida, setListaContraida] = useState(false);
  const alternarLista = () => {
    const panel = panelLista.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  };
  const restablecerReparto = () => panelLista.current?.resize(LISTA_DEFAULT);

  // «Sin leer» del encabezado = lo que «marcar filtradas» tocaría: bajo la
  // pestaña Leídas no hay nada que marcar.
  const pendientesFiltro = lectura === 'leidas' ? 0 : (noLeidasFiltro.data ?? (lectura === 'no-leidas' ? totalFiltrado : 0));

  const cabeceraBandeja = (
    <div className="flex shrink-0 items-center gap-tight border-b border-outline-variant/60 px-inline py-tight">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-on-surface">Bandeja de entrada</h2>
        <p className="type-meta truncate text-[11px]" aria-live="polite">
          {lista.isPending ? 'Cargando…' : `${plural(totalFiltrado, 'aviso', 'avisos')} · ${pendientesFiltro} sin leer`}
        </p>
      </div>
      {!esMovil && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="size-8 rounded-md text-text-secondary hover:text-text-primary" aria-label="Contraer bandeja" onClick={alternarLista}>
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Contraer bandeja</TooltipContent>
        </Tooltip>
      )}
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
        listaContraida={listaContraida}
        onAlternarLista={esMovil ? undefined : alternarLista}
        onVolver={esMovil ? () => setVistaMovil('lista') : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mostrada ? <NotificationReaderContent key={mostrada.idNotificacion} notificacion={mostrada} /> : <NotificationReaderEmpty />}
      </div>
    </div>
  );

  return (
    <>
      <header className="flex shrink-0 flex-col gap-tight md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-stack">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-container/15 text-primary">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-tight">
              <h1 className="type-display">Notificaciones</h1>
              {nuevas > 0 && (
                <span className="pill pill-accent">
                  {nuevas} nueva{nuevas !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="type-meta mt-micro hidden md:block">Consulta los avisos de tus proyectos, reuniones y actividades académicas.</p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => marcarFiltradas.mutate()}
          disabled={marcarFiltradas.isPending || pendientesFiltro === 0}
          className="self-start rounded-md text-[13px] font-semibold md:self-center"
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {etiquetaMarcar(categoria, busqueda, proyecto, lectura)}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-outline-variant/45 bg-surface-container-lowest shadow-card">
        {!esMovil && (
          <InboxFoldersSidebar
            seleccion={seleccionCarpetas}
            onSeleccionar={elegirCarpeta}
            conteos={{ noLeidas: nuevas, porCategoria }}
            collapsed={carpetasContraidas}
            onToggleCollapsed={soloRail ? undefined : alternarCarpetas}
          />
        )}

        {esMovil ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          <ResizablePanelGroup direction="horizontal" autoSaveId={INBOX_PANELS_AUTOSAVE_ID} className="min-w-0 flex-1">
            <ResizablePanel
              ref={panelLista}
              role="region"
              aria-label="Bandeja de entrada"
              collapsible
              collapsedSize={0}
              defaultSize={LISTA_DEFAULT}
              minSize={LISTA_MIN}
              maxSize={LISTA_MAX}
              onCollapse={() => setListaContraida(true)}
              onExpand={() => setListaContraida(false)}
              className={cn('flex min-h-0 flex-col', listaContraida && 'hidden')}
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
              className={cn('w-1.5 bg-outline-variant/40 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 data-[resize-handle-active]:bg-primary/60 [&>div]:border-outline-variant [&>div]:bg-surface-container-lowest motion-reduce:transition-none', listaContraida && 'hidden')}
            />
            <ResizablePanel className="flex min-h-0 flex-col">{visor}</ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </>
  );
}
