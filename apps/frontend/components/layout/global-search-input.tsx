'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { useGlobalSearch } from '@/hooks/use-global-search';
import type {
  GlobalSearchResponseDTO,
  ProyectoResultadoBusquedaDTO,
  PersonaResultadoBusquedaDTO,
  TareaResultadoBusquedaDTO,
} from '@/lib/dto/global-search.dto';

type ResultadoAplanado =
  | { tipo: 'proyecto'; id: string; href: string; data: ProyectoResultadoBusquedaDTO }
  | { tipo: 'persona'; id: string; href: string; data: PersonaResultadoBusquedaDTO }
  | { tipo: 'tarea'; id: string; href: string; data: TareaResultadoBusquedaDTO };

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
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useGlobalSearch(query);
  const flat = useMemo(() => aplanar(data), [data]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [data]);

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

  const showDropdown = open && query.trim().length > 0;
  const grupos: { titulo: string; items: ResultadoAplanado[] }[] = [
    { titulo: 'Proyectos', items: flat.filter((r) => r.tipo === 'proyecto') },
    { titulo: 'Personas', items: flat.filter((r) => r.tipo === 'persona') },
    { titulo: 'Tareas', items: flat.filter((r) => r.tipo === 'tarea') },
  ];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        {isFetching && query.trim().length > 0 ? (
          <Loader2
            className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-text-secondary pointer-events-none"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-secondary pointer-events-none"
            aria-hidden="true"
          />
        )}
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          aria-label="Buscar proyectos, personas y tareas"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          role="combobox"
          placeholder="Buscar…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-9 w-full rounded-control border border-outline-variant bg-page pl-8 pr-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {isFetching && query.trim().length > 0 && (
          <span role="status" aria-label="Buscando" className="sr-only">
            Buscando…
          </span>
        )}
      </div>

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Resultados de busqueda"
          className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-control border border-outline-variant bg-card shadow-raised"
        >
          {!isFetching && flat.length === 0 && (
            <div className="px-4 py-4 text-center" role="status">
              <p className="text-sm font-semibold text-text-primary">Sin coincidencias</p>
              <p className="mt-1 text-xs text-text-secondary">Prueba con otro texto.</p>
            </div>
          )}
          {grupos.map((grupo) =>
            grupo.items.length === 0 ? null : (
              <div key={grupo.titulo} className="border-b border-outline-variant last:border-b-0">
                <p className="px-4 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {grupo.titulo}
                </p>
                <ul>
                  {grupo.items.map((r) => {
                    const globalIndex = flat.indexOf(r);
                    const activo = globalIndex === activeIndex;
                    return (
                      <li key={r.id} role="none">
                        <button
                          type="button"
                          id={r.id}
                          role="option"
                          aria-selected={activo}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                          onClick={() => irA(r)}
                          className={`block w-full px-4 py-2 text-left transition-colors ${
                            activo ? 'bg-surface-container-high' : 'hover:bg-surface-container-high'
                          }`}
                        >
                          {r.tipo === 'proyecto' && (
                            <p className="truncate text-sm font-medium text-text-primary">{r.data.tituloProyecto}</p>
                          )}
                          {r.tipo === 'persona' && (
                            <p className="truncate text-sm font-medium text-text-primary">
                              {r.data.nombre} {r.data.apellido}
                            </p>
                          )}
                          {r.tipo === 'tarea' && (
                            <>
                              <p className="truncate text-sm font-medium text-text-primary">{r.data.tituloTarea}</p>
                              <p className="truncate text-xs text-text-secondary">{r.data.tituloProyecto}</p>
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
