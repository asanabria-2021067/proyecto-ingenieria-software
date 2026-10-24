'use client';

/* ===========================================================================
   Personas — tarjetas al estilo del mockup de Stitch "Comunidad UVG"
   ---------------------------------------------------------------------------
   1. "Misma carrera" y "Amigos de amigos" pasan de casillas a pestañas
      (motivos de recomendación excluyentes, no filtros acumulables).
   2. Habilidades e intereses salen de la vista principal y quedan detrás
      de un botón de filtros (Popover).
   3. La lista pasa a una rejilla densa; cada pestaña es una consulta
      paginada distinta al backend, no un filtro en el navegador.
   4. Semestre y habilidades usan la paleta de colores variados del mockup
      (lib/social/badge-colors.ts) en vez de los tokens neutros del sistema
      de diseño — pedido explícito: la variedad de color es parte del diseño.
      "Ver perfil" lleva a /dashboard/personas/[id], no a un panel lateral.
   =========================================================================== */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SkeletonList } from '@/components/ui/skeleton';
import {
  ArrowRight,
  LayoutGrid,
  List,
  MoreVertical,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BOTON_EN_REVISION, getIniciales } from '@/components/projects/available-project-card';
import { REQUEST_INBOX_BUTTON_GREEN } from '@/components/admin/request-inbox-details';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useAccionesAmistad,
  useAceptarSolicitudAmistad,
  useAmigos,
  useBuscarUsuarios,
  useCrearSolicitudAmistad,
  useRechazarSolicitudAmistad,
  useRecomendaciones,
  useSolicitudesAmistadPendientes,
} from '@/hooks/use-social';
import { getHabilidades, getIntereses } from '@/lib/services/catalogs';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';
import { formatMotivoRecomendacion } from '@/lib/social/recomendaciones';
import uvgSwal from '@/lib/swal';
import type { SemestreRango, SolicitudAmistadPendienteDto, UsuarioBusquedaDto } from '@/lib/types/social';
import { dashboardPage } from '@/components/layout/dashboard-page';

type PestanaId = 'todos' | 'amigos-de-amigos' | 'mi-carrera' | 'mis-amigos';
type VistaId = 'tarjetas' | 'lista';

const PESTANAS: { id: PestanaId; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'amigos-de-amigos', label: 'Amigos de amigos' },
  { id: 'mi-carrera', label: 'Mi carrera' },
  { id: 'mis-amigos', label: 'Mis amigos' },
];

/** T-195: rangos fijos, mutuamente excluyentes (no acumulables como
 * habilidades/intereses) — "Todos" es la ausencia de filtro. */
const SEMESTRE_OPCIONES: { id: SemestreRango | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: '1-4', label: '1°-4°' },
  { id: '5-7', label: '5°-7°' },
  { id: '8+', label: '8°+' },
];

/** El motivo se arma acá a partir de los datos estructurados del backend
 * (`amigosEnComun`, `mismaCarrera`); el backend nunca manda el texto armado. */
function textoMotivo(usuario: UsuarioBusquedaDto): string | null {
  if (usuario.amigosEnComun > 0) {
    return `${usuario.amigosEnComun} ${usuario.amigosEnComun === 1 ? 'amigo' : 'amigos'} en común`;
  }
  if (usuario.mismaCarrera) return 'De tu carrera';
  return null;
}

/** Tarjeta con avatar, nombre y carrera centrados; etiquetas agrupadas; y las
 * acciones ancladas abajo (`mt-auto`) para que todas midan lo mismo en la rejilla.
 * «Agregar como amigo» reutiliza el botón verde institucional de la bandeja de
 * solicitudes (mismo tono que «Ver proyecto» publicado en Mis Proyectos) y «Solicitud
 * enviada» el de «Ver mi solicitud» de Mis Proyectos; van en una fila con
 * «Ver perfil» a la izquierda. "Ver perfil" lleva a la página de detalle, no a
 * un panel lateral (ahí caben los amigos en común). */
