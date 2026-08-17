'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListTodo,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { useProjectTeam } from '@/hooks/use-project-team';
import { useProjectPendingExitRequests } from '@/hooks/use-exit-request';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ExitRequestActions, ExitRequestBadge } from '@/components/projects/member-exit-request-actions';

const COLUMNAS_ORDENABLES: { key: MiembroSortKey; label: string }[] = [
  { key: 'nombre', label: 'Integrante' },
  { key: 'roles', label: 'Roles' },
  { key: 'estado', label: 'Estado' },
  { key: 'tareasActivas', label: 'Tareas activas' },
  { key: 'horasReconocidas', label: 'Horas reconocidas' },
];

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
        <TableRow key={i} className="border-outline-variant/40">
          <TableCell className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-surface-container-high" />
              <Skeleton className="h-4 w-32 rounded bg-surface-container-high" />
            </div>
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-28 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-5 w-16 rounded-full bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-10 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-14 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-16 rounded bg-surface-container-high" />
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
      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary whitespace-nowrap"
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex items-center gap-1 hover:text-on-surface transition-colors"
      >
        {label}
        <Icon aria-hidden="true" className={`h-3 w-3 ${isActive ? 'text-primary' : 'text-tertiary/60'}`} />
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
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 flex items-center gap-3">
      <div className="flex items-center justify-center size-11 rounded-xl bg-primary/10 shrink-0">
        <Icon aria-hidden className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-tertiary uppercase tracking-wide">{label}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-12 rounded mt-1 bg-surface-container-high" />
        ) : (
          <p className="text-2xl font-headline font-extrabold text-on-surface">{value}</p>
        )}
      </div>
    </div>
  );
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
    <TableRow className="border-outline-variant/40 hover:bg-surface-container-low transition-colors">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {miembro.fotoUrl && <AvatarImage src={miembro.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary-container text-xs font-bold text-on-primary-container">
              {getInitials(miembro.nombre, miembro.apellido)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-on-surface whitespace-nowrap">{nombreCompleto}</span>
            <ExitRequestBadge request={exitRequest} />
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {miembro.roles.map((rol) => (
            <span
              key={rol.idRolProyecto}
              className="inline-flex items-center rounded-full bg-secondary-container/30 px-2 py-0.5 text-xs font-bold text-secondary"
            >
              {rol.nombreRol}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${estilo.className}`}
        >
          {estilo.label}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="text-sm text-on-surface">{miembro.tareasActivas}</span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="text-sm text-on-surface whitespace-nowrap">{formatHoras(miembro.horasReconocidas)} h</span>
      </TableCell>
      <TableCell className="px-4 py-3">
        {exitRequest ? (
          <ExitRequestActions request={exitRequest} idProyecto={idProyecto} nombreCompleto={nombreCompleto} />
        ) : (
          <Link
            href={`/dashboard/proyectos/${idProyecto}/equipo/${miembro.idUsuario}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline whitespace-nowrap"
          >
            Ver detalle
            <ChevronRight className="w-3.5 h-3.5" />
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
      <div className="flex items-center gap-2 mb-1">
        <Icon aria-hidden className="w-5 h-5 text-primary" />
        <h2 id={headingId} className="font-headline font-extrabold text-xl text-on-surface">
          {title}
        </h2>
      </div>
      <p className="text-tertiary text-sm mb-4">{description}</p>

      {miembros.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Icon aria-hidden className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
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
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary whitespace-nowrap">
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
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={`/dashboard/proyectos/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al proyecto
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface">Miembros</h1>
          </div>
          <p className="text-tertiary text-sm">
            Integrantes del proyecto organizados por su estado y contribución.
          </p>
          {lider && (
            <p className="text-tertiary text-sm mt-1">
              Líder: <span className="font-medium text-on-surface">{lider.nombre} {lider.apellido}</span>
            </p>
          )}
        </div>

        <PendingPostulationsCard idProyecto={idProyecto} />
      </div>

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
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
            >
              Reintentar
            </button>
          </EmptyContent>
        </Empty>
      ) : isLoading ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                  {COLUMNAS_ORDENABLES.map((columna) => (
                    <TableHead
                      key={columna.key}
                      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary whitespace-nowrap"
                    >
                      {columna.label}
                    </TableHead>
                  ))}
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary whitespace-nowrap">
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
    </div>
  );
}
