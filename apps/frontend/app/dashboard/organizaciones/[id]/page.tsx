'use client';

import { PageTitle } from '@/components/ui/page-title';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Archive, Building2, ChevronLeft, ExternalLink, Folder, Globe, LogOut, Lock, Pencil, Plus, Users } from 'lucide-react';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { AnunciosEntidad } from '@/components/anuncios/anuncios-entidad';
import { OrgCalendario } from '@/components/organizations/org-calendario';
import { InvitarDialog } from '@/components/organizations/invitar-dialog';
import { SeguirOrganizacion } from '@/components/organizations/boton-seguir';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { OrgChat } from '@/components/organizations/org-chat';
import { OrgMiembros } from '@/components/organizations/org-miembros';
import { OrgPendientes } from '@/components/organizations/org-pendientes';
import { OrgProyectos } from '@/components/organizations/org-proyectos';
import { TransferirDialog } from '@/components/organizations/transferir-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SkeletonDetail } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  useArchivarOrganizacion,
  useOrganizacion,
  useSalirDeOrganizacion,
  useSolicitarUnirse,
} from '@/hooks/use-organizations';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { puedeGestionar, puedePublicarComo, ROL_LABEL } from '@/lib/organizations/roles';
import { safeExternalHref } from '@/lib/security/safe-url';
import { aviso, confirmar } from '@/lib/mensajes';
import { getApiErrorStatus } from '@/components/projects/api-error';

