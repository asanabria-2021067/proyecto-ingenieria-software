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
  Users,
} from 'lucide-react';
import { useProjectTeam } from '@/hooks/use-project-team';
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
import type { MiembroProyectoResumenDTO } from '@/lib/dto/member.dto';

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

function MiembroRow({ miembro, idProyecto }: { miembro: MiembroProyectoResumenDTO; idProyecto: number }) {
  const estilo = ESTADO_PARTICIPACION_STYLE[miembro.estadoParticipacion];

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
          <span className="text-sm font-medium text-on-surface whitespace-nowrap">
            {miembro.nombre} {miembro.apellido}
          </span>
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
        <Link
          href={`/dashboard/proyectos/${idProyecto}/equipo/${miembro.idUsuario}`}
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline whitespace-nowrap"
        >
          Ver detalle
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

export default function MiembrosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { lider, miembros, isLoading, isError, refetch } = useProjectTeam(idProyecto);

  const integrantesActivos = miembros.length;
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

  const miembrosOrdenados = useMemo(
    () => ordenarMiembros(miembros, sortKey, sortDirection),
    [miembros, sortKey, sortDirection],
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

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="font-headline font-extrabold text-3xl text-on-surface">Miembros</h1>
        </div>
        <p className="text-tertiary text-sm">
          Integrantes activos del proyecto, sus roles y su carga de trabajo actual.
        </p>
        {lider && (
          <p className="text-tertiary text-sm mt-1">
            Líder: <span className="font-medium text-on-surface">{lider.nombre} {lider.apellido}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        <MetricTile
          icon={Users}
          label="Integrantes activos"
          value={String(integrantesActivos)}
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
      ) : !isLoading && miembros.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Users aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay integrantes en este proyecto.</EmptyTitle>
            <EmptyDescription>
              Cuando alguien se una al equipo, aparecerá aquí junto con sus roles y su carga de trabajo.
            </EmptyDescription>
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
                      onSort={handleSort}
                    />
                  ))}
                  <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary whitespace-nowrap">
                    Detalle
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <SkeletonRows />
                ) : (
                  miembrosOrdenados.map((miembro) => (
                    <MiembroRow key={miembro.idUsuario} miembro={miembro} idProyecto={idProyecto} />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
