import Link from 'next/link';
import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';

const API_BASE_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

async function getProjects(q?: string): Promise<ProyectoListItemDTO[]> {
  const url = new URL(`${API_BASE_URL}/proyectos`);
  if (q) url.searchParams.set('q', q);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

const ESTADO_STYLES: Record<string, string> = {
  PUBLICADO:   'bg-[#006735] text-white',
  EN_PROGRESO: 'bg-[#416900] text-white',
  BORRADOR:    'bg-gray-100 text-gray-600',
  EN_REVISION: 'bg-blue-100 text-blue-700',
  OBSERVADO:   'bg-amber-100 text-amber-700',
  EN_SOLICITUD_CIERRE: 'bg-purple-100 text-purple-700',
  CERRADO:     'bg-gray-200 text-gray-500',
  CANCELADO:   'bg-red-100 text-red-700',
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function ProjectsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const projects = await getProjects(q);

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Proyectos</h1>
      <p className="mb-8 text-sm text-gray-500">
        Explora los proyectos universitarios disponibles y encuentra oportunidades de colaboración.
      </p>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">
          {q ? `No se encontraron proyectos para "${q}".` : 'No hay proyectos disponibles.'}
        </p>
      ) : (
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
      )}
    </main>
  );
}
