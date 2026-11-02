'use client';

import { PageTitle } from '@/components/ui/page-title';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  AvailableProjectCard,
  AvailableProjectCardSkeleton,
  PROJECT_CARD_GRID,
  type ProyectoDisponibleResumen,
} from '@/components/projects/available-project-card';
import { apiFetch } from '@/lib/api/client';
import { TIPO_LABEL } from '@/types';
import type { TipoProyecto } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Bookmark, FolderOpen, SearchX, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useProyectosParaTi } from '@/hooks/use-descubrimiento';
import { DUENIO_LABEL, type DuenioProyecto } from '@/lib/services/descubrimiento';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { DashboardSearchField, DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { SkeletonRegion } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const CHIP_BASE =
  'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold motion-select focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const chipClase = (activo: boolean) =>
  `${CHIP_BASE} ${activo ? 'bg-primary text-on-primary' : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'}`;

// useSearchParams exige Suspense en el prerender.
export default function ProyectosPage() {
  return (
    <Suspense fallback={null}>
      <ProyectosContenido />
    </Suspense>
  );
}

function ProyectosContenido() {
  const qParam = useSearchParams()?.get('q') ?? '';
  const [busqueda, setBusquedaLocal] = useState(qParam);
  // Cualquier cambio del texto quita `q` de la URL: el backend deja de filtrar por el texto viejo y repetir la búsqueda desde la barra se reaplica.
  const setBusqueda = (valor: string) => {
    setBusquedaLocal(valor);
    if (qParam && valor !== qParam) window.history.replaceState(null, '', window.location.pathname);
  };
  // El buscador de la barra superior puede llegar aquí con otro texto estando ya en Explorar.
  const [ultimoQ, setUltimoQ] = useState(qParam);
  if (ultimoQ !== qParam) {
    setUltimoQ(qParam);
    if (qParam) setBusquedaLocal(qParam);
  }
  const [soloVacantes, setSoloVacantes] = useState(false);
  const [soloMiCarrera, setSoloMiCarrera] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [duenioFiltro, setDuenioFiltro] = useState<DuenioProyecto | ''>('');
  const [soloParaTi, setSoloParaTi] = useState(false);
  const [soloGuardados, setSoloGuardados] = useState(false);

  const catalogo = useQuery<ProyectoDisponibleResumen[]>({
    queryKey: ['proyectos', duenioFiltro, qParam],
    queryFn: () => {
      // El backend devuelve solo 20 y filtra `q` por título: con `q` en la URL se lo pedimos a él.
      const params = new URLSearchParams();
      if (duenioFiltro) params.set('duenio', duenioFiltro);
      if (qParam) params.set('q', qParam);
      const qs = params.toString();
      return apiFetch(qs ? `/proyectos?${qs}` : '/proyectos');
    },
  });
  // MEJ-15: «Para ti» es otra consulta (ordenada por coincidencia), no un filtro del navegador.
  const paraTi = useProyectosParaTi(soloParaTi, duenioFiltro);
  const { data: proyectos = [], isLoading, isError, refetch } = soloParaTi ? paraTi : catalogo;

  const filtrados = proyectos
    .filter((p) => {
      const coincideBusqueda =
        !busqueda ||
        p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.descripcionProyecto ?? '').toLowerCase().includes(busqueda.toLowerCase());

      const coincideTipo = !tipoFiltro || p.tipoProyecto === tipoFiltro;
      const coincideGuardado = !soloGuardados || p.guardado;
      const coincideVacantes = !soloVacantes || (p.estadoProyecto !== 'CERRADO' && (p.roles ?? []).some((r) => (r.cuposDisponibles ?? r.cupos) > 0));
      const coincideCarrera = !soloMiCarrera || Boolean(p.mismaCarrera);

      return coincideBusqueda && coincideTipo && coincideGuardado && coincideVacantes && coincideCarrera;
    })
    // S7 (VIEW-09): los cerrados no aceptan postulaciones; van al final y solo se consultan.
    // «Para ti» conserva el orden por coincidencia del servidor (sort es estable).
    .sort((a, b) => Number(a.estadoProyecto === 'CERRADO') - Number(b.estadoProyecto === 'CERRADO'));
  const cerrados = filtrados.filter((p) => p.estadoProyecto === 'CERRADO').length;
  const hasActiveFilters = Boolean(busqueda || tipoFiltro || duenioFiltro || soloParaTi || soloGuardados || soloVacantes || soloMiCarrera);
  const activos = proyectos.filter((p) => p.estadoProyecto !== 'CERRADO').length;
  const hayMiCarrera = proyectos.some((p) => p.mismaCarrera);
  const totalGuardados = proyectos.filter((p) => p.guardado).length;
  const conteoPorTipo = proyectos.reduce<Partial<Record<TipoProyecto, number>>>((acc, p) => {
    const tipo = p.tipoProyecto as TipoProyecto;
    acc[tipo] = (acc[tipo] ?? 0) + 1;
    return acc;
  }, {});

  const limpiarFiltros = () => {
    setBusqueda('');
    setTipoFiltro('');
    setDuenioFiltro('');
    setSoloParaTi(false);
    setSoloGuardados(false);
    setSoloVacantes(false);
    setSoloMiCarrera(false);
  };

  return (
      <div className={dashboardPage('pt-7 pb-10')}>
        {/* Encabezado */}
        <div className="mb-section flex flex-col gap-stack lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-tight">
              <PageTitle className="type-display">Proyectos Disponibles</PageTitle>
              {!isLoading && !isError && (
                <span className="pill pill-accent inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {activos === 1 ? '1 proyecto activo' : `${activos} proyectos activos`}
                </span>
              )}
            </div>
            <p className="type-body mt-tight text-text-secondary">
              Explora las oportunidades publicadas y postúlate a los roles que más se ajusten a ti.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSoloGuardados((v) => !v)}
            aria-pressed={soloGuardados}
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors lg:self-center ${
              soloGuardados
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-outline-variant bg-card text-text-primary hover:bg-surface-container'
            }`}
          >
            <Bookmark className={`h-4 w-4 ${soloGuardados ? 'fill-current' : ''}`} aria-hidden="true" />
            Guardados
            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs text-text-secondary">
              {totalGuardados}
            </span>
          </button>
        </div>

        {/* Buscador y filtros */}
        <div className="mb-section space-y-stack">
          <div className="flex flex-col gap-stack sm:flex-row">
            <DashboardSearchField
              containerClassName="flex-1"
              aria-label="Buscar proyectos por título o descripción"
              placeholder="Buscar proyectos disponibles..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <Select value={duenioFiltro || '__ALL__'} onValueChange={(v) => setDuenioFiltro(v === '__ALL__' ? '' : (v as DuenioProyecto))}>
              <SelectTrigger aria-label="Filtrar proyectos por dueño" className={`w-full sm:w-60 ${DASHBOARD_FILTER_TRIGGER_CLASS}`}>
                <SelectValue placeholder="Todos los dueños" />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="__ALL__" className="focus:bg-primary focus:text-on-primary">
                  Todos los dueños
                </SelectItem>
                {(Object.entries(DUENIO_LABEL) as [DuenioProyecto, string][]).map(([valor, etiqueta]) => (
                  <SelectItem key={valor} value={valor} className="focus:bg-primary focus:text-on-primary">
                    {etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtros principales siempre visibles; los tipos son los del enum real (TIPO_LABEL). */}
          {(soloParaTi || (!isLoading && !isError && proyectos.length > 0)) && (
            <div
              role="group"
              aria-label="Filtros de proyectos"
              className="flex items-center gap-tight overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button type="button" onClick={() => setSoloParaTi((v) => !v)} aria-pressed={soloParaTi} className={`inline-flex items-center gap-1.5 ${chipClase(soloParaTi)}`}>
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                Para ti
              </button>
              <button type="button" onClick={() => setTipoFiltro('')} aria-pressed={tipoFiltro === ''} className={chipClase(tipoFiltro === '')}>
                Todos <span className="opacity-80">{proyectos.length}</span>
              </button>
              {(Object.entries(TIPO_LABEL) as [TipoProyecto, string][]).map(([tipo, label]) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoFiltro((actual) => (actual === tipo ? '' : tipo))}
                  aria-pressed={tipoFiltro === tipo}
                  className={chipClase(tipoFiltro === tipo)}
                >
                  {label} <span className="opacity-80">{conteoPorTipo[tipo] ?? 0}</span>
                </button>
              ))}
              <button type="button" onClick={() => setSoloVacantes((v) => !v)} aria-pressed={soloVacantes} className={chipClase(soloVacantes)}>
                Con vacantes
              </button>
              {(hayMiCarrera || soloMiCarrera) && (
                <button type="button" onClick={() => setSoloMiCarrera((v) => !v)} aria-pressed={soloMiCarrera} className={chipClase(soloMiCarrera)}>
                  De tu carrera
                </button>
              )}
            </div>
          )}
        </div>

        {isLoading && (
          <SkeletonRegion className={PROJECT_CARD_GRID} label="Cargando proyectos">
            {Array.from({ length: 6 }).map((_, i) => (
              <AvailableProjectCardSkeleton key={i} />
            ))}
          </SkeletonRegion>
        )}

        {!isLoading && isError && (
          <Empty tone="danger" className="surface-enter" role="alert">
            <EmptyMedia variant="icon">
              <AlertCircle aria-hidden="true" className="h-7 w-7" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No fue posible cargar los proyectos.</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary motion-action motion-glow-primary motion-focus hover:bg-primary/90"
              >
                Reintentar
              </button>
            </EmptyContent>
          </Empty>
        )}

        {!isLoading && !isError && filtrados.length === 0 && (
          <Empty tone="muted" className="surface-enter" aria-live="polite">
            <EmptyMedia variant="icon">
              {hasActiveFilters ? (
                <SearchX aria-hidden="true" className="h-7 w-7" />
              ) : (
                <FolderOpen aria-hidden="true" className="h-7 w-7" />
              )}
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {soloParaTi && !busqueda ? 'Aún no hay proyectos para ti' : hasActiveFilters ? 'Sin resultados' : 'Todavía no hay proyectos disponibles.'}
              </EmptyTitle>
              {soloParaTi && !busqueda && (
                <EmptyDescription>
                  Comparamos tus habilidades e intereses con los roles abiertos. Agrega más a tu perfil para ver coincidencias.
                </EmptyDescription>
              )}
              {hasActiveFilters && !(soloParaTi && !busqueda) && (
                <EmptyDescription>
                  No encontramos proyectos con {busqueda ? `«${busqueda}»` : 'esos filtros'}. Prueba una de estas opciones.
                </EmptyDescription>
              )}
            </EmptyHeader>
            {hasActiveFilters && (
              <EmptyContent className="flex-row flex-wrap justify-center">
                {soloParaTi && !busqueda && (
                  <Button asChild variant="outline" className="h-auto px-5 py-2.5 text-sm font-bold">
                    <Link href="/dashboard/perfil">Completar mi perfil</Link>
                  </Button>
                )}
                {busqueda && (
                  <Button type="button" variant="outline" onClick={() => setBusqueda('')} className="h-auto px-5 py-2.5 text-sm font-bold">
                    Quitar el texto
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={limpiarFiltros}
                  className="h-auto bg-primary px-5 py-2.5 text-sm font-bold text-on-primary hover:bg-primary/90 motion-glow-primary"
                >
                  Limpiar filtros y ver todos
                </Button>
              </EmptyContent>
            )}
          </Empty>
        )}

        {!isLoading && !isError && filtrados.length > 0 && cerrados > 0 && (
          <p className="type-meta mb-stack" role="note">
            {cerrados === 1 ? '1 proyecto cerrado' : `${cerrados} proyectos cerrados`}: ya no aceptan postulaciones y se muestran solo para consulta.
          </p>
        )}

        {!isLoading && !isError && filtrados.length > 0 && (
          <div className={PROJECT_CARD_GRID}>
            {filtrados.map((proyecto) => (
              <AvailableProjectCard key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </div>
        )}
      </div>
  );
}
