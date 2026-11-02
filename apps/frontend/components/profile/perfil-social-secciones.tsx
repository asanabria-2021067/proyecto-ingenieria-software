'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, Building2, Clock, Download, FileText, History, Landmark, Link2 } from 'lucide-react';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useActividadReciente, usePerfilResumen } from '@/hooks/use-perfil-social';
import { downloadBlob } from '@/lib/download-file';
import { aviso } from '@/lib/mensajes';
import { ROL_LABEL } from '@/lib/organizations/roles';
import { descargarCvPdf, type ActividadReciente } from '@/lib/services/perfil-social';

const horas = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} h`;

function CargandoSeccion({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="card-base space-y-tight">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-full" />
    </SkeletonRegion>
  );
}

/** MEJ-26: organizaciones, asociación de la carrera y horas acreditadas del semestre. */
export function PerfilOrganizaciones({
  idUsuario,
  propio = false,
  mostrarHoras = true,
}: {
  idUsuario: number;
  propio?: boolean;
  /** El perfil propio ya trae su tarjeta de horas del semestre. */
  mostrarHoras?: boolean;
}) {
  const { data, isLoading, isError } = usePerfilResumen(idUsuario);
  if (isLoading) return <CargandoSeccion label="Cargando organizaciones y horas" />;
  if (isError || !data) return null;

  const { organizaciones, asociaciones, horasSemestre } = data;
  return (
    <>
      <section className="card-base space-y-stack" aria-labelledby={`perfil-orgs-${idUsuario}`}>
        <h2 id={`perfil-orgs-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          Organizaciones y asociación
        </h2>
        {asociaciones.length > 0 && (
          <ul className="flex flex-col gap-tight">
            {asociaciones.map((a) => (
              <li key={a.idAsociacion} className="flex items-center gap-tight">
                <OrgAvatar nombre={a.nombre} logoUrl={a.logoUrl} className="size-9" />
                <span className="type-body min-w-0 flex-1 truncate font-medium text-text-primary">{a.nombre}</span>
                <Tag tone="forest" size="sm">
                  <Landmark className="size-3" aria-hidden="true" /> Asociación de su carrera
                </Tag>
              </li>
            ))}
          </ul>
        )}
        {organizaciones.length > 0 ? (
          <ul className="flex flex-col gap-tight">
            {organizaciones.map((o) => (
              <li key={o.idOrganizacion}>
                <Link
                  href={`/dashboard/organizaciones/${o.idOrganizacion}`}
                  className="flex items-center gap-tight rounded-control p-tight transition-colors hover:bg-surface-container"
                >
                  <OrgAvatar nombre={o.nombreOrganizacion} logoUrl={o.logoUrl} className="size-9" />
                  <span className="type-body min-w-0 flex-1 truncate font-medium text-text-primary">{o.nombreOrganizacion}</span>
                  <Tag tone="subtle" size="sm">{ROL_LABEL[o.rol] ?? o.rol}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-tight">
            <p className="type-body text-text-secondary">
              {propio ? 'Todavía no perteneces a ninguna organización.' : 'No muestra organizaciones por ahora.'}
            </p>
            {propio && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/organizaciones">Explorar organizaciones</Link>
              </Button>
            )}
          </div>
        )}
      </section>

      {mostrarHoras && (
        <section className="card-base space-y-tight" aria-labelledby={`perfil-horas-${idUsuario}`}>
          <h2 id={`perfil-horas-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
            <Clock className="size-4 text-primary" aria-hidden="true" />
            Horas acreditadas {horasSemestre.anio}-{horasSemestre.periodo}
          </h2>
          <dl className="grid grid-cols-2 gap-tight">
            <div>
              <dt className="type-meta">Beca</dt>
              <dd className="type-display tabular-nums text-text-primary">{horas(horasSemestre.becaAcreditadas)}</dd>
            </div>
            <div>
              <dt className="type-meta">Extensión</dt>
              <dd className="type-display tabular-nums text-text-primary">{horas(horasSemestre.extensionAcreditadas)}</dd>
            </div>
          </dl>
          <p className="type-meta">Solo cuenta lo acreditado en UVGenius este semestre.</p>
        </section>
      )}
    </>
  );
}

const ICONO_ACTIVIDAD = { PROYECTO: FileText, INSIGNIA: Award, ORGANIZACION: Building2 } as const;

function textoActividad(a: ActividadReciente): string {
  if (a.tipo === 'PROYECTO') return `Se unió a ${a.titulo}${a.detalle ? ` como ${a.detalle}` : ''}`;
  if (a.tipo === 'INSIGNIA') return `Obtuvo la insignia ${a.titulo}${a.detalle ? ` (${a.detalle.toLowerCase()})` : ''}`;
  return `Se unió a ${a.titulo}`;
}

function destinoActividad(a: ActividadReciente): string | null {
  if (a.idProyecto) return `/dashboard/proyectos/${a.idProyecto}`;
  if (a.idOrganizacion) return `/dashboard/organizaciones/${a.idOrganizacion}`;
  return null;
}

/** MEJ-64: últimos movimientos visibles para quien mira (el servidor ya filtra por permisos). */
export function PerfilActividad({ idUsuario, propio = false }: { idUsuario: number; propio?: boolean }) {
  const { data, isLoading, isError } = useActividadReciente(idUsuario);
  if (isLoading) return <CargandoSeccion label="Cargando actividad reciente" />;
  if (isError || !data) return null;

  return (
    <section className="card-base space-y-stack" aria-labelledby={`perfil-actividad-${idUsuario}`}>
      <h2 id={`perfil-actividad-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
        <History className="size-4 text-primary" aria-hidden="true" />
        Actividad reciente
      </h2>
      {data.length === 0 ? (
        <div className="space-y-tight">
          <p className="type-body text-text-secondary">Sin actividad reciente para mostrar.</p>
          {propio && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/proyectos">Explorar proyectos</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-tight">
          {data.map((a, i) => {
            const Icono = ICONO_ACTIVIDAD[a.tipo];
            const destino = destinoActividad(a);
            const contenido = (
              <>
                <Icono className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <span className="type-body min-w-0 flex-1">{textoActividad(a)}</span>
                <time dateTime={a.fecha} className="type-meta shrink-0 tabular-nums">
                  {new Date(a.fecha).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}
                </time>
              </>
            );
            return (
              <li key={`${a.tipo}-${a.fecha}-${i}`}>
                {destino ? (
                  <Link href={destino} className="flex items-center gap-tight rounded-control p-tight transition-colors hover:bg-surface-container">
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex items-center gap-tight p-tight">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** MEJ-27/63: ver el CV de proyectos, descargarlo en PDF o copiar el enlace (abre solo con sesión iniciada). */
export function PerfilCvAcciones({ idUsuario, nombre }: { idUsuario: number; nombre?: string }) {
  const [descargando, setDescargando] = useState(false);
  const ruta = `/dashboard/personas/${idUsuario}/cv`;

  const descargar = async () => {
    setDescargando(true);
    try {
      downloadBlob(await descargarCvPdf(idUsuario), 'cv-proyectos.pdf');
    } catch {
      aviso.error('No se pudo descargar el CV', 'Intenta de nuevo en unos segundos.');
    } finally {
      setDescargando(false);
    }
  };

  const copiar = () =>
    navigator.clipboard
      .writeText(`${window.location.origin}${ruta}`)
      .then(() => aviso.exito('Enlace copiado', 'Quien lo abra necesita iniciar sesión en UVGenius.'))
      .catch(() => aviso.error('No se pudo copiar', 'Copia el enlace manualmente desde la barra de direcciones.'));

  return (
    <div className="flex flex-wrap gap-tight" role="group" aria-label={`CV de proyectos${nombre ? ` de ${nombre}` : ''}`}>
      <Button asChild variant="outline" size="sm">
        <Link href={ruta}>
          <FileText aria-hidden="true" /> Ver currículum de proyectos
        </Link>
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={descargando} onClick={() => void descargar()}>
        <Download aria-hidden="true" /> CV en PDF
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
        <Link2 aria-hidden="true" /> Copiar enlace del CV
      </Button>
    </div>
  );
}
