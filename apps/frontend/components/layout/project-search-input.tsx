'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { useProjectSearch } from '@/hooks/use-project-search';

export function ProjectSearchInput() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useProjectSearch(query);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(id: number) {
    setQuery('');
    setOpen(false);
    router.push(`/dashboard/projects/${id}`);
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        {isFetching && query.trim().length > 0 ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#006735] animate-spin pointer-events-none" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400 pointer-events-none" />
        )}
        <input
          type="text"
          value={query}
          aria-label="Buscar proyectos"
          aria-expanded={showDropdown}
          aria-controls="project-search-results"
          role="combobox"
          placeholder="Buscar proyectos..."
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          className="pl-8 h-8 w-44 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-[#006735]/60 focus:ring-1 focus:ring-[#006735]/30 transition-colors"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          id="project-search-results"
          role="listbox"
          aria-label="Resultados de busqueda de proyectos"
          className="surface-enter absolute top-full mt-1.5 right-0 w-72 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden"
        >
          {results.length === 0 && !isFetching && (
            <div className="px-4 py-4 text-center" role="status">
              <p className="text-xs font-semibold text-gray-700">Sin coincidencias</p>
              <p className="mt-1 text-[11px] text-gray-400">
                Prueba con otro titulo o area de interes.
              </p>
            </div>
          )}
          {results.length > 0 && (
            <ul>
              {results.map((proyecto) => (
                <li key={proyecto.idProyecto} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => handleSelect(proyecto.idProyecto)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors group focus-visible:bg-gray-50"
                  >
                    <p className="text-sm font-medium text-gray-900 group-hover:text-[#006735] truncate">
                      {proyecto.tituloProyecto}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {proyecto.tipoProyecto} · {proyecto.modalidadProyecto}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
