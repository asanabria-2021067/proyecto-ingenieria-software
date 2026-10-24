'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListTodo,
  UserCheck,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useProjectTeam } from '@/hooks/use-project-team';
import { useProjectPendingExitRequests } from '@/hooks/use-exit-request';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ESTADO_PARTICIPACION_STYLE } from '@/components/projects/member-status.utils';
import { ordenarMiembros, type MiembroSortKey, type SortDirection } from '@/components/projects/member-sort.utils';
import {
  sumarTareasActivas,
  sumarTareasCompletadas,
  sumarHorasReconocidas,
} from '@/components/projects/team-metrics.utils';
import type { GrupoMiembroProyecto, MiembroProyectoResumenDTO } from '@/lib/dto/member.dto';
import type { PendingLeaderReviewDto } from '@/lib/types/exit-requests';
import { PendingPostulationsCard } from '@/components/projects/pending-postulations-card';
import { PendingExitRequestsCard } from '@/components/projects/pending-exit-requests-card';
import { ProjectExportButtons } from '@/components/projects/project-export-buttons';
import { ExitRequestActions, ExitRequestBadge } from '@/components/projects/member-exit-request-actions';
import { ProjectBackLink, ProjectPageHeader, ProjectPageShell } from '@/components/projects/detail/project-page-shell';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';

const COLUMNAS_ORDENABLES: { key: MiembroSortKey; label: string }[] = [
  { key: 'nombre', label: 'Integrante' },
  { key: 'roles', label: 'Roles' },
  { key: 'estado', label: 'Estado' },
  { key: 'tareasActivas', label: 'Tareas activas' },
  { key: 'horasReconocidas', label: 'Horas reconocidas' },
];

