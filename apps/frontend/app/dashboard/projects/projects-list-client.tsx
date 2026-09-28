'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Lock, SearchX } from 'lucide-react';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';
import { estadoBadgeLabel } from '@/components/projects/available-project-card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptySteps,
  EmptyTitle,
} from '@/components/ui/empty';

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

// El acento solo destaca una cosa por bloque (docs/design-system.md); no repetirlo
// por tarjeta. `--color-status-warning` == `--color-accent` en global.css, así que
// usarlo aquí lo volvería indistinguible de EN_REVISION/OBSERVADO/EN_SOLICITUD_CIERRE.
const ESTADO_STYLES: Record<string, string> = {
  PUBLICADO:            'bg-status-success text-on-status-success',
  EN_PROGRESO:          'bg-surface-container-high text-text-secondary',
  BORRADOR:             'bg-surface-container-high text-text-secondary',
  EN_REVISION:          'bg-status-warning text-on-status-warning',
  OBSERVADO:            'bg-status-warning text-on-status-warning',
  EN_SOLICITUD_CIERRE:  'bg-status-warning text-on-status-warning',
  CERRADO:              'bg-surface-container-high text-text-secondary',
  CANCELADO:            'bg-status-error text-on-status-error',
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
      <Empty tone="muted" className="surface-enter" aria-live="polite">
        <EmptyMedia variant="icon">
          {searchQuery ? (
            <SearchX aria-hidden="true" className="h-7 w-7" />
          ) : (
            <FolderOpen aria-hidden="true" className="h-7 w-7" />
          )}
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {searchQuery ? 'No hay proyectos con esa busqueda' : 'No hay proyectos disponibles'}
          </EmptyTitle>
          <EmptyDescription>
            {searchQuery
              ? `No encontramos coincidencias para "${searchQuery}". Prueba con otro termino.`
              : 'Las oportunidades publicadas apareceran aqui cuando esten disponibles.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptySteps />
      </Empty>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => (
          <Link
            key={project.idProyecto}
            href={`/dashboard/proyectos/${project.idProyecto}`}
            className="card-base surface-enter interactive-lift group block hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="type-subtitle text-text-primary transition-colors line-clamp-2">
                {project.tituloProyecto}
              </h2>
              <span
                className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-full type-meta font-semibold ${
                  ESTADO_STYLES[project.estadoProyecto] ?? 'bg-surface-container-high text-text-secondary'
                }`}
              >
                {project.estadoProyecto === 'CERRADO' && <Lock className="h-3 w-3" aria-hidden="true" />}
                {estadoBadgeLabel(project.estadoProyecto)}
              </span>
            </div>
            {project.descripcionProyecto && (
              <p className="type-meta text-text-secondary line-clamp-2 mb-3">
                {project.descripcionProyecto}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded type-meta bg-surface-container-high text-text-secondary">
                {project.tipoProyecto}
              </span>
              <span className="px-2 py-0.5 rounded type-meta bg-surface-container-high text-text-secondary">
                {project.modalidadProyecto}
              </span>
              {project.estadoProyecto === 'CERRADO' && (
                <span className="px-2 py-0.5 rounded type-meta bg-surface-container-high text-text-secondary">
                  Solo consulta · histórico
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {currentPage < totalPages && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-card border border-outline-variant type-body font-semibold text-text-primary shadow-card hover:shadow-raised transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Cargando...' : 'Cargar más proyectos'}
          </button>
        </div>
      )}
    </div>
  );
}
