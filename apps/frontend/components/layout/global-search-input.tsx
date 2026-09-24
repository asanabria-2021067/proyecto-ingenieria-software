'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, ListChecks, Loader2, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalSearch } from '@/hooks/use-global-search';
import type {
  GlobalSearchResponseDTO,
  ProyectoResultadoBusquedaDTO,
  PersonaResultadoBusquedaDTO,
  TareaResultadoBusquedaDTO,
} from '@/lib/dto/global-search.dto';

type Tipo = 'proyecto' | 'persona' | 'tarea';
type Pestana = 'todo' | Tipo;

type ResultadoAplanado =
  | { tipo: 'proyecto'; id: string; href: string; data: ProyectoResultadoBusquedaDTO }
  | { tipo: 'persona'; id: string; href: string; data: PersonaResultadoBusquedaDTO }
  | { tipo: 'tarea'; id: string; href: string; data: TareaResultadoBusquedaDTO };

const TITULOS: Record<Tipo, string> = {
  proyecto: 'Proyectos',
  persona: 'Personas',
  tarea: 'Tareas',
};

function aplanar(resultado: GlobalSearchResponseDTO | undefined): ResultadoAplanado[] {
  if (!resultado) return [];
  return [
    ...resultado.proyectos.items.map((p): ResultadoAplanado => ({
      tipo: 'proyecto',
      id: `proyecto-${p.idProyecto}`,
      href: `/dashboard/proyectos/${p.idProyecto}`,
      data: p,
    })),
    ...resultado.personas.items.map((p): ResultadoAplanado => ({
      tipo: 'persona',
      id: `persona-${p.idUsuario}`,
      href: `/dashboard/personas/${p.idUsuario}`,
      data: p,
    })),
    ...resultado.tareas.items.map((t): ResultadoAplanado => ({
      tipo: 'tarea',
      id: `tarea-${t.idTarea}`,
      href: `/dashboard/projects/${t.idProyecto}/kanban/tasks/${t.idTarea}`,
      data: t,
    })),
  ];
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function humanizar(valor: string): string {
  const limpio = valor.replace(/_/g, ' ').toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Resalta las coincidencias ignorando acentos y mayúsculas, como hace el backend. */
function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  const q = normalizar(consulta.trim());
  if (!q) return <>{texto}</>;

  let normalizado = '';
  const origen: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    for (const c of normalizar(texto[i])) {
      normalizado += c;
      origen.push(i);
    }
  }

  const partes: React.ReactNode[] = [];
  let cursor = 0;
  let desde = 0;
  while (desde <= normalizado.length - q.length) {
    const pos = normalizado.indexOf(q, desde);
    if (pos === -1) break;
    const ini = origen[pos];
    const fin = origen[pos + q.length - 1] + 1;
    if (ini > cursor) partes.push(texto.slice(cursor, ini));
    partes.push(
      <mark key={ini} className="rounded-sm bg-secondary-container text-on-secondary-container">
        {texto.slice(ini, fin)}
      </mark>,
    );
    cursor = fin;
    desde = pos + q.length;
  }
  if (partes.length === 0) return <>{texto}</>;
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return <>{partes}</>;
}