function PersonaCard({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const { amistad, seguimiento, confirmarEliminarAmistad } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;
  const solicitudEnviada = usuario.solicitudPendiente?.direccion === 'enviada' && !usuario.esAmigo;
  const tonoAmistad =
    amistad.variant === 'default' ? REQUEST_INBOX_BUTTON_GREEN : solicitudEnviada ? BOTON_EN_REVISION : '';

  return (
    <article className="@container card-base interactive-lift group relative flex h-full min-w-0 flex-col gap-tight hover:border-outline-variant hover:shadow-raised">
      <ConfirmActionDialog {...confirmarEliminarAmistad} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Más acciones para ${nombreCompleto}`}
            className="absolute right-tight top-tight rounded-control p-tight text-text-secondary opacity-0 transition-[opacity,background-color,color,transform] duration-180 ease-out hover:scale-105 hover:bg-surface-container-high hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/30 group-hover:opacity-100 data-[state=open]:bg-surface-container-high data-[state=open]:text-text-primary data-[state=open]:opacity-100"
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={seguimiento.disabled} onSelect={seguimiento.onClick}>
            {seguimiento.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex flex-col items-center gap-micro px-gap text-center">
        <Avatar className="size-16">
          {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
          <AvatarFallback className="type-section font-medium text-text-secondary">
            {getIniciales(usuario.nombre, usuario.apellido)}
          </AvatarFallback>
        </Avatar>
        <p className="type-subtitle text-text-primary">{nombreCompleto}</p>
        {usuario.carrera && <p className="type-meta max-w-full truncate">{usuario.carrera}</p>}
      </div>

      {(usuario.semestre != null || motivo || usuario.habilidades.length > 0) && (
        <div className="flex flex-wrap justify-center gap-tight">
          {usuario.semestre != null && (
            <span className={`pill font-semibold ${getSemestreBadgeStyle(usuario.semestre)}`}>
              Semestre {usuario.semestre}
            </span>
          )}
          {motivo && <span className="pill pill-accent">{motivo}</span>}
          {usuario.habilidades.slice(0, 2).map((h) => (
            <span key={h} className={`pill font-semibold ${getHabilidadBadgeStyle(h)}`}>
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2.5 border-t border-outline-variant pt-tight">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 rounded-md px-2.5 text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Link href={`/dashboard/personas/${usuario.idUsuario}`}>Ver perfil</Link>
        </Button>
        <Button
          size="sm"
          variant={amistad.variant}
          disabled={amistad.disabled}
          onClick={amistad.onClick}
          className={`h-8 rounded-md px-3 text-xs font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-primary/30 ${tonoAmistad}`}
        >
          {amistad.label}
        </Button>
      </div>
    </article>
  );
}

/** Misma info que `PersonaCard`, en una fila horizontal para la vista de lista. */
function PersonaListRow({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const { amistad, seguimiento, confirmarEliminarAmistad } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;

  return (
    <article className="card-base flex items-center gap-tight py-tight transition-shadow hover:shadow-raised">
      <ConfirmActionDialog {...confirmarEliminarAmistad} />
      <Avatar className="size-11 shrink-0">
        {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
        <AvatarFallback className="type-body font-medium text-text-secondary">
          {getIniciales(usuario.nombre, usuario.apellido)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-tight">
          <p className="type-subtitle text-text-primary">{nombreCompleto}</p>
          {usuario.semestre != null && (
            <span className={`pill font-semibold ${getSemestreBadgeStyle(usuario.semestre)}`}>
              Semestre {usuario.semestre}
            </span>
          )}
        </div>
        <div className="mt-micro flex flex-wrap items-center gap-tight">
          {usuario.carrera && <span className="type-meta">{usuario.carrera}</span>}
          {motivo && <span className="pill pill-accent">{motivo}</span>}
          {usuario.habilidades.slice(0, 3).map((h) => (
            <span key={h} className={`pill font-semibold ${getHabilidadBadgeStyle(h)}`}>
              {h}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-tight">
        <Button
          size="sm"
          variant={amistad.variant}
          disabled={amistad.disabled}
          onClick={amistad.onClick}
          className="h-7 rounded-md px-2.5 text-[11px]"
        >
          {amistad.label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Más acciones para ${nombreCompleto}`}
              className="rounded-control p-tight text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={seguimiento.disabled} onSelect={seguimiento.onClick}>
              {seguimiento.label}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Link
          href={`/dashboard/personas/${usuario.idUsuario}`}
          className="type-meta flex items-center gap-micro font-semibold text-primary hover:underline"
        >
          Ver perfil
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function RecomendacionCard({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const crearSolicitud = useCrearSolicitudAmistad();
  const motivo = formatMotivoRecomendacion(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;

  return (
    <article className="card-base flex items-center gap-tight">
      <Avatar className="size-11 shrink-0">
        {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
        <AvatarFallback className="type-body font-medium text-text-secondary">
          {getIniciales(usuario.nombre, usuario.apellido)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="type-subtitle truncate text-text-primary">{nombreCompleto}</p>
        {motivo && <span className="pill pill-accent mt-micro">{motivo}</span>}
      </div>
      <Button
        size="sm"
        className="h-7 shrink-0 rounded-md px-2.5 text-[11px]"
        onClick={() => crearSolicitud.mutate(usuario.idUsuario)}
        disabled={crearSolicitud.isPending}
      >
        <UserPlus className="size-3.5" aria-hidden="true" /> Agregar
      </Button>
    </article>
  );
}

function ListaSkeleton() {
  return (
    <SkeletonList
      label="Cargando personas"
      count={9}
      lines={2}
      avatar="circle"
      className="grid gap-tight md:grid-cols-2 xl:grid-cols-3"
    />
  );
}

function mensajeVacio(pestana: PestanaId, tieneAmigos: boolean, hayFiltrosActivos: boolean) {
  if (pestana === 'amigos-de-amigos' && !tieneAmigos) {
    return {
      titulo: 'Agregá a tu primer amigo',
      descripcion: 'Cuando tengas amigos vas a empezar a ver también a los suyos acá.',
    };
  }
  if (pestana === 'mis-amigos' && !tieneAmigos) {
    return {
      titulo: 'Todavía no tenés amigos',
      descripcion: 'Buscá compañeros en la pestaña Todos y agregalos.',
    };
  }
  return {
    titulo: 'No encontramos a nadie',
    descripcion: hayFiltrosActivos
      ? 'Probá con otro nombre o quitá algún filtro.'
      : 'Probá con otro nombre.',
  };
}

export default function PersonasPage() {
  const [pestana, setPestana] = useState<PestanaId>('todos');
  const [vista, setVista] = useState<VistaId>('tarjetas');
  const [q, setQ] = useState('');
  const [habilidadesSel, setHabilidadesSel] = useState<number[]>([]);
  const [interesesSel, setInteresesSel] = useState<number[]>([]);
  const [semestreRango, setSemestreRango] = useState<SemestreRango | undefined>(undefined);

  const { data: habilidades = [] } = useQuery({ queryKey: ['catalogo-habilidades'], queryFn: getHabilidades });
  const { data: intereses = [] } = useQuery({ queryKey: ['catalogo-intereses'], queryFn: getIntereses });

  const { amigos } = useAmigos();
  const { resultados, hasMore, isLoading, cargarMas, cargandoMas } = useBuscarUsuarios({
    q,
    carrera: pestana === 'mi-carrera',
    amigosDeAmigos: pestana === 'amigos-de-amigos',
    soloAmigos: pestana === 'mis-amigos',
    habilidades: habilidadesSel,
    intereses: interesesSel,
    semestreRango,
  });

  const { solicitudes } = useSolicitudesAmistadPendientes();
  const { recomendaciones, isLoading: isLoadingRecomendaciones } = useRecomendaciones();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const rechazarSolicitud = useRechazarSolicitudAmistad();
  const [confirmSolicitud, setConfirmSolicitud] = useState<{
    solicitud: SolicitudAmistadPendienteDto;
    accion: 'aceptar' | 'rechazar';
  } | null>(null);

  const totalFiltros = habilidadesSel.length + interesesSel.length + (semestreRango ? 1 : 0);

  function pedirConfirmacionSolicitud(solicitud: SolicitudAmistadPendienteDto, accion: 'aceptar' | 'rechazar') {
    setConfirmSolicitud({ solicitud, accion });
  }

  function cancelarConfirmacionSolicitud() {
    if (aceptarSolicitud.isPending || rechazarSolicitud.isPending) return;
    setConfirmSolicitud(null);
  }

  function confirmarSolicitud() {
    if (!confirmSolicitud) return;
    const { solicitud, accion } = confirmSolicitud;
    const mutacion = accion === 'aceptar' ? aceptarSolicitud : rechazarSolicitud;
    mutacion.mutate(solicitud.idAmistad, {
      onSuccess: () => {
        setConfirmSolicitud(null);
        uvgSwal.fire({
          icon: 'success',
          title: accion === 'aceptar' ? 'Solicitud aceptada' : 'Solicitud rechazada',
          timer: 1800,
          showConfirmButton: false,
        });
      },
      onError: (error: Error) => {
        setConfirmSolicitud(null);
        uvgSwal.fire({ icon: 'error', title: 'No se pudo resolver la solicitud', text: error.message });
      },
    });
  }

  function toggleHabilidad(id: number) {
    setHabilidadesSel((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
  }

  function toggleInteres(id: number) {
    setInteresesSel((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  const vacio = mensajeVacio(pestana, amigos.length > 0, totalFiltros > 0);

  return (
    <div className={dashboardPage('py-page')}>
      <header className="mb-section">
        <h1 className="type-display text-text-primary">Personas</h1>
        <p className="type-body mt-tight text-text-secondary">
          Busca compañeros, sigue su actividad y hazte amigo.
        </p>
      </header>

      {solicitudes.length > 0 && (
        <section className="mb-section">
          <h2 className="type-section mb-card">Solicitudes pendientes</h2>
          <div className="flex flex-col gap-tight">
            {solicitudes.map((s) => (
              <div key={s.idAmistad} className="card-base flex flex-wrap items-center justify-between gap-tight py-tight">
                <div className="flex items-center gap-tight">
                  <Avatar>
                    {s.solicitante.fotoUrl && (
                      <AvatarImage src={s.solicitante.fotoUrl} alt={`${s.solicitante.nombre} ${s.solicitante.apellido}`} />
                    )}
                    <AvatarFallback className="type-meta font-medium text-text-secondary">
                      {getIniciales(s.solicitante.nombre, s.solicitante.apellido)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="type-subtitle text-text-primary">
                    {s.solicitante.nombre} {s.solicitante.apellido}
                  </p>
                </div>
                <div className="flex gap-tight">
                  <Button size="sm" onClick={() => pedirConfirmacionSolicitud(s, 'aceptar')}>
                    <UserCheck className="size-4" aria-hidden="true" /> Aceptar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => pedirConfirmacionSolicitud(s, 'rechazar')}>
                    <UserX className="size-4" aria-hidden="true" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isLoadingRecomendaciones && (
        <section className="mb-section">
          <h2 className="type-section mb-card">Personas que quizás conozcas</h2>
          {recomendaciones.length > 0 ? (
            <div className="grid gap-tight sm:grid-cols-2 xl:grid-cols-3">
              {recomendaciones.map((usuario) => (
                <RecomendacionCard key={usuario.idUsuario} usuario={usuario} />
              ))}
            </div>
          ) : (
            // Tarjeta blanca, igual que los vacíos de las pestañas y Chats archivados.
            <Empty className="surface-enter" aria-live="polite">
              <EmptyMedia
                variant="compact"
                className="size-10 rounded-control border-transparent text-text-secondary"
              >
                <Users aria-hidden="true" className="size-5" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle className="type-subtitle">Sin recomendaciones por ahora</EmptyTitle>
                <EmptyDescription>
                  Agrega amigos o completa tu perfil para que te sugiramos personas.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      )}

      <div>
        <main>
          <div className="flex flex-wrap items-center gap-inline">
            <DashboardSearchField
              containerClassName="flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o apellido"
              aria-label="Buscar personas"
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-tight">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Filtros
                  {totalFiltros > 0 && <span className="pill pill-accent">{totalFiltros}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <section className="mb-stack">
                  <h3 className="type-meta uppercase tracking-wide">Semestre</h3>
                  <div className="mt-tight flex flex-wrap gap-tight">
                    {SEMESTRE_OPCIONES.map((opcion) => {
                      const activo = opcion.id === 'todos' ? !semestreRango : semestreRango === opcion.id;
                      return (
                        <button
                          key={opcion.id}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => setSemestreRango(opcion.id === 'todos' ? undefined : opcion.id)}
                          className={`pill ${activo ? 'pill-accent' : 'pill-neutral'}`}
                        >
                          {opcion.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
                {[
                  { titulo: 'Habilidades', lista: habilidades.map((h) => ({ id: h.idHabilidad, nombre: h.nombreHabilidad })), sel: habilidadesSel, toggle: toggleHabilidad },
                  { titulo: 'Intereses', lista: intereses.map((i) => ({ id: i.idInteres, nombre: i.nombreInteres })), sel: interesesSel, toggle: toggleInteres },
                ].map(({ titulo, lista, sel, toggle }) =>
                  lista.length > 0 ? (
                    <section key={titulo} className="mb-stack last:mb-0">
                      <h3 className="type-meta uppercase tracking-wide">{titulo}</h3>
                      <div className="mt-tight flex flex-wrap gap-tight">
                        {lista.map((opcion) => (
                          <button
                            key={opcion.id}
                            type="button"
                            aria-pressed={sel.includes(opcion.id)}
                            onClick={() => toggle(opcion.id)}
                            className={`pill ${sel.includes(opcion.id) ? 'pill-accent' : 'pill-neutral'}`}
                          >
                            {opcion.nombre}
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null,
                )}
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-micro rounded-control border border-outline-variant p-micro">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ver como tarjetas"
                    aria-pressed={vista === 'tarjetas'}
                    onClick={() => setVista('tarjetas')}
                    className={`flex size-8 items-center justify-center rounded-control transition-colors ${
                      vista === 'tarjetas'
                        ? 'bg-action text-on-action'
                        : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                    }`}
                  >
                    <LayoutGrid className="size-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Ver como tarjetas</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ver como lista"
                    aria-pressed={vista === 'lista'}
                    onClick={() => setVista('lista')}
                    className={`flex size-8 items-center justify-center rounded-control transition-colors ${
                      vista === 'lista'
                        ? 'bg-action text-on-action'
                        : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                    }`}
                  >
                    <List className="size-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Ver como lista</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaId)} className="mt-card">
            <TabsList className="w-full justify-start gap-1 border-b border-outline-variant bg-transparent p-0 pb-tight">
              {PESTANAS.map((p) => (
                <TabsTrigger
                  key={p.id}
                  value={p.id}
                  className="rounded-md text-text-primary data-[state=active]:bg-primary data-[state=active]:text-on-primary data-[state=active]:shadow-none"
                >
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={pestana} className="mt-card">
              {isLoading ? (
                <ListaSkeleton />
              ) : resultados.length === 0 ? (
                // Mismo criterio que Chats archivados: tarjeta blanca (tono por
                // defecto de Empty) con el icono pequeño y neutro.
                <Empty className="surface-enter" aria-live="polite">
                  <EmptyMedia
                    variant="compact"
                    className="size-10 rounded-control border-transparent text-text-secondary"
                  >
                    <Users aria-hidden="true" className="size-5" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle className="type-subtitle">{vacio.titulo}</EmptyTitle>
                    <EmptyDescription>{vacio.descripcion}</EmptyDescription>
                  </EmptyHeader>
                  {totalFiltros > 0 && (
                    <EmptyContent>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setHabilidadesSel([]);
                          setInteresesSel([]);
                          setSemestreRango(undefined);
                        }}
                      >
                        Quitar filtros
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              ) : (
                <>
                  {vista === 'tarjetas' ? (
                    <ul className="grid gap-gap sm:grid-cols-2 xl:grid-cols-3">
                      {resultados.map((usuario) => (
                        <li key={usuario.idUsuario}>
                          <PersonaCard usuario={usuario} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="flex flex-col gap-tight">
                      {resultados.map((usuario) => (
                        <li key={usuario.idUsuario}>
                          <PersonaListRow usuario={usuario} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasMore && (
                    <div className="mt-card flex justify-center">
                      <Button variant="outline" onClick={cargarMas} disabled={cargandoMas}>
                        {cargandoMas ? 'Cargando…' : 'Cargar más'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <ConfirmActionDialog
        open={confirmSolicitud !== null}
        title={confirmSolicitud?.accion === 'aceptar' ? 'Aceptar solicitud' : 'Rechazar solicitud'}
        description={
          confirmSolicitud
            ? `¿Confirmas que deseas ${confirmSolicitud.accion === 'aceptar' ? 'aceptar' : 'rechazar'} la solicitud de ${confirmSolicitud.solicitud.solicitante.nombre} ${confirmSolicitud.solicitud.solicitante.apellido}?`
            : ''
        }
        actionLabel={confirmSolicitud?.accion === 'aceptar' ? 'Sí, aceptar solicitud' : 'Sí, rechazar solicitud'}
        variant={confirmSolicitud?.accion === 'rechazar' ? 'destructive' : 'default'}
        isPending={aceptarSolicitud.isPending || rechazarSolicitud.isPending}
        onConfirm={confirmarSolicitud}
        onCancel={cancelarConfirmacionSolicitud}
      />
    </div>
  );
}
