import ProyectoCard from '@/components/ProyectoCard';
import { getProyectos } from '@/lib/api';
import { Proyecto } from '@/types/proyecto';

export const metadata = {
  title: 'Proyectos · UVG Collab',
  description: 'Explora los proyectos académicos y extracurriculares disponibles.',
};

export default async function ProyectosPage() {
  let proyectos: Proyecto[] = [];
  let error: string | null = null;

  try {
    proyectos = await getProyectos();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error desconocido al cargar proyectos';
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px' }}>
      {/* Encabezado */}
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#111827' }}>
          Proyectos
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 15 }}>
          Explora los proyectos académicos y extracurriculares disponibles.
        </p>
      </header>

      {/* Estado de error */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '14px 18px',
            color: '#dc2626',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Estado vacío */}
      {!error && proyectos.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            color: '#9ca3af',
            padding: '64px 0',
            fontSize: 15,
          }}
        >
          No hay proyectos publicados aún.
        </div>
      )}

      {/* Lista de proyectos */}
      {!error && proyectos.length > 0 && (
        <>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9ca3af' }}>
            {proyectos.length} {proyectos.length === 1 ? 'proyecto encontrado' : 'proyectos encontrados'}
          </p>
          <div style={{ display: 'grid', gap: 14 }}>
            {proyectos.map((proyecto) => (
              <ProyectoCard key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
