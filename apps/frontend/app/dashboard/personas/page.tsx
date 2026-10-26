'use client';

/* ===========================================================================
   Personas — tarjetas al estilo del mockup de Stitch "Comunidad UVG"
   ---------------------------------------------------------------------------
   1. Sprint 10: módulo social con tres secciones (Descubrir, Mis amigos,
      Amigos de amigos) en `?seccion=`, que se eligen desde el grupo
      «Personas» de la sidebar global. Cada sección es una consulta paginada
      distinta al backend, no un filtro en el navegador.
   2. Filtros en línea con la UI de Mis Proyectos: semestre (selección
      única), habilidades e intereses (selección múltiple) y «Solo personas
      de mi carrera». Todo se resuelve en el backend (`/social/usuarios/
      buscar`): familias distintas con AND, varios valores de una misma
      familia con OR, sobre el directorio paginado completo.
   3. La lista pasa a una rejilla densa.
   4. Semestre y habilidades usan la paleta de colores variados del mockup
      (lib/social/badge-colors.ts) en vez de los tokens neutros del sistema
      de diseño — pedido explícito: la variedad de color es parte del diseño.
      "Ver perfil" lleva a /dashboard/personas/[id], no a un panel lateral.
   =========================================================================== */

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SkeletonList } from '@/components/ui/skeleton';
import {
  AlertCircle,
  ArrowRight,
  LayoutGrid,
  List,
  MoreVertical,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { DashboardFilterMultiSelect } from '@/components/dashboard/dashboard-filter-multi-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';
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
import { useCurrentUser } from '@/hooks/use-current-user';
import { getHabilidades, getIntereses } from '@/lib/services/catalogs';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';
import { formatMotivoRecomendacion } from '@/lib/social/recomendaciones';
import uvgSwal from '@/lib/swal';
import type { SemestreRango, SolicitudAmistadPendienteDto, UsuarioBusquedaDto } from '@/lib/types/social';
import { dashboardPage } from '@/components/layout/dashboard-page';
import {
  PersonasMobileNav,
  SECCIONES_PERSONAS,
  parseSeccionPersonas,
  type SeccionPersonas,
} from '@/components/social/personas-nav';

type VistaId = 'tarjetas' | 'lista';

/**
 * Columnas por el ancho del CONTENIDO (`@container/personas`, lo que queda
 * tras las dos sidebars), no de la ventana: dos desde 36rem y tres solo desde
 * 64rem, donde cada tarjeta conserva sus dos botones en una línea.
 */
const COLUMNAS_PERSONAS = '@xl/personas:grid-cols-2 @5xl/personas:grid-cols-3';

/** T-195: rangos fijos, mutuamente excluyentes (no acumulables como
 * habilidades/intereses) — "Todos" es la ausencia de filtro. */
const SEMESTRE_TODOS = 'todos';
const SEMESTRE_OPCIONES: { id: SemestreRango | typeof SEMESTRE_TODOS; label: string }[] = [
  { id: SEMESTRE_TODOS, label: 'Todos los semestres' },
  { id: '1-4', label: '1.º–4.º' },
  { id: '5-7', label: '5.º–7.º' },
  { id: '8+', label: '8.º en adelante' },
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

/** Medidas compactas comunes a los dos botones de Personas; `cn` (tailwind-merge)
 * las impone sobre las del botón de «Ver proyecto» sin tocar su apariencia. */
const ACCION_PERSONA = 'h-8 rounded-md px-3 text-xs font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-primary/30';

/** «Ver perfil» (UI negra de «Ver proyecto») y el botón de amistad (verde
 * institucional, o «Ver mi solicitud» si ya se envió). Lo comparten la tarjeta
 * y la fila de lista; quien lo usa decide cómo centrar o agrupar. */
function BotonesPersona({
  usuario,
  amistad,
}: {
  usuario: UsuarioBusquedaDto;
  amistad: ReturnType<typeof useAccionesAmistad>['amistad'];
}) {
  const solicitudEnviada = usuario.solicitudPendiente?.direccion === 'enviada' && !usuario.esAmigo;
  const tono = amistad.variant === 'default' ? REQUEST_INBOX_BUTTON_GREEN : solicitudEnviada ? BOTON_EN_REVISION : '';
  return (
    <>
      <Button asChild className={`${PROJECT_ACTION_BUTTON_CLASS} ${ACCION_PERSONA}`}>
        <Link href={`/dashboard/personas/${usuario.idUsuario}`}>Ver perfil</Link>
      </Button>
      <Button
        variant={amistad.variant}
        disabled={amistad.disabled}
        onClick={amistad.onClick}
        className={`${ACCION_PERSONA} ${tono}`}
      >
        {amistad.label}
      </Button>
    </>
  );
}

/** Tarjeta con avatar, nombre y carrera centrados; etiquetas agrupadas; y las
 * acciones ancladas abajo (`mt-auto`) para que todas midan lo mismo en la rejilla.
 * «Agregar como amigo» reutiliza el botón verde institucional de la bandeja de
 * solicitudes (mismo tono que «Ver proyecto» publicado en Mis Proyectos) y «Solicitud
 * enviada» el de «Ver mi solicitud» de Mis Proyectos; van centrados junto a
 * «Ver perfil», el botón negro de «Ver proyecto». "Ver perfil" lleva a la página de detalle, no a
 * un panel lateral (ahí caben los amigos en común). */
function PersonaCard({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const { amistad, seguimiento, confirmarEliminarAmistad } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;

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

      <div className="mt-auto flex flex-wrap items-center justify-center gap-2 border-t border-outline-variant pt-tight">
        <BotonesPersona usuario={usuario} amistad={amistad} />
      </div>
    </article>
  );
}

/** Misma info que `PersonaCard`, en una fila horizontal para la vista de lista:
 * botón de amistad negro de «Ver proyecto» arriba a la derecha y, debajo,
 * «Ver perfil →» con el menú de tres puntos. */
function PersonaListRow({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const { amistad, seguimiento, confirmarEliminarAmistad } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;
  const solicitudEnviada = usuario.solicitudPendiente?.direccion === 'enviada' && !usuario.esAmigo;

  return (
    <article className="card-base flex flex-wrap items-center gap-gap transition-[border-color,background-color,box-shadow] duration-180 ease-out hover:border-primary/40 hover:bg-primary/5 hover:shadow-raised">
      <ConfirmActionDialog {...confirmarEliminarAmistad} />
      <Avatar className="size-14 shrink-0 self-start">
        {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
        <AvatarFallback className="type-section font-medium text-text-secondary">
          {getIniciales(usuario.nombre, usuario.apellido)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 grow basis-44 flex-col gap-micro">
        <div className="flex flex-wrap items-center gap-tight">
          <p className="type-subtitle text-text-primary">{nombreCompleto}</p>
          {usuario.semestre != null && (
            <span className={`pill font-semibold ${getSemestreBadgeStyle(usuario.semestre)}`}>
              Semestre {usuario.semestre}
            </span>
          )}
        </div>
        {usuario.carrera && <p className="type-meta">{usuario.carrera}</p>}
        {(motivo || usuario.habilidades.length > 0) && (
          <div className="mt-micro flex flex-wrap items-center gap-tight">
            {motivo && <span className="pill pill-accent">{motivo}</span>}
            {usuario.habilidades.slice(0, 3).map((h) => (
              <span key={h} className={`pill font-semibold ${getHabilidadBadgeStyle(h)}`}>
                {h}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 flex-col items-end gap-tight">
        <Button
          variant={amistad.variant}
          disabled={amistad.disabled}
          onClick={amistad.onClick}
          className={
            amistad.variant === 'default'
              ? PROJECT_ACTION_BUTTON_CLASS
              : solicitudEnviada
                ? `${PROJECT_ACTION_BUTTON_CLASS} ${BOTON_EN_REVISION}`
                : 'h-9.5 rounded-md px-4.5 text-[13px] font-semibold'
          }
        >
          {amistad.label}
        </Button>
        <div className="flex items-center gap-micro">
          <Link
            href={`/dashboard/personas/${usuario.idUsuario}`}
            className="group/perfil type-meta inline-flex items-center gap-micro rounded-control px-tight py-micro font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Ver perfil
            <ArrowRight
              className="size-3.5 transition-transform duration-180 ease-out group-hover/perfil:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </Link>
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
        </div>
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
      className={`grid gap-tight ${COLUMNAS_PERSONAS}`}
    />
  );
}

function mensajeVacio(seccion: SeccionPersonas, tieneAmigos: boolean, hayCriterios: boolean) {
  if (seccion === 'amigos-de-amigos' && !tieneAmigos) {
    return {
      titulo: 'Agrega a tu primer amigo',
      descripcion: 'Cuando tengas amigos, aquí verás a las personas conectadas con ellos.',
    };
  }
  if (seccion === 'amigos' && !tieneAmigos) {
    return {
      titulo: 'Aún no tienes amigos',
      descripcion: 'Busca compañeros en Descubrir personas y agrégalos.',
    };
  }
  if (seccion === 'amigos-de-amigos' && !hayCriterios) {
    return {
      titulo: 'Aún no hay conexiones en común',
      descripcion: 'Cuando tus amigos agreguen a otras personas, aparecerán aquí.',
    };
  }
  return {
    titulo: 'No encontramos a nadie',
    descripcion: hayCriterios ? 'Prueba con otro nombre o quita algún filtro.' : 'Prueba con otro nombre.',
  };
}

/** `useSearchParams` exige un límite de Suspense en una página cliente. */
export default function PersonasPage() {
  return (
    <Suspense fallback={null}>
      <PersonasView />
    </Suspense>
  );
}

function PersonasView() {
  const seccion = parseSeccionPersonas(useSearchParams().get('seccion'));
  const [vista, setVista] = useState<VistaId>('tarjetas');
  const [q, setQ] = useState('');
  const [habilidadesSel, setHabilidadesSel] = useState<number[]>([]);
  const [interesesSel, setInteresesSel] = useState<number[]>([]);
  const [semestreRango, setSemestreRango] = useState<SemestreRango | undefined>(undefined);
  const [soloMiCarreraElegido, setSoloMiCarrera] = useState(false);

  // «Mi carrera» filtra por la carrera real del perfil; sin ese dato no hay filtro que aplicar.
  const { data: usuarioActual, isPending: cargandoUsuario } = useCurrentUser();
  const miCarrera = usuarioActual?.perfil?.carrera?.nombreCarrera ?? null;
  const soloMiCarrera = soloMiCarreraElegido && miCarrera !== null;

  const { data: habilidades = [] } = useQuery({ queryKey: ['catalogo-habilidades'], queryFn: getHabilidades });
  const { data: intereses = [] } = useQuery({ queryKey: ['catalogo-intereses'], queryFn: getIntereses });
  const opcionesHabilidades = habilidades.map((h) => ({ id: h.idHabilidad, nombre: h.nombreHabilidad }));
  const opcionesIntereses = intereses.map((i) => ({ id: i.idInteres, nombre: i.nombreInteres }));

  const { amigos } = useAmigos();
  const { resultados, hasMore, isLoading, isError, reintentar, cargarMas, cargandoMas } = useBuscarUsuarios({
    q,
    carrera: soloMiCarrera,
    amigosDeAmigos: seccion === 'amigos-de-amigos',
    soloAmigos: seccion === 'amigos',
    habilidades: habilidadesSel,
    intereses: interesesSel,
    semestreRango,
  });

  const { solicitudes } = useSolicitudesAmistadPendientes();
  const {
    recomendaciones,
    isLoading: isLoadingRecomendaciones,
    isError: errorRecomendaciones,
  } = useRecomendaciones();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const rechazarSolicitud = useRechazarSolicitudAmistad();
  const [confirmSolicitud, setConfirmSolicitud] = useState<{
    solicitud: SolicitudAmistadPendienteDto;
    accion: 'aceptar' | 'rechazar';
  } | null>(null);

  const totalFiltros = habilidadesSel.length + interesesSel.length + (semestreRango ? 1 : 0) + (soloMiCarrera ? 1 : 0);

  function limpiarFiltros() {
    setHabilidadesSel([]);
    setInteresesSel([]);
    setSemestreRango(undefined);
    setSoloMiCarrera(false);
  }

  // Etiquetas de los criterios activos, cada una con su forma de quitarse.
  const chipsActivos = [
    ...(semestreRango
      ? [{ key: 'semestre', label: `Semestre ${SEMESTRE_OPCIONES.find((o) => o.id === semestreRango)?.label}`, quitar: () => setSemestreRango(undefined) }]
      : []),
    ...habilidadesSel.map((id) => ({
      key: `h-${id}`,
      label: opcionesHabilidades.find((o) => o.id === id)?.nombre ?? 'Habilidad',
      quitar: () => setHabilidadesSel((prev) => prev.filter((h) => h !== id)),
    })),
    ...interesesSel.map((id) => ({
      key: `i-${id}`,
      label: opcionesIntereses.find((o) => o.id === id)?.nombre ?? 'Interés',
      quitar: () => setInteresesSel((prev) => prev.filter((i) => i !== id)),
    })),
    ...(soloMiCarrera ? [{ key: 'carrera', label: `Mi carrera: ${miCarrera}`, quitar: () => setSoloMiCarrera(false) }] : []),
  ];

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

  const vacio = mensajeVacio(seccion, amigos.length > 0, totalFiltros > 0 || q.trim().length >= 2);
  const encabezado = SECCIONES_PERSONAS[seccion];

  return (
    // Las secciones viven en el grupo «Personas» de la sidebar global; el contenido usa el
    // contenedor de Mis Proyectos. `@container/personas` mide su ancho para la rejilla.
    <>
      <PersonasMobileNav seccion={seccion} />
      <div className={dashboardPage('@container/personas pt-7 pb-10')}>
        {/* Jerarquía de encabezado de Mis Proyectos. */}
        <header className="mb-section">
          <h1 className="type-display">{encabezado.titulo}</h1>
          <p className="mt-1 text-[14px] font-normal text-tertiary">{encabezado.descripcion}</p>
        </header>

        {seccion !== 'amigos-de-amigos' && solicitudes.length > 0 && (
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

        {seccion === 'descubrir' && !isLoadingRecomendaciones && (
          <section className="mb-section">
            <h2 className="type-section mb-card">Personas que quizás conozcas</h2>
            {errorRecomendaciones ? (
              // Un fallo no se presenta como «sin recomendaciones».
              <p className="type-meta" role="status">
                No se pudieron cargar las recomendaciones en este momento.
              </p>
            ) : recomendaciones.length > 0 ? (
              <div className={`grid gap-tight ${COLUMNAS_PERSONAS}`}>
                {recomendaciones.map((usuario) => (
                  <RecomendacionCard key={usuario.idUsuario} usuario={usuario} />
                ))}
              </div>
            ) : (
              // Tarjeta blanca de los demás vacíos, en banda horizontal: aquí no hace falta un bloque alto.
              <Empty size="compact" className="surface-enter" aria-live="polite">
                <EmptyMedia
                  variant="compact"
                  className="size-10 rounded-control border-transparent text-text-secondary"
                >
                  <Users aria-hidden="true" className="size-5" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle className="type-subtitle">Aún no hay recomendaciones</EmptyTitle>
                  <EmptyDescription>Completa tu perfil para descubrir personas con intereses similares.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/dashboard/perfil/editar">Completar perfil</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </section>
        )}

        <div>
          <section aria-label="Directorio de personas">
            <div className="flex flex-wrap items-center gap-inline">
              <DashboardSearchField
                containerClassName="min-w-full flex-1 sm:min-w-48"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o apellido"
                aria-label="Buscar personas"
              />

              <Select
                value={semestreRango ?? SEMESTRE_TODOS}
                onValueChange={(v) => setSemestreRango(v === SEMESTRE_TODOS ? undefined : (v as SemestreRango))}
              >
                <SelectTrigger aria-label="Filtrar por semestre" className={`w-full sm:w-48 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50">
                  {SEMESTRE_OPCIONES.map((opcion) => (
                    <SelectItem key={opcion.id} value={opcion.id} className="focus:bg-primary focus:text-on-primary">
                      {opcion.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DashboardFilterMultiSelect
                label="Habilidades"
                ariaLabel="Filtrar por habilidades"
                options={opcionesHabilidades}
                value={habilidadesSel}
                onChange={setHabilidadesSel}
                className="w-full sm:w-40"
              />
              <DashboardFilterMultiSelect
                label="Intereses"
                ariaLabel="Filtrar por intereses"
                options={opcionesIntereses}
                value={interesesSel}
                onChange={setInteresesSel}
                className="w-full sm:w-40"
              />

              <div className="flex items-center gap-micro rounded-control border border-outline-variant p-micro">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ver como tarjetas"
                      aria-pressed={vista === 'tarjetas'}
                      onClick={() => setVista('tarjetas')}
                      className={`flex size-8 items-center justify-center rounded-control motion-select ${
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
                      className={`flex size-8 items-center justify-center rounded-control motion-select ${
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

            <div className="mt-tight flex flex-wrap items-center gap-x-inline gap-y-tight">
              <label className="type-body inline-flex min-h-8 cursor-pointer items-center gap-tight text-text-primary has-disabled:cursor-not-allowed has-disabled:text-text-secondary">
                <Checkbox
                  checked={soloMiCarrera}
                  onCheckedChange={(v) => setSoloMiCarrera(v === true)}
                  disabled={cargandoUsuario || miCarrera === null}
                  aria-describedby={!cargandoUsuario && miCarrera === null ? 'personas-sin-carrera' : undefined}
                />
                Solo personas de mi carrera
              </label>
              {!cargandoUsuario && miCarrera === null && (
                <span id="personas-sin-carrera" className="type-meta">
                  Agrega tu carrera en{' '}
                  <Link href="/dashboard/perfil/editar" className="font-semibold text-primary hover:underline">
                    tu perfil
                  </Link>{' '}
                  para usar este filtro.
                </span>
              )}
            </div>

            {chipsActivos.length > 0 && (
              <div className="mt-tight flex flex-wrap items-center gap-tight" role="group" aria-label="Filtros aplicados">
                {chipsActivos.map((chip) => (
                  <span key={chip.key} className="pill pill-accent inline-flex items-center gap-1 pr-1">
                    {chip.label}
                    <button
                      type="button"
                      aria-label={`Quitar filtro ${chip.label}`}
                      onClick={chip.quitar}
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </span>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={limpiarFiltros} className="font-medium text-primary">
                  Limpiar todo
                </Button>
              </div>
            )}

            <div className="mt-card">
                {isLoading ? (
                  <ListaSkeleton />
                ) : isError ? (
                  <Empty tone="danger" className="surface-enter" role="alert">
                    <EmptyMedia variant="icon">
                      <AlertCircle aria-hidden="true" className="size-7" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No se pudo cargar el directorio de personas</EmptyTitle>
                      <EmptyDescription>Verifica que tu sesión siga activa o vuelve a intentarlo.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button variant="outline" onClick={() => void reintentar()}>
                        Reintentar
                      </Button>
                    </EmptyContent>
                  </Empty>
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
                        <Button variant="outline" onClick={limpiarFiltros}>
                          Quitar filtros
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                ) : (
                  <>
                    {vista === 'tarjetas' ? (
                      <ul className={`grid gap-gap ${COLUMNAS_PERSONAS}`}>
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
            </div>
          </section>
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
    </>
  );
}