export default function OrganizacionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: usuario } = useCurrentUser();
  const { data: org, isLoading, isError, error } = useOrganizacion(id);
  const salir = useSalirDeOrganizacion(id);
  const archivar = useArchivarOrganizacion(id);
  const solicitar = useSolicitarUnirse();

  if (isLoading) {
    return <SkeletonDetail label="Cargando organización" sections={2} className={dashboardPage('pt-7 pb-10')} />;
  }

  if (isError || !org) {
    const noExiste = [403, 404].includes(getApiErrorStatus(error) ?? 0);
    return (
      <div className={dashboardPage('pt-7 pb-10')}>
        <Empty tone={noExiste ? 'muted' : 'danger'} role={noExiste ? 'status' : 'alert'}>
          <EmptyMedia variant="icon">
            <Building2 aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{noExiste ? 'Organización no encontrada' : 'No se pudo cargar la organización'}</EmptyTitle>
            <EmptyDescription>
              {noExiste ? 'No existe, o es privada y no eres miembro.' : 'Intenta nuevamente en unos segundos.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/dashboard/organizaciones">Volver a mis organizaciones</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const esMiembro = org.miRol !== null;
  const gestiona = puedeGestionar(org.miRol);
  const esPropietario = org.miRol === 'PROPIETARIO';
  const sitio = safeExternalHref(org.sitioWeb);
  const idUsuario = usuario?.idUsuario ?? null;
  const pendientes = (org.invitacionesPendientes ?? 0) + (org.solicitudesPendientes ?? 0);

  const salirDeLaOrg = async () => {
    const ok = await confirmar({
      titulo: `¿Salir de ${org.nombreOrganizacion}?`,
      descripcion: 'Dejarás de ver sus proyectos privados y su chat. Para volver necesitarás una invitación o que acepten tu solicitud.',
      textoAccion: 'Salir de la organización',
      destructiva: true,
    });
    if (!ok) return;
    salir.mutate(undefined, {
      onSuccess: () => {
        aviso.exito('Saliste de la organización');
        router.push('/dashboard/organizaciones');
      },
      onError: (err) => aviso.error('No se pudo salir', mensajeErrorOrganizacion(err)),
    });
  };

  const archivarOrg = async () => {
    const ok = await confirmar({
      titulo: `¿Archivar ${org.nombreOrganizacion}?`,
      descripcion:
        'Queda en solo lectura: sus proyectos siguen visibles pero no se podrán crear nuevos ni invitar miembros. Se cancelan las invitaciones y solicitudes pendientes.',
      textoAccion: 'Archivar organización',
      destructiva: true,
    });
    if (!ok) return;
    archivar.mutate(undefined, {
      onSuccess: () => aviso.exito('Organización archivada'),
      onError: (err) => aviso.error('No se pudo archivar', mensajeErrorOrganizacion(err)),
    });
  };

  const solicitarUnirse = () =>
    solicitar.mutate(org.idOrganizacion, {
      onSuccess: () => aviso.exito('Solicitud enviada', 'Los administradores de la organización la revisarán.'),
      onError: (err) => aviso.error('No se pudo enviar la solicitud', mensajeErrorOrganizacion(err)),
    });

  return (
    <div className={dashboardPage('pt-7 pb-10')}>
      <Link
        href="/dashboard/organizaciones"
        className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-tertiary transition-colors hover:text-on-surface"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Mis organizaciones
      </Link>

      {org.archivada && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-card border border-outline-variant/40 bg-surface-container-low px-stack py-inline type-body">
          <Archive aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <p>
            <span className="font-semibold">Organización archivada.</span> Está en solo lectura: sus proyectos siguen visibles.
          </p>
        </div>
      )}

      <section className="card-base mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <OrgAvatar nombre={org.nombreOrganizacion} logoUrl={org.logoUrl} className="size-16 sm:size-20" />
          <div className="min-w-0">
            <PageTitle className="type-display break-words">{org.nombreOrganizacion}</PageTitle>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Tag tone={org.visibilidad === 'PUBLICA' ? 'green' : 'slate'}>
                {org.visibilidad === 'PUBLICA' ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {org.visibilidad === 'PUBLICA' ? 'Pública' : 'Privada'}
              </Tag>
              {org.miRol && <Tag tone="lime">{ROL_LABEL[org.miRol]}</Tag>}
              <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                <Users aria-hidden="true" className="size-4" />
                {org.totalMiembros === 1 ? '1 miembro' : `${org.totalMiembros} miembros`}
              </span>
              <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                <Folder aria-hidden="true" className="size-4" />
                {org.proyectos.length === 1 ? '1 proyecto' : `${org.proyectos.length} proyectos`}
              </span>
            </div>
            <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-sm text-on-surface-variant">
              {org.descripcionOrganizacion || 'Sin descripción.'}
            </p>
            {sitio && (
              <a
                href={sitio}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {org.sitioWeb}
              </a>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <SeguirOrganizacion id={org.idOrganizacion} nombre={org.nombreOrganizacion} />
          {puedePublicarComo(org.miRol) && org.puedePublicar && (
            <Button asChild>
              <Link href={`/dashboard/projects/mine/form?org=${org.idOrganizacion}`}>
                <Plus aria-hidden="true" />
                Nuevo proyecto
              </Link>
            </Button>
          )}
          {gestiona && !org.archivada && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/organizaciones/${org.idOrganizacion}/editar`}>
                <Pencil aria-hidden="true" />
                Editar
              </Link>
            </Button>
          )}
          {gestiona && !org.archivada && <InvitarDialog idOrganizacion={org.idOrganizacion} miRol={org.miRol} />}
          {esPropietario && !org.archivada && org.miembros && (
            <TransferirDialog idOrganizacion={org.idOrganizacion} miembros={org.miembros} idUsuarioActual={idUsuario} />
          )}
          {esPropietario && !org.archivada && (
            <Button type="button" variant="outline" disabled={archivar.isPending} onClick={archivarOrg}>
              <Archive aria-hidden="true" />
              Archivar
            </Button>
          )}
          {esMiembro && !esPropietario && (
            <Button type="button" variant="outline" disabled={salir.isPending} onClick={salirDeLaOrg}>
              <LogOut aria-hidden="true" />
              Salir
            </Button>
          )}
          {!esMiembro && org.visibilidad === 'PUBLICA' && !org.archivada &&
            (org.solicitudPendiente ? (
              <span className="inline-flex items-center text-sm font-semibold text-on-surface-variant">Solicitud enviada</span>
            ) : (
              <Button type="button" disabled={solicitar.isPending} onClick={solicitarUnirse}>
                Solicitar unirse
              </Button>
            ))}
        </div>
      </section>

      <Tabs defaultValue="proyectos">
        <TabsList className="mb-4.5 h-auto flex-wrap">
          <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
          {org.miembros && <TabsTrigger value="miembros">Miembros ({org.miembros.length})</TabsTrigger>}
          {esMiembro && <TabsTrigger value="chat">Chat</TabsTrigger>}
          {esMiembro && <TabsTrigger value="anuncios">Anuncios</TabsTrigger>}
          {esMiembro && <TabsTrigger value="calendario">Calendario</TabsTrigger>}
          {gestiona && (
            <TabsTrigger value="pendientes">Solicitudes e invitaciones{pendientes > 0 ? ` (${pendientes})` : ''}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="proyectos" className="card-base">
          <OrgProyectos proyectos={org.proyectos} />
        </TabsContent>
        {org.miembros && (
          <TabsContent value="miembros" className="card-base">
            <OrgMiembros
              idOrganizacion={org.idOrganizacion}
              miembros={org.miembros}
              miRol={org.miRol}
              idUsuarioActual={idUsuario}
              archivada={org.archivada}
            />
          </TabsContent>
        )}
        {esMiembro && (
          <TabsContent value="chat">
            <OrgChat idOrganizacion={org.idOrganizacion} puedeFijar={gestiona} />
          </TabsContent>
        )}
        {esMiembro && (
          <TabsContent value="anuncios">
            <AnunciosEntidad tipo="organizaciones" id={org.idOrganizacion} puedePublicar={gestiona && !org.archivada} />
          </TabsContent>
        )}
        {esMiembro && (
          <TabsContent value="calendario">
            <OrgCalendario idOrganizacion={org.idOrganizacion} />
          </TabsContent>
        )}
        {gestiona && (
          <TabsContent value="pendientes" className="card-base">
            <OrgPendientes idOrganizacion={org.idOrganizacion} archivada={org.archivada} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
