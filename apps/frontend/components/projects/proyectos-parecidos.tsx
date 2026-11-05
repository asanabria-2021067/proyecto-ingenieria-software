'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import {
  AvailableProjectCard,
  PROJECT_CARD_GRID,
  type ProyectoDisponibleResumen,
} from '@/components/projects/available-project-card';
import { ProjectGridFull } from '@/components/projects/detail/project-content-grid';

/** MEJ-93: hasta 6 proyectos parecidos, a ancho completo bajo el detalle; sin resultados (o si el servidor responde 404) no se pinta nada. */
export function ProyectosParecidos({ idProyecto }: { idProyecto: number }) {
  const { data } = useQuery<ProyectoDisponibleResumen[]>({
    queryKey: ['proyecto-similares', idProyecto],
    queryFn: () => apiFetch(`/proyectos/${idProyecto}/similares`),
    retry: false,
  });
  if (!Array.isArray(data) || data.length === 0) return null;

  return (
    <ProjectGridFull role="region" aria-labelledby="proyectos-parecidos-titulo">
      <h2 id="proyectos-parecidos-titulo" className="type-section">
        Proyectos parecidos
      </h2>
      <div className={PROJECT_CARD_GRID}>
        {data.slice(0, 6).map((proyecto) => (
          <AvailableProjectCard key={proyecto.idProyecto} proyecto={proyecto} />
        ))}
      </div>
    </ProjectGridFull>
  );
}
