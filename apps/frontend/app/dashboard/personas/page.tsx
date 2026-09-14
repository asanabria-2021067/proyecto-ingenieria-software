'use client';

/* ===========================================================================
   Personas — rediseño sobre los tokens de HU-163 (apps/frontend/app/global.css)
   ---------------------------------------------------------------------------
   1. "Misma carrera" y "Amigos de amigos" pasan de casillas a pestañas
      (motivos de recomendación excluyentes, no filtros acumulables).
   2. Habilidades e intereses salen de la vista principal y quedan detrás
      de un botón de filtros (Popover).
   3. La lista pasa a una rejilla densa; cada pestaña es una consulta
      paginada distinta al backend, no un filtro en el navegador.
   4. Columna lateral con el detalle de la persona seleccionada, sobre la
      rejilla 8+4 (`layout-grid` / `layout-main` / `layout-aside`).
   =========================================================================== */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { MoreVertical, Search, SlidersHorizontal, UserCheck, UserX, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getIniciales } from '@/components/projects/available-project-card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  useAceptarSolicitudAmistad,
  useAmigos,
  useBuscarUsuarios,
  useCrearSolicitudAmistad,
  useDejarDeSeguir,
  useEliminarAmistad,
  useRechazarSolicitudAmistad,
  useSeguirUsuario,
  useSolicitudesAmistadPendientes,
} from '@/hooks/use-social';
import { getHabilidades, getIntereses } from '@/lib/services/catalogs';
import type { UsuarioBusquedaDto } from '@/lib/types/social';

type PestanaId = 'todos' | 'amigos-de-amigos' | 'mi-carrera' | 'mis-amigos';

const PESTANAS: { id: PestanaId; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'amigos-de-amigos', label: 'Amigos de amigos' },
  { id: 'mi-carrera', label: 'Mi carrera' },
  { id: 'mis-amigos', label: 'Mis amigos' },
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

function useAccionesAmistad(usuario: UsuarioBusquedaDto) {
  const crearSolicitud = useCrearSolicitudAmistad();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const eliminarAmistad = useEliminarAmistad();
  const seguir = useSeguirUsuario();
  const dejarDeSeguir = useDejarDeSeguir();

  const amistad = usuario.esAmigo
    ? { label: 'Amigos', variant: 'outline' as const, disabled: eliminarAmistad.isPending, onClick: () => eliminarAmistad.mutate(usuario.idUsuario) }
    : usuario.solicitudPendiente?.direccion === 'enviada'
      ? { label: 'Solicitud enviada', variant: 'outline' as const, disabled: true, onClick: () => {} }
      : usuario.solicitudPendiente?.direccion === 'recibida'
        ? { label: 'Aceptar solicitud', variant: 'default' as const, disabled: aceptarSolicitud.isPending, onClick: () => aceptarSolicitud.mutate(usuario.idUsuario) }
        : { label: 'Agregar como amigo', variant: 'default' as const, disabled: crearSolicitud.isPending, onClick: () => crearSolicitud.mutate(usuario.idUsuario) };

  const seguimiento = usuario.loSigo
    ? { label: 'Siguiendo', disabled: dejarDeSeguir.isPending, onClick: () => dejarDeSeguir.mutate(usuario.idUsuario) }
    : { label: 'Seguir', disabled: seguir.isPending, onClick: () => seguir.mutate(usuario.idUsuario) };

  return { amistad, seguimiento };
}