function Mosaico({ resultado }: { resultado: ResultadoAplanado }) {
  const base = 'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-muted text-text-secondary';
  if (resultado.tipo === 'proyecto') {
    return (
      <span className={base} aria-hidden="true">
        <FolderKanban className="size-5" />
      </span>
    );
  }
  if (resultado.tipo === 'tarea') {
    return (
      <span className={base} aria-hidden="true">
        <ListChecks className="size-5" />
      </span>
    );
  }
  const { nombre, apellido, fotoUrl } = resultado.data;
  return (
    <span className={`${base} text-sm font-semibold`} aria-hidden="true">
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotoUrl} alt="" className="size-full object-cover" />
      ) : (
        `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
      )}
    </span>
  );
}

function Contenido({ resultado, consulta }: { resultado: ResultadoAplanado; consulta: string }) {
  let titulo: string;
  let detalle: string;
  if (resultado.tipo === 'proyecto') {
    titulo = resultado.data.tituloProyecto;
    detalle = `${humanizar(resultado.data.tipoProyecto)} · ${humanizar(resultado.data.modalidadProyecto)}`;
  } else if (resultado.tipo === 'persona') {
    titulo = `${resultado.data.nombre} ${resultado.data.apellido}`;
    detalle = resultado.data.carrera ?? 'Persona';
  } else {
    titulo = resultado.data.tituloTarea;
    detalle = `en ${resultado.data.tituloProyecto} · ${humanizar(resultado.data.estadoTarea)}`;
  }
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-text-primary">
        <Resaltado texto={titulo} consulta={consulta} />
      </span>
      <span className="block truncate text-xs text-text-secondary">{detalle}</span>
    </span>
  );
}

export function GlobalSearchInput({
  autoFocus = false,
  onNavigate,
  className = '',
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const listboxId = `global-search-results-${uid}`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pestana, setPestana] = useState<Pestana>('todo');
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, isDebouncing } = useGlobalSearch(query);
  const todos = useMemo(() => aplanar(data), [data]);
  const flat = useMemo(
    () => (pestana === 'todo' ? todos : todos.filter((r) => r.tipo === pestana)),
    [todos, pestana],
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [data, pestana]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function irA(resultado: ResultadoAplanado) {
    setQuery('');
    setOpen(false);
    router.push(resultado.href);
    onNavigate?.();
  }

  function limpiar() {
    setQuery('');
    setPestana('todo');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || flat.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      irA(flat[activeIndex]);
    }
  }

  const hayTexto = query.trim().length > 0;
  const showDropdown = open && hayTexto;
  const cargando = isFetching || isDebouncing;
  const sinResultadosTodavia = !cargando && flat.length === 0;

  const grupos: { tipo: Tipo; items: ResultadoAplanado[]; hasMore: boolean }[] = [
    { tipo: 'proyecto', items: flat.filter((r) => r.tipo === 'proyecto'), hasMore: data?.proyectos.hasMore ?? false },
    { tipo: 'persona', items: flat.filter((r) => r.tipo === 'persona'), hasMore: data?.personas.hasMore ?? false },
    { tipo: 'tarea', items: flat.filter((r) => r.tipo === 'tarea'), hasMore: data?.tareas.hasMore ?? false },
  ];

  const conteo = (tipo: Tipo): string => {
    if (!data) return '0';
    const grupo = tipo === 'proyecto' ? data.proyectos : tipo === 'persona' ? data.personas : data.tareas;
    return `${grupo.items.length}${grupo.hasMore ? '+' : ''}`;
  };
  const conteoTodo = (): string => {
    if (!data) return '0';
    const hayMas = data.proyectos.hasMore || data.personas.hasMore || data.tareas.hasMore;
    return `${todos.length}${hayMas ? '+' : ''}`;
  };

  const pestanas: { valor: Pestana; titulo: string; cuenta: string }[] = [
    { valor: 'todo', titulo: 'Todo', cuenta: conteoTodo() },
    { valor: 'proyecto', titulo: TITULOS.proyecto, cuenta: conteo('proyecto') },
    { valor: 'persona', titulo: TITULOS.persona, cuenta: conteo('persona') },
    { valor: 'tarea', titulo: TITULOS.tarea, cuenta: conteo('tarea') },
  ];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        {isFetching && hayTexto ? (
          <Loader2
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-secondary"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
        )}
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          aria-label="Buscar proyectos, personas y tareas"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${uid}-${flat[activeIndex].id}` : undefined}
          role="combobox"
          placeholder="Buscar…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => hayTexto && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-10 w-full rounded-control border border-outline-variant bg-page pl-10 pr-16 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {hayTexto && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-primary underline underline-offset-2 hover:text-text-secondary"
          >
            Limpiar
          </button>
        )}
        {isFetching && hayTexto && (
          <span role="status" aria-label="Buscando" className="sr-only">
            Buscando…
          </span>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-1/2 top-full z-50 mt-2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-card border border-outline-variant bg-card shadow-raised">
          <div
            role="tablist"
            aria-label="Filtrar resultados por tipo"
            className="flex items-center gap-inline overflow-x-auto border-b border-outline-variant px-card"
          >
            {pestanas.map((p) => {
              const activa = pestana === p.valor;
              return (
                <button
                  key={p.valor}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPestana(p.valor)}
                  className={`-mb-px flex shrink-0 items-center gap-tight border-b-2 px-tight py-inline text-sm font-medium transition-colors ${
                    activa
                      ? 'border-text-primary text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {p.titulo}
                  <span className="rounded-control bg-muted px-1.5 text-xs text-text-secondary">{p.cuenta}</span>
                </button>
              );
            })}
          </div>

          <div id={listboxId} role="listbox" aria-label="Resultados de busqueda" className="max-h-[26rem] overflow-y-auto">
            {sinResultadosTodavia && (
              <div className="px-card py-card text-center" role="status">
                <p className="text-sm font-semibold text-text-primary">Sin coincidencias</p>
                <p className="mt-1 text-xs text-text-secondary">Prueba con otro texto.</p>
              </div>
            )}
            {grupos.map((grupo) =>
              grupo.items.length === 0 ? null : (
                <div key={grupo.tipo} role="group" aria-label={TITULOS[grupo.tipo]}>
                  {pestana === 'todo' && (
                    <p className="px-card pt-inline pb-micro text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      {TITULOS[grupo.tipo]}
                    </p>
                  )}
                  <ul role="presentation" className="px-tight">
                    {grupo.items.map((r) => {
                      const globalIndex = flat.indexOf(r);
                      const activo = globalIndex === activeIndex;
                      return (
                        <li key={r.id} role="none" className="border-b border-outline-variant/60 last:border-b-0">
                          <button
                            type="button"
                            id={`${uid}-${r.id}`}
                            role="option"
                            aria-selected={activo}
                            onMouseEnter={() => setActiveIndex(globalIndex)}
                            onClick={() => irA(r)}
                            className={`flex w-full items-center gap-inline rounded-control px-tight py-inline text-left transition-colors ${
                              activo ? 'bg-surface-container-high' : 'hover:bg-surface-container-high'
                            }`}
                          >
                            <Mosaico resultado={r} />
                            <Contenido resultado={r} consulta={query} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {grupo.hasMore && (
                    <p className="px-card pb-tight text-xs text-text-secondary">Hay más resultados, afina la búsqueda.</p>
                  )}
                </div>
              ),
            )}
            {cargando && (
              <div className="flex items-center gap-inline px-card py-inline" aria-hidden="true">
                <Skeleton className="size-10 shrink-0 rounded-control" />
                <div className="flex-1 space-y-tight">
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
