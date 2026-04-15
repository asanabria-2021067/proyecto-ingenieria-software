'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getContributorProjects, getMyProjects } from '@/lib/services/projects';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';

type Tab = 'OWNED' | 'CONTRIBUTOR';

export default function MyProjectsPage() {
  const [tab, setTab] = useState<Tab>('OWNED');
  const [owned, setOwned] = useState<MiProyectoListItemDTO[]>([]);
  const [contrib, setContrib] = useState<MiProyectoListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyProjects(), getContributorProjects()])
      .then(([mine, asContributor]) => {
        setOwned(mine);
        setContrib(asContributor);
      })
      .catch(() => setError('No se pudieron cargar tus proyectos'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => (tab === 'OWNED' ? owned : contrib), [tab, owned, contrib]);

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Mis Proyectos</h1>
      <p className="mb-6 text-sm text-gray-500">Vista consolidada de proyectos propios y como colaborador.</p>

      <div className="mb-6 flex gap-2">
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'OWNED' ? 'bg-[#006735] text-white' : 'bg-gray-200 text-gray-700'}`}
          onClick={() => setTab('OWNED')}
        >
          Propios
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'CONTRIBUTOR' ? 'bg-[#006735] text-white' : 'bg-gray-200 text-gray-700'}`}
          onClick={() => setTab('CONTRIBUTOR')}
        >
          Como colaborador
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-gray-500">No hay proyectos para este filtro.</p>}
          {rows.map((p) => (
            <Link
              key={p.idProyecto}
              href={`/dashboard/projects/${p.idProyecto}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">{p.tituloProyecto}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                  {p.estadoProyecto}
                </span>
              </div>
              {p.revisiones?.[0] && (
                <p className="mt-2 text-xs text-gray-500">
                  Última revisión: {p.revisiones[0].estadoRevision} (envío #{p.revisiones[0].numeroEnvio})
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