function FilaPersona({
  usuario,
  activa,
  onSeleccionar,
}: {
  usuario: UsuarioBusquedaDto;
  activa: boolean;
  onSeleccionar: (idUsuario: number) => void;
}) {
  const { amistad, seguimiento } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSeleccionar(usuario.idUsuario)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSeleccionar(usuario.idUsuario);
        }
      }}
      aria-label={`Ver detalle de ${nombreCompleto}`}
      className={`card-base group relative flex cursor-pointer flex-col items-center gap-tight py-section text-center transition-colors hover:bg-muted ${activa ? 'bg-muted' : ''}`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Más acciones para ${nombreCompleto}`}
            className="absolute right-tight top-tight rounded-control p-tight text-text-secondary opacity-0 transition-opacity hover:bg-surface-container-high hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={amistad.disabled} onSelect={amistad.onClick}>
            {amistad.label}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={seguimiento.disabled} onSelect={seguimiento.onClick}>
            {seguimiento.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* fila 1: imagen */}
      <Avatar className="size-20 shrink-0">
        {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
        <AvatarFallback className="type-section font-medium text-text-secondary">
          {getIniciales(usuario.nombre, usuario.apellido)}
        </AvatarFallback>
      </Avatar>

      {/* fila 2: nombre */}
      <p className="type-subtitle text-text-primary">{nombreCompleto}</p>

      {/* fila 3: badges (carrera, semestre, motivo) */}
      <div className="flex flex-wrap items-center justify-center gap-tight">
        {usuario.carrera && <span className="pill pill-neutral max-w-full truncate">{usuario.carrera}</span>}
        {usuario.semestre != null && <span className="pill pill-neutral">Semestre {usuario.semestre}</span>}
        {motivo && <span className="pill pill-accent">{motivo}</span>}
      </div>
    </div>
  );
}

function PanelDetalleVacio() {
  return (
    <aside className="layout-aside">
      <div className="card-base flex min-h-64 flex-col items-center justify-center text-center">
        <p className="type-subtitle text-text-primary">Seleccioná a alguien</p>
        <p className="type-meta mt-tight max-w-prose">
          Acá vas a ver su carrera, habilidades e intereses.
        </p>
      </div>
    </aside>
  );
}

function PanelDetalleConPersona({ usuario }: { usuario: UsuarioBusquedaDto }) {
  const { amistad, seguimiento } = useAccionesAmistad(usuario);
  const motivo = textoMotivo(usuario);

  return (
    <aside className="layout-aside">
      <div className="card-base">
        <div className="flex flex-col items-center text-center">
          <Avatar className="size-20">
            {usuario.fotoUrl && <AvatarImage src={usuario.fotoUrl} alt="" />}
            <AvatarFallback className="type-section text-text-secondary">
              {getIniciales(usuario.nombre, usuario.apellido)}
            </AvatarFallback>
          </Avatar>

          <p className="type-section font-headline mt-stack text-text-primary">
            {usuario.nombre} {usuario.apellido}
          </p>
          {usuario.carrera && <p className="type-meta mt-micro">{usuario.carrera}</p>}
          {motivo && <span className="pill pill-accent mt-inline">{motivo}</span>}

          <div className="mt-stack flex w-full flex-col gap-tight">
            <Button
              variant={amistad.variant}
              disabled={amistad.disabled}
              onClick={amistad.onClick}
              className="w-full"
            >
              {amistad.label}
            </Button>
            <Button
              variant="outline"
              disabled={seguimiento.disabled}
              onClick={seguimiento.onClick}
              className="w-full"
            >
              {seguimiento.label}
            </Button>
          </div>
        </div>

        {usuario.habilidades.length > 0 && (
          <section className="mt-section">
            <h3 className="type-meta uppercase tracking-wide">Habilidades</h3>
            <div className="mt-tight flex flex-wrap gap-tight">
              {usuario.habilidades.map((h) => (
                <span key={h} className="pill pill-neutral">
                  {h}
                </span>
              ))}
            </div>
          </section>
        )}

        {usuario.intereses.length > 0 && (
          <section className="mt-stack">
            <h3 className="type-meta uppercase tracking-wide">Intereses</h3>
            <div className="mt-tight flex flex-wrap gap-tight">
              {usuario.intereses.map((i) => (
                <span key={i} className="pill pill-neutral">
                  {i}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function ListaSkeleton() {
  return (
    <SkeletonTheme baseColor="var(--color-surface-container)" highlightColor="var(--color-surface-container-high)">
      <ul className="grid gap-tight md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <li key={i} className="p-tight">
            <Skeleton height={56} borderRadius="var(--radius-control)" />
          </li>
        ))}
      </ul>
    </SkeletonTheme>
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
  const [q, setQ] = useState('');
  const [habilidadesSel, setHabilidadesSel] = useState<number[]>([]);
  const [interesesSel, setInteresesSel] = useState<number[]>([]);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);

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
  });

  const { solicitudes } = useSolicitudesAmistadPendientes();
  const aceptarSolicitud = useAceptarSolicitudAmistad();
  const rechazarSolicitud = useRechazarSolicitudAmistad();

  const totalFiltros = habilidadesSel.length + interesesSel.length;

  function toggleHabilidad(id: number) {
    setHabilidadesSel((prev) => (prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]));
  }

  function toggleInteres(id: number) {
    setInteresesSel((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  const vacio = mensajeVacio(pestana, amigos.length > 0, totalFiltros > 0);

  // Derivado de `resultados`, no un snapshot propio: así el panel y el
  // estado "activa" de la fila siguen la data fresca después de una
  // mutación (agregar amigo, seguir, ...) en vez de quedarse con el
  // usuario tal como estaba al momento de seleccionarlo.
  const seleccionado = resultados.find((u) => u.idUsuario === seleccionadoId) ?? null;

  return (
    <div className="px-section py-page">
      <header className="mx-auto mb-section max-w-content">
        <h1 className="type-display text-text-primary">Personas</h1>
        <p className="type-body mt-tight text-text-secondary">
          Busca compañeros, sigue su actividad y hazte amigo.
        </p>
      </header>

      {solicitudes.length > 0 && (
        <section className="mx-auto mb-section max-w-content">
          <h2 className="type-section mb-card">Solicitudes pendientes</h2>
          <div className="flex flex-col gap-tight">
            {solicitudes.map((s) => (
              <div key={s.idAmistad} className="card-base flex items-center justify-between gap-tight py-tight">
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
                  <Button size="sm" onClick={() => aceptarSolicitud.mutate(s.idAmistad)}>
                    <UserCheck className="size-4" aria-hidden="true" /> Aceptar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => rechazarSolicitud.mutate(s.idAmistad)}>
                    <UserX className="size-4" aria-hidden="true" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="layout-grid">
        <main className="layout-main">
          <div className="flex items-center gap-inline">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o apellido"
                className="pl-9"
                aria-label="Buscar personas"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-tight">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Filtros
                  {totalFiltros > 0 && <span className="pill pill-accent">{totalFiltros}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
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
          </div>

          <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaId)} className="mt-card">
            <TabsList className="w-full justify-start gap-1 border-b border-outline-variant bg-transparent p-0 pb-tight">
              {PESTANAS.map((p) => (
                <TabsTrigger
                  key={p.id}
                  value={p.id}
                  className="rounded-pill data-[state=active]:bg-action data-[state=active]:text-on-action data-[state=active]:shadow-none"
                >
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={pestana} className="mt-card">
              {isLoading ? (
                <ListaSkeleton />
              ) : resultados.length === 0 ? (
                <Empty tone="muted" aria-live="polite">
                  <EmptyMedia variant="compact">
                    <Users aria-hidden="true" className="size-6" />
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
                        }}
                      >
                        Quitar filtros
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              ) : (
                <>
                  <ul className="grid gap-gap md:grid-cols-2 xl:grid-cols-3">
                    {resultados.map((usuario) => (
                      <li key={usuario.idUsuario}>
                        <FilaPersona
                          usuario={usuario}
                          activa={seleccionadoId === usuario.idUsuario}
                          onSeleccionar={setSeleccionadoId}
                        />
                      </li>
                    ))}
                  </ul>
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

        {seleccionado ? <PanelDetalleConPersona usuario={seleccionado} /> : <PanelDetalleVacio />}
      </div>
    </div>
  );
}
