'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Users,
  UserCheck,
  ListChecks,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
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
  useProjectMembersAdmin,
  type EstadoParticipacion,
  type MiembroAdminDTO,
} from '@/hooks/use-project-members-admin';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import type { TareaPublicaDTO } from '@/lib/types/tasks';

const ESTADO_PARTICIPACION_CONFIG: Record<
  EstadoParticipacion,
  { label: string; classes: string }
> = {
  ACTIVO: { label: 'Activo', classes: 'bg-primary/10 text-primary' },
  RETIRADO: { label: 'Retirado', classes: 'bg-error-container text-error' },
  COMPLETADO: { label: 'Completado', classes: 'bg-surface-container-high text-tertiary' },
};

function EstadoParticipacionBadge({ estado }: { estado: EstadoParticipacion }) {
  const config = ESTADO_PARTICIPACION_CONFIG[estado] ?? {
    label: estado,
    classes: 'bg-surface-container-high text-on-surface',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (n + a).toUpperCase() || 'U';
}

function formatHoras(horas: number): string {
  return `${horas.toFixed(1)} h`;
}

/** Tareas activas por usuario = asignadas y no HECHO. */
function countActiveTasksByUser(tasks: TareaPublicaDTO[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const tarea of tasks) {
    if (tarea.estadoTarea === 'HECHO' || !tarea.asignacionActiva) continue;
    const idUsuario = tarea.asignacionActiva.idUsuario;
    counts.set(idUsuario, (counts.get(idUsuario) ?? 0) + 1);
  }
  return counts;
}

type SortKey = 'nombre' | 'rol' | 'estado' | 'tareasActivas' | 'horas';
type SortDirection = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const ESTADO_ORDEN: Record<EstadoParticipacion, number> = {
  ACTIVO: 0,
  RETIRADO: 1,
  COMPLETADO: 2,
};

function compareMembers(
  a: MiembroAdminDTO,
  b: MiembroAdminDTO,
  activeTasksByUser: Map<number, number>,
  key: SortKey,
): number {
  switch (key) {
    case 'nombre':
      return `${a.usuario.nombre} ${a.usuario.apellido}`.localeCompare(
        `${b.usuario.nombre} ${b.usuario.apellido}`,
      );
    case 'rol':
      return a.rolProyecto.nombreRol.localeCompare(b.rolProyecto.nombreRol);
    case 'estado':
      return ESTADO_ORDEN[a.estadoParticipacion] - ESTADO_ORDEN[b.estadoParticipacion];
    case 'tareasActivas':
      return (
        (activeTasksByUser.get(a.usuario.idUsuario) ?? 0) -
        (activeTasksByUser.get(b.usuario.idUsuario) ?? 0)
      );
    case 'horas':
      return a.horasRegistradas - b.horasRegistradas;
    default:
      return 0;
  }
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sort.key === sortKey;
  const Icon = isActive ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-on-surface transition-colors"
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? 'text-primary' : 'text-tertiary/60'}`} />
      </button>
    </TableHead>
  );
}

/** Mismo estilo de tarjeta que CardShell en proyectos/[id]/page.tsx. */
function MetricCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[#D3DDD3] dark:border-outline-variant bg-white dark:bg-surface-container-lowest shadow-[0_1px_4px_rgba(24,28,32,0.05)] p-4">
      <div className="flex items-center gap-2 mb-2 text-tertiary">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-14 rounded bg-surface-container-high" />
      ) : (
        <p className="font-headline text-2xl font-extrabold text-on-surface">{value}</p>
      )}
    </div>
  );
}

const COLUMN_COUNT = 5;

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
            <Skeleton className="h-4 w-16 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-10 rounded bg-surface-container-high" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function MiembrosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const { members, isLoading: membersLoading, isError: membersError } =
    useProjectMembersAdmin(idProyecto);
  const { tasks, isLoading: tasksLoading, isError: tasksError } = useProjectTasks(idProyecto);

  const isLoading = membersLoading || tasksLoading;
  const isError = membersError || tasksError;
  const activeTasksByUser = countActiveTasksByUser(tasks);

  const [sort, setSort] = useState<SortState>({ key: 'nombre', direction: 'asc' });

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const sortedMembers = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      compareMembers(a, b, activeTasksByUser, sort.key),
    );
    return sort.direction === 'asc' ? sorted : sorted.reverse();
  }, [members, activeTasksByUser, sort]);

  const integrantesActivos = members.filter((m) => m.estadoParticipacion === 'ACTIVO').length;
  const tareasAbiertas = tasks.filter((t) => t.estadoTarea !== 'HECHO').length;
  const tareasCompletadas = tasks.filter((t) => t.estadoTarea === 'HECHO').length;
  const horasAcumuladas = members.reduce((total, m) => total + m.horasRegistradas, 0);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
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
          <h1 className="font-headline font-extrabold text-3xl text-on-surface">
            Miembros del Proyecto
          </h1>
        </div>
        <p className="text-tertiary text-sm">
          Integrantes del proyecto, su rol y su estado de participación
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={UserCheck}
          label="Integrantes activos"
          value={String(integrantesActivos)}
          isLoading={isLoading}
        />
        <MetricCard
          icon={ListChecks}
          label="Tareas abiertas"
          value={String(tareasAbiertas)}
          isLoading={isLoading}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Tareas completadas"
          value={String(tareasCompletadas)}
          isLoading={isLoading}
        />
        <MetricCard
          icon={Clock}
          label="Horas acumuladas"
          value={formatHoras(horasAcumuladas)}
          isLoading={isLoading}
        />
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
              <SortableHead label="Integrante" sortKey="nombre" sort={sort} onSort={handleSort} />
              <SortableHead label="Rol" sortKey="rol" sort={sort} onSort={handleSort} />
              <SortableHead label="Estado" sortKey="estado" sort={sort} onSort={handleSort} />
              <SortableHead
                label="Tareas activas"
                sortKey="tareasActivas"
                sort={sort}
                onSort={handleSort}
              />
              <SortableHead label="Horas registradas" sortKey="horas" sort={sort} onSort={handleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows />}

            {isError && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6 text-error" />
                    <p className="text-sm font-medium text-on-surface">
                      No se pudieron cargar los miembros del proyecto.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && members.length === 0 && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-10 text-center">
                  <p className="text-sm text-tertiary">
                    Este proyecto todavía no tiene integrantes.
                  </p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              sortedMembers.map((miembro) => (
                <TableRow
                  key={miembro.idParticipacion}
                  className="border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-outline-variant/30">
                        {miembro.usuario.fotoUrl ? (
                          <Image
                            src={miembro.usuario.fotoUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-primary-container text-xs font-bold text-on-primary-container">
                            {getInitials(miembro.usuario.nombre, miembro.usuario.apellido)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-on-surface">
                        {miembro.usuario.nombre} {miembro.usuario.apellido}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-on-surface">
                      {miembro.rolProyecto.nombreRol}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <EstadoParticipacionBadge estado={miembro.estadoParticipacion} />
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-on-surface">
                      {activeTasksByUser.get(miembro.usuario.idUsuario) ?? 0}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-tertiary">
                      {formatHoras(miembro.horasRegistradas)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
