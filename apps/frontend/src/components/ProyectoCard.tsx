import { Proyecto, TipoProyecto, EstadoProyecto } from '@/types/proyecto';

const TIPO_LABELS: Record<TipoProyecto, string> = {
  ACADEMICO_HORAS_BECA: 'Académico · Horas Beca',
  ACADEMICO_EXPERIENCIA: 'Académico · Experiencia',
  EXTRACURRICULAR_EXTENSION: 'Extracurricular / Extensión',
};

const ESTADO_STYLES: Record<EstadoProyecto, { color: string; bg: string }> = {
  BORRADOR: { color: '#6b7280', bg: '#f3f4f6' },
  PUBLICADO: { color: '#1d4ed8', bg: '#eff6ff' },
  EN_PROGRESO: { color: '#15803d', bg: '#f0fdf4' },
  CERRADO: { color: '#b91c1c', bg: '#fef2f2' },
};

const ESTADO_LABELS: Record<EstadoProyecto, string> = {
  BORRADOR: 'Borrador',
  PUBLICADO: 'Publicado',
  EN_PROGRESO: 'En Progreso',
  CERRADO: 'Cerrado',
};

interface ProyectoCardProps {
  proyecto: Proyecto;
}

export default function ProyectoCard({ proyecto }: ProyectoCardProps) {
  const {
    tituloProyecto,
    descripcionProyecto,
    tipoProyecto,
    estadoProyecto,
    modalidadProyecto,
    creador,
    organizaciones,
    fechaInicio,
    fechaFinEstimada,
  } = proyecto;

  const orgPrincipal = organizaciones?.[0]?.organizacion?.nombreOrganizacion;
  const estadoStyle = ESTADO_STYLES[estadoProyecto] ?? ESTADO_STYLES.BORRADOR;

  const descripcionCorta =
    descripcionProyecto.length > 180
      ? `${descripcionProyecto.slice(0, 180)}…`
      : descripcionProyecto;

  return (
    <article
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '20px 24px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
          {tituloProyecto}
        </h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: '3px 10px',
            borderRadius: 99,
            color: estadoStyle.color,
            background: estadoStyle.bg,
            whiteSpace: 'nowrap',
          }}
        >
          {ESTADO_LABELS[estadoProyecto]}
        </span>
      </div>

      {/* Descripción */}
      <p style={{ margin: 0, color: '#4b5563', fontSize: 14, lineHeight: 1.6 }}>
        {descripcionCorta}
      </p>

      {/* Etiquetas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
        <Tag>{TIPO_LABELS[tipoProyecto]}</Tag>
        <Tag>{modalidadProyecto}</Tag>
        {orgPrincipal && <Tag>{orgPrincipal}</Tag>}
      </div>

      {/* Pie */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 4,
          fontSize: 12,
          color: '#9ca3af',
          borderTop: '1px solid #f3f4f6',
          paddingTop: 10,
          marginTop: 4,
        }}
      >
        <span>
          {creador.nombre} {creador.apellido}
        </span>
        {fechaInicio && (
          <span>
            {fechaFinEstimada
              ? `${fmt(fechaInicio)} → ${fmt(fechaFinEstimada)}`
              : `Inicio: ${fmt(fechaInicio)}`}
          </span>
        )}
      </div>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: '#f3f4f6',
        color: '#374151',
        borderRadius: 4,
        padding: '2px 8px',
      }}
    >
      {children}
    </span>
  );
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
