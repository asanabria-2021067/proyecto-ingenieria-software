'use client';

import { useEffect, useState } from 'react';
import {
  approveProjectClosure,
  getAdminReviewInbox,
  reclamarRevision,
  rejectProjectClosure,
  resolverRevision,
} from '@/lib/services/projects';

type Inbox = Awaited<ReturnType<typeof getAdminReviewInbox>>;

export default function AdminReviewsInboxPage() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    getAdminReviewInbox()
      .then(setInbox)
      .catch(() => setError('No se pudo cargar la bandeja'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  async function claim(idProyecto: number) {
    await reclamarRevision(idProyecto);
    await refresh();
  }

  async function resolve(idProyecto: number, resultado: 'APROBADA' | 'OBSERVADA') {
    const comentario = window.prompt('Comentario de revisión (opcional):') ?? undefined;
    await resolverRevision(idProyecto, { resultado, comentario });
    await refresh();
  }

  async function resolveClosure(idProyecto: number, action: 'APPROVE' | 'REJECT') {
    if (action === 'APPROVE') {
      await approveProjectClosure(idProyecto);
    } else {
      await rejectProjectClosure(idProyecto);
    }
    await refresh();
  }

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Bandeja Admin</h1>
      <p className="mb-6 text-sm text-gray-500">Revisiones y solicitudes de cierre pendientes.</p>

      {loading && <p className="text-sm text-gray-500">Cargando...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && inbox && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-gray-600">Revisiones pendientes</h2>
            <div className="space-y-3">
              {inbox.revisionesPendientes.length === 0 && (
                <p className="text-sm text-gray-500">No hay revisiones pendientes.</p>
              )}
              {inbox.revisionesPendientes.map((r) => (
                <div key={r.idRevisionProyecto} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{r.proyecto.tituloProyecto}</p>
                  <p className="text-xs text-gray-500">Envío #{r.numeroEnvio}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded bg-gray-200 px-2 py-1 text-xs"
                      onClick={() => claim(r.idProyecto)}
                    >
                      Reclamar
                    </button>
                    <button
                      className="rounded bg-green-700 px-2 py-1 text-xs text-white"
                      onClick={() => resolve(r.idProyecto, 'APROBADA')}
                    >
                      Aprobar
                    </button>
                    <button
                      className="rounded bg-amber-600 px-2 py-1 text-xs text-white"
                      onClick={() => resolve(r.idProyecto, 'OBSERVADA')}
                    >
                      Observar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase text-gray-600">Solicitudes de cierre</h2>
            <div className="space-y-3">
              {inbox.cierresPendientes.length === 0 && (
                <p className="text-sm text-gray-500">No hay cierres pendientes.</p>
              )}
              {inbox.cierresPendientes.map((c) => (
                <div key={c.idProyecto} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{c.tituloProyecto}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded bg-red-700 px-2 py-1 text-xs text-white"
                      onClick={() => resolveClosure(c.idProyecto, 'APPROVE')}
                    >
                      Aprobar cierre
                    </button>
                    <button
                      className="rounded bg-gray-700 px-2 py-1 text-xs text-white"
                      onClick={() => resolveClosure(c.idProyecto, 'REJECT')}
                    >
                      Rechazar cierre
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
