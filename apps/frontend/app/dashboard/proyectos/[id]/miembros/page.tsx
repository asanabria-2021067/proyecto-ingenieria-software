'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Users } from 'lucide-react';
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
import { ordenarEquipo, type MiembroSortKey, type SortDirection } from '@/components/projects/member-sort.utils';
import type { ParticipacionActivaDTO } from '@/lib/dto/member.dto';

const COLUMNAS_ORDENABLES: { key: MiembroSortKey; label: string }[] = [
  { key: 'nombre', label: 'Integrante' },
  { key: 'rol', label: 'Rol' },
  { key: 'estado', label: 'Estado' },
  { key: 'tareasActivas', label: 'Tareas activas' },
  { key: 'horasRegistradas', label: 'Horas registradas' },
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
      className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary"
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

function MiembroRow({ miembro }: { miembro: ParticipacionActivaDTO }) {
  const estilo = ESTADO_PARTICIPACION_STYLE[miembro.estadoParticipacion];

  return (
    <TableRow className="border-outline-variant/40 hover:bg-surface-container-low transition-colors">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {miembro.usuario.fotoUrl && <AvatarImage src={miembro.usuario.fotoUrl} alt="" />}
            <AvatarFallback className="bg-primary-container text-xs font-bold text-on-primary-container">
              {getInitials(miembro.usuario.nombre, miembro.usuario.apellido)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-on-surface">
            {miembro.usuario.nombre} {miembro.usuario.apellido}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="text-sm text-on-surface">{miembro.rolProyecto.nombreRol}</span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${estilo.className}`}
        >
          {estilo.label}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="text-sm text-on-surface">{miembro.tareasActivas}</span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="text-sm text-on-surface">{formatHoras(miembro.horasRegistradas)} h</span>
      </TableCell>
    </TableRow>
  );
}

export default function MiembrosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const { equipo, isLoading, isError, refetch } = useProjectTeam(idProyecto);

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

  const equipoOrdenado = useMemo(
    () => ordenarEquipo(equipo, sortKey, sortDirection),
    [equipo, sortKey, sortDirection],
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
          Integrantes activos del proyecto, su rol y su carga de trabajo actual.
        </p>
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
      ) : !isLoading && equipo.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Users aria-hidden="true" className="h-7 w-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Aún no hay integrantes en este proyecto.</EmptyTitle>
            <EmptyDescription>
              Cuando alguien se una al equipo, aparecerá aquí junto con su rol y su carga de trabajo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows />
              ) : (
                equipoOrdenado.map((miembro) => <MiembroRow key={miembro.idParticipacion} miembro={miembro} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
