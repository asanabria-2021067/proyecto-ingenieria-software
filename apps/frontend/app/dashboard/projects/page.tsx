import type { ProyectoListItemDTO } from '@/lib/dto/project.dto';
import { ProjectsListClient } from './projects-list-client';

const API_BASE_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const PAGE_LIMIT = 12;

interface PaginatedResult {
  data: ProyectoListItemDTO[];
  total: number;
  page: number;
  totalPages: number;
}

async function getProjectsPage(q?: string): Promise<PaginatedResult> {
  const url = new URL(`${API_BASE_URL}/proyectos`);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', String(PAGE_LIMIT));
  if (q) url.searchParams.set('q', q);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) return { data: [], total: 0, page: 1, totalPages: 0 };
  return res.json();
}

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function ProjectsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const result = await getProjectsPage(q);

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Proyectos</h1>
      <p className="mb-8 text-sm text-gray-500">
        Explora los proyectos universitarios disponibles y encuentra oportunidades de colaboración.
      </p>
      {result.total > 0 && (
        <p className="mb-4 text-xs text-gray-400">
          {result.total} proyecto{result.total !== 1 ? 's' : ''} encontrado{result.total !== 1 ? 's' : ''}
        </p>
      )}
      <ProjectsListClient
        initialData={result.data}
        initialTotalPages={result.totalPages}
        searchQuery={q}
      />
    </main>
  );
}
