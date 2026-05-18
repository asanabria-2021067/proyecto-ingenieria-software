'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

interface PaginatedResult {
  data: ProyectoListItemDTO[];
  total: number;
  page: number;
  totalPages: number;
}

interface Props {
  initialData: ProyectoListItemDTO[];
  initialTotalPages: number;
  searchQuery?: string;
}

const ESTADO_STYLES: Record<string, string> = {
  PUBLICADO:            'bg-[#006735] text-white',
  EN_PROGRESO:          'bg-[#416900] text-white',
  BORRADOR:             'bg-gray-100 text-gray-600',
  EN_REVISION:          'bg-blue-100 text-blue-700',
  OBSERVADO:            'bg-amber-100 text-amber-700',
  EN_SOLICITUD_CIERRE:  'bg-purple-100 text-purple-700',
  CERRADO:              'bg-gray-200 text-gray-500',
  CANCELADO:            'bg-red-100 text-red-700',
};

const PAGE_LIMIT = 12;

export function ProjectsListClient({ initialData, initialTotalPages, searchQuery }: Props) {
  const [projects, setProjects] = useState<ProyectoListItemDTO[]>(initialData);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);

  async function handleLoadMore() {
    setLoading(true);
    try {
      const nextPage = currentPage + 1;
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(PAGE_LIMIT),
      });
      if (searchQuery) params.set('q', searchQuery);

      const res = await fetch(`/api/proyectos?${params.toString()}`);
      if (!res.ok) return;

      const result: PaginatedResult = await res.json();
      setProjects((prev) => [...prev, ...result.data]);
      setCurrentPage(nextPage);
      setTotalPages(result.totalPages);
    } finally {
      setLoading(false);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-16">
        {searchQuery
          ? `No se encontraron proyectos para "${searchQuery}".`
          : 'No hay proyectos disponibles.'}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link
            key={project.idProyecto}
            href={`/dashboard/projects/${project.idProyecto}`}
            className="group block bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-900 group-hover:text-[#006735] transition-colors line-clamp-2">
                {project.tituloProyecto}
              </h2>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  ESTADO_STYLES[project.estadoProyecto] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {project.estadoProyecto}
              </span>
            </div>
            {project.descripcionProyecto && (
              <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                {project.descripcionProyecto}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                {project.tipoProyecto}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                {project.modalidadProyecto}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {currentPage < totalPages && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md hover:border-[#006735] hover:text-[#006735] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Cargando...' : 'Cargar más proyectos'}
          </button>
        </div>
      )}
    </div>
  );
}