// Misma tabla que las bandejas administrativas (`data-table`).
const TH = `h-auto whitespace-nowrap px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-middle';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className={DATA_TABLE_ROW_BORDER}>
          <TableCell className={TD}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </TableCell>
          <TableCell className={TD}>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell className={TD}>
            <Skeleton className="h-5 w-16 rounded-tag" />
          </TableCell>
          <TableCell className={TD}>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell className={TD}>
            <Skeleton className="h-4 w-14" />
          </TableCell>
          <TableCell className={TD}>
            <Skeleton className="h-4 w-16" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function SortableHeader({
  columnKey,
  label,
  sortKey,
  sortDirection,
  onSort,
}: {
  columnKey: MiembroSortKey;
  label: string;
  sortKey: MiembroSortKey;
  sortDirection: SortDirection;
  onSort: (key: MiembroSortKey) => void;
}) {
  const isActive = sortKey === columnKey;
  const Icon = isActive ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead
      aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      scope="col"
      className={TH}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
      >
        {label}
        <Icon aria-hidden="true" className={`h-3 w-3 ${isActive ? 'text-primary' : 'text-text-secondary/60'}`} />
      </button>
    </TableHead>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  // Mismo KPI que Mis Horas: icono neutro al par de la etiqueta, cifra grande.
  return <HoursKpiCard variante="en-linea" icon={Icon} label={label} value={value} isLoading={isLoading} />;
}

function MiembroRow({
  miembro,
  idProyecto,
  exitRequest,
}: {
  miembro: MiembroProyectoResumenDTO;
  idProyecto: number;
  exitRequest?: PendingLeaderReviewDto;
}) {
  const estilo = ESTADO_PARTICIPACION_STYLE[miembro.estadoParticipacion];
  const nombreCompleto = `${miembro.nombre} ${miembro.apellido}`;

  return (
    <TableRow className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
      <TableCell className={TD}>
        <div className="flex items-center gap-tight">
          <Avatar className="size-8 shrink-0">
            {miembro.fotoUrl && <AvatarImage src={miembro.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
              {getInitials(miembro.nombre, miembro.apellido)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="type-body whitespace-nowrap font-semibold text-text-primary">{nombreCompleto}</span>
            <ExitRequestBadge request={exitRequest} />
          </div>
        </div>
      </TableCell>
      <TableCell className={TD}>
        <div className="flex flex-wrap gap-1">
          {miembro.roles.map((rol) => (
            <span
              key={rol.idRolProyecto}
              className="pill pill-sm pill-sage"
            >
              {rol.nombreRol}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell className={TD}>
        <span className={`pill ${estilo.className}`}>
          {estilo.label}
        </span>
      </TableCell>
      <TableCell className={TD}>
        <span className="type-body tabular-nums text-text-primary">{miembro.tareasActivas}</span>
      </TableCell>
      <TableCell className={TD}>
        <span className="type-body whitespace-nowrap tabular-nums text-text-primary">{formatHoras(miembro.horasReconocidas)} h</span>
      </TableCell>
      <TableCell className={TD}>
        {exitRequest ? (
          <ExitRequestActions request={exitRequest} idProyecto={idProyecto} nombreCompleto={nombreCompleto} />
        ) : (
          <Link
            href={`/dashboard/proyectos/${idProyecto}/equipo/${miembro.idUsuario}`}
            className="inline-flex items-center gap-micro whitespace-nowrap type-meta font-semibold text-primary hover:underline"
          >
            Ver detalle
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Una de las tres secciones fijas de HU-123/B12 (Miembros activos / Retirados
 * con contribución / Retirados sin contribución). `miembros` ya viene
 * filtrado y ordenado por el padre según `grupo` — server-authoritative, esta
 * sección solo presenta, nunca reclasifica.
 */
function MembersGroupSection({
  groupId,
  icon: Icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
  miembros,
  idProyecto,
  sortKey,
  sortDirection,
  onSort,
  pendingExitRequests,
}: {
  groupId: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  miembros: MiembroProyectoResumenDTO[];
  idProyecto: number;
  sortKey: MiembroSortKey;
  sortDirection: SortDirection;
  onSort: (key: MiembroSortKey) => void;
  pendingExitRequests: PendingLeaderReviewDto[];
}) {
  const headingId = `${groupId}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-1 font-headline text-xl font-extrabold text-on-surface">
        {title}
      </h2>
      <p className="mb-4 text-sm text-tertiary">{description}</p>

      {miembros.length === 0 ? (
        // Tarjeta blanca (tono por defecto), como los vacíos de las bandejas administrativas.
        <Empty role="status">
          <EmptyMedia variant="icon">
            <Icon aria-hidden className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={DATA_TABLE_CARD}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  {COLUMNAS_ORDENABLES.map((columna) => (
                    <SortableHeader
                      key={columna.key}
                      columnKey={columna.key}
                      label={columna.label}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  ))}
                  <TableHead scope="col" className={TH}>
                    Detalle
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {miembros.map((miembro) => (
                  <MiembroRow
                    key={miembro.idUsuario}
                    miembro={miembro}
                    idProyecto={idProyecto}
                    exitRequest={pendingExitRequests.find((request) => request.idUsuario === miembro.idUsuario)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

function filtrarPorGrupo(
  miembros: MiembroProyectoResumenDTO[],
  grupo: GrupoMiembroProyecto,
): MiembroProyectoResumenDTO[] {
  return miembros.filter((miembro) => miembro.grupo === grupo);
}




export default function MiembrosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  // GET /proyectos/:id/miembros/resumen es exclusivo del líder en backend
  // (TeamService.getTeamSummary → requireOwner). Se detecta client-side con
  // el mismo criterio que el resto del detalle del proyecto
  // (creador.idUsuario === currentUser.idUsuario) para mostrar un aviso
  // claro en vez de una tabla vacía o un 403 crudo.
  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { data: currentUser, isLoading: cargandoUsuario } = useCurrentUser();
  const isLeader = !!currentUser && !!proyecto && currentUser.idUsuario === proyecto.creador.idUsuario;
  const cargandoPermisos = cargandoProyecto || cargandoUsuario;
  const volverAlProyectoHref = isLeader ? `/dashboard/projects/${id}` : `/dashboard/proyectos/${id}`;

  const { lider, miembros, isLoading, isError, refetch } = useProjectTeam(idProyecto);
  const {
    requests: pendingExitRequests,
    isError: isExitRequestsError,
    refetch: refetchExitRequests,
  } = useProjectPendingExitRequests(idProyecto);

  const tareasActivas = useMemo(() => sumarTareasActivas(miembros), [miembros]);
  const tareasCompletadas = useMemo(() => sumarTareasCompletadas(miembros), [miembros]);
  const horasReconocidas = useMemo(() => sumarHorasReconocidas(miembros), [miembros]);

  const [sortKey, setSortKey] = useState<MiembroSortKey>('nombre');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  function handleSort(key: MiembroSortKey) {
    if (key === sortKey) {
      setSortDirection((direccion) => (direccion === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  // B12 (`grupo` en TeamSummaryMemberDto) ya clasifica a cada integrante;
  // esto solo filtra por el valor que el backend resolvió, nunca reconstruye
  // el criterio (estadoParticipacion/horasReconocidas/tareas) en el cliente.
  const activos = useMemo(() => filtrarPorGrupo(miembros, 'ACTIVOS'), [miembros]);
  const retiradosConContribucion = useMemo(
    () => filtrarPorGrupo(miembros, 'RETIRADOS_CON_CONTRIBUCION'),
    [miembros],
  );
  const retiradosSinContribucion = useMemo(
    () => filtrarPorGrupo(miembros, 'RETIRADOS_SIN_CONTRIBUCION'),
    [miembros],
  );

  const activosOrdenados = useMemo(
    () => ordenarMiembros(activos, sortKey, sortDirection),
    [activos, sortKey, sortDirection],
  );
  const retiradosConContribucionOrdenados = useMemo(
    () => ordenarMiembros(retiradosConContribucion, sortKey, sortDirection),
    [retiradosConContribucion, sortKey, sortDirection],
  );
  const retiradosSinContribucionOrdenados = useMemo(
    () => ordenarMiembros(retiradosSinContribucion, sortKey, sortDirection),
    [retiradosSinContribucion, sortKey, sortDirection],
  );

  return (
    <ProjectPageShell>
      {!cargandoPermisos && !isLeader ? (
        <>
          <ProjectBackLink href={volverAlProyectoHref} label="Volver al proyecto" className="mb-card" />
          <LeaderOnlyNotice description="No puedes acceder a los miembros de este proyecto." />
        </>
      ) : (
        <>
      <ProjectPageHeader
        back={{ href: volverAlProyectoHref, label: 'Volver al proyecto' }}
        title="Miembros"
        description="Integrantes del proyecto organizados por su estado y contribución."
        actions={
          // Una sola fila: exportar a la izquierda de Postulaciones / Solicitudes de salida.
          <div data-slot="acciones-miembros" className="flex flex-wrap items-start gap-2 @3xl/project:justify-end">
            <ProjectExportButtons idProyecto={idProyecto} />
            <PendingPostulationsCard idProyecto={idProyecto} />
            <PendingExitRequestsCard idProyecto={idProyecto} />
          </div>
        }
      >
        {lider && (
          <p className="type-body mt-micro text-text-secondary">
            Líder: <span className="font-medium text-text-primary">{lider.nombre} {lider.apellido}</span>
          </p>
        )}
      </ProjectPageHeader>

      {isExitRequestsError && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/25 bg-error-container/20 px-4 py-3 text-sm text-on-surface"
        >
          <span>No fue posible verificar solicitudes de salida pendientes de los integrantes.</span>
          <button
            type="button"
            onClick={() => refetchExitRequests()}
            className="inline-flex items-center justify-center rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        <MetricTile
          icon={Users}
          label="Integrantes activos"
          value={String(activos.length)}
          isLoading={isLoading}
        />
        <MetricTile
          icon={ListTodo}
          label="Tareas activas"
          value={String(tareasActivas)}
          isLoading={isLoading}
        />
        <MetricTile
          icon={CheckCircle2}
          label="Tareas completadas"
          value={String(tareasCompletadas)}
          isLoading={isLoading}
        />
        <MetricTile
          icon={Clock}
          label="Horas reconocidas"
          value={`${formatHoras(horasReconocidas)} h`}
          isLoading={isLoading}
        />
      </div>


      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No fue posible cargar los integrantes.</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      ) : isLoading ? (
        <div className={DATA_TABLE_CARD}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  {COLUMNAS_ORDENABLES.map((columna) => (
                    <TableHead key={columna.key} scope="col" className={TH}>
                      {columna.label}
                    </TableHead>
                  ))}
                  <TableHead scope="col" className={TH}>
                    Detalle
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRows />
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <MembersGroupSection
            groupId="activos"
            icon={Users}
            title="Miembros activos"
            description="Integrantes activos del proyecto, sus roles y su carga de trabajo actual."
            emptyTitle="Aún no hay integrantes activos en este proyecto."
            emptyDescription="Cuando alguien se una al equipo, aparecerá aquí junto con sus roles y su carga de trabajo."
            miembros={activosOrdenados}
            idProyecto={idProyecto}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            pendingExitRequests={pendingExitRequests}
          />
          <MembersGroupSection
            groupId="retirados-con-contribucion"
            icon={UserCheck}
            title="Retirados con contribución"
            description="Integrantes que ya no están activos, pero que cuentan con contribución reconocida."
            emptyTitle="Aún no hay integrantes retirados con contribución en este proyecto."
            emptyDescription="Cuando un integrante retirado cuente con contribución reconocida, aparecerá aquí junto con sus roles y sus horas."
            miembros={retiradosConContribucionOrdenados}
            idProyecto={idProyecto}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            pendingExitRequests={pendingExitRequests}
          />
          <MembersGroupSection
            groupId="retirados-sin-contribucion"
            icon={UserMinus}
            title="Retirados sin contribución"
            description="Integrantes que ya no están activos y no cuentan con contribución reconocida."
            emptyTitle="Aún no hay integrantes retirados sin contribución en este proyecto."
            emptyDescription="Cuando un integrante se retire sin contribución reconocida, aparecerá aquí."
            miembros={retiradosSinContribucionOrdenados}
            idProyecto={idProyecto}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            pendingExitRequests={pendingExitRequests}
          />
        </div>
      )}
        </>
      )}
    </ProjectPageShell>
  );
}
