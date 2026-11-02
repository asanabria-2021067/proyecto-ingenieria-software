'use client';

import Link from 'next/link';
import { Clock, Folder, Globe, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';
import { estadoBadgeLabel, estadoBadgeStyle } from '@/components/projects/available-project-card';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { SeguirOrganizacion } from '@/components/organizations/boton-seguir';
import { ROL_LABEL } from '@/lib/organizations/roles';
import type { MiOrganizacion, OrganizacionPublica } from '@/lib/types/organizations';

type OrgCardProps = {
  org: MiOrganizacion | OrganizacionPublica;
  /** Solo en el buscador: `Solicitar unirse` (o su estado) en vez de un rol propio. */
  onSolicitar?: (idOrganizacion: number) => void;
  solicitando?: boolean;
};

function VisibilidadTag({ publica }: { publica: boolean }) {
  return (
    <Tag tone={publica ? 'green' : 'slate'}>
      {publica ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
      {publica ? 'Pública' : 'Privada'}
    </Tag>
  );
}

function conteo(n: number, uno: string, varios: string) {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

export function OrgCard({ org, onSolicitar, solicitando = false }: OrgCardProps) {
  const proyectos = 'proyectos' in org ? org.proyectos : [];
  const solicitudPendiente = 'solicitudPendiente' in org && org.solicitudPendiente;
  const esMiembro = org.miRol !== null;

  return (
    <div data-testid={`org-card-${org.idOrganizacion}`} className="card-base flex min-h-56 flex-col hover:border-outline-variant hover:shadow-raised transition-[border-color,box-shadow] duration-180 ease-out">
      <div className="flex items-start gap-3">
        <OrgAvatar nombre={org.nombreOrganizacion} logoUrl={org.logoUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[17px] font-bold leading-5.5 text-on-surface">{org.nombreOrganizacion}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <VisibilidadTag publica={org.visibilidad === 'PUBLICA'} />
            {org.archivada && <Tag tone="closed">Archivada</Tag>}
            {org.miRol && <Tag tone="lime">{ROL_LABEL[org.miRol]}</Tag>}
          </div>
        </div>
      </div>

      <p className="mt-inline line-clamp-3 text-[13px] leading-4.5 text-on-surface-variant">
        {org.descripcionOrganizacion || 'Sin descripción.'}
      </p>

      <div className="mt-stack flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-on-surface-variant">
        <span className="flex items-center gap-1">
          <Users aria-hidden="true" className="size-4 shrink-0" />
          {conteo(org.totalMiembros, 'miembro', 'miembros')}
        </span>
        <span className="flex items-center gap-1">
          <Folder aria-hidden="true" className="size-4 shrink-0" />
          {conteo(org.totalProyectos, 'proyecto', 'proyectos')}
        </span>
      </div>

      {proyectos.length > 0 && (
        <ul className="mt-inline flex flex-col gap-1.5" aria-label={`Proyectos de ${org.nombreOrganizacion}`}>
          {proyectos.map((p) => (
            <li key={p.idProyecto} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="min-w-0 truncate text-on-surface">{p.tituloProyecto}</span>
              <span className={`pill pill-sm shrink-0 ${estadoBadgeStyle(p.estadoProyecto)}`}>
                {estadoBadgeLabel(p.estadoProyecto)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-card">
        <div className="flex flex-wrap items-center justify-end gap-x-inline gap-y-tight border-t border-outline-variant/40 pt-stack">
          <SeguirOrganizacion id={org.idOrganizacion} nombre={org.nombreOrganizacion} />
          {esMiembro || !onSolicitar ? (
            <Button asChild className={`shrink-0 ${PROJECT_ACTION_BUTTON_CLASS}`}>
              <Link href={`/dashboard/organizaciones/${org.idOrganizacion}`}>Ver organización</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className="h-9.5 text-[13px] font-semibold">
                <Link href={`/dashboard/organizaciones/${org.idOrganizacion}`}>Ver</Link>
              </Button>
              {solicitudPendiente ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-on-surface-variant">
                  <Clock aria-hidden="true" className="size-4" />
                  Solicitud enviada
                </span>
              ) : (
                <Button
                  type="button"
                  disabled={solicitando}
                  onClick={() => onSolicitar(org.idOrganizacion)}
                  className={`shrink-0 ${PROJECT_ACTION_BUTTON_CLASS}`}
                >
                  Solicitar unirse
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
