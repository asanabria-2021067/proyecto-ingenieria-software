'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag, type TagTone } from '@/components/ui/tag';
import { getEstadoSistema, type EstadoServicio, type EstadoSistema } from '@/lib/services/admin-sistema';

const ESTADO: Record<EstadoServicio, { etiqueta: string; tono: TagTone }> = {
  operativo: { etiqueta: 'Operativo', tono: 'green' },
  caido: { etiqueta: 'Caído', tono: 'red' },
  no_configurado: { etiqueta: 'No configurado', tono: 'amber' },
};

const fecha = (iso: string | null) =>
  iso && !Number.isNaN(Date.parse(iso))
    ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(new Date(iso))
    : (iso ?? 'Sin fecha');

function Contenido({ estado }: { estado: EstadoSistema }) {
  const servicios: Array<[string, EstadoServicio, string?]> = [
    ['Base de datos', estado.baseDatos],
    ['Redis', estado.redis],
    ['Cloudinary', estado.cloudinary],
    ['Socket', estado.socket, `${estado.conexionesSocket} conexiones`],
  ];
  return (
    <>
      <ul className="divide-y divide-outline-variant/50">
        {servicios.map(([nombre, valor, extra]) => (
          <li key={nombre} className="flex items-center justify-between gap-inline px-card py-inline">
            <span className="type-body font-semibold">{nombre}</span>
            <span className="flex items-center gap-inline">
              {extra && <span className="type-meta tabular-nums">{extra}</span>}
              <Tag tone={ESTADO[valor].tono} size="sm">
                {ESTADO[valor].etiqueta}
              </Tag>
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-outline-variant/50 px-card py-stack">
        <p className="type-body font-semibold">Versión desplegada</p>
        <p className="type-meta mt-micro">
          Commit <span className="font-mono">{estado.version.commit.slice(0, 7)}</span> · {fecha(estado.version.fecha)}
        </p>
        <p className="type-body mt-stack font-semibold">Últimas migraciones</p>
        {estado.migraciones.length === 0 ? (
          <p className="type-meta mt-micro">Sin migraciones registradas.</p>
        ) : (
          <ul className="mt-micro">
            {estado.migraciones.map((m) => (
              <li key={m.nombre} className="type-meta break-all">
                {m.nombre} · {fecha(m.fecha)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Estado de los servicios de la plataforma. Consulta por su cuenta: si falla, el resto del panel sigue. */
export function EstadoSistemaCard() {
  const tituloId = useId();
  const { data, isLoading, isError } = useQuery<EstadoSistema>({
    queryKey: ['adminEstadoSistema'],
    queryFn: getEstadoSistema,
    retry: false,
  });
  return (
    <section aria-labelledby={tituloId} className="card-base flex flex-col overflow-hidden p-0">
      <header className="border-b border-outline-variant/50 px-card py-stack">
        <h3 id={tituloId} className="type-subtitle text-lg font-semibold">
          Servicios y versión
        </h3>
      </header>
      {isLoading ? (
        <SkeletonRegion className="flex flex-col gap-stack p-card" label="Cargando el estado del sistema">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </SkeletonRegion>
      ) : isError || !data ? (
        <p role="alert" className="type-body px-card py-stack text-text-secondary">
          No se pudo cargar el estado del sistema.
        </p>
      ) : (
        <Contenido estado={data} />
      )}
    </section>
  );
}
