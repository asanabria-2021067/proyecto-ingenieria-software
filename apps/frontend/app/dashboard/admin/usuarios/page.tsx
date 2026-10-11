'use client';

import { useState, useCallback } from 'react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { X, AlertCircle, Eye, SearchX, Users } from 'lucide-react';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
  DataTablePager,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { UserDetailSheet } from '@/components/admin/UserDetailSheet';
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import uvgSwal from '@/lib/swal';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  listAdminUsers,
  updateAdminUserStatus,
  type AdminUserRow,
  type AdminUserStatus,
  type ListAdminUsersParams,
} from '@/lib/services/admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROL_LABELS: Record<string, string> = {
  estudiante: 'Estudiante',
  mentor: 'Mentor',
  lider_asociacion: 'Líder de asociación',
  coordinador_academico: 'Coordinador académico',
  administrador: 'Administrador',
};

function formatRol(rol: string): string {
  return ROL_LABELS[rol] ?? rol;
}

function formatFecha(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return 'Sin fecha';
  }
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (n + a).toUpperCase() || 'U';
}

function isAdmin(user: AdminUserRow): boolean {
  return user.roles.some((r) => r.toLowerCase() === 'administrador');
}

const LIMIT = 10;

// Misma tabla que las bandejas de Proyectos Activos y Cerrados (`data-table`).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-middle';
// Columnas que solo caben desde cierto ancho de la tarjeta; antes van como metadata bajo el nombre.
const COL_CORREO = '@3xl/bandeja:table-cell';
const META_CORREO = '@3xl/bandeja:hidden';
const COL_ROL = '@xl/bandeja:table-cell';
const META_ROL = '@xl/bandeja:hidden';
const COL_FECHA = '@5xl/bandeja:table-cell';

// ─── Confirm action state ─────────────────────────────────────────────────────

interface PendingAction {
  userId: number | string;
  userName: string;
  nuevoEstado: AdminUserStatus;
  title: string;
  description: string;
  actionLabel: string;
  variant: 'destructive' | 'warning' | 'default';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TablaSkeleton() {
  return (
    <div className={DATA_TABLE_CARD} role="status" aria-label="Cargando usuarios">
      <div className={`${DATA_TABLE_HEAD_ROW} px-stack py-tight`}>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-outline-variant/50">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-stack px-stack py-inline">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-tight">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-tag" />
            <Skeleton className="h-8 w-24 rounded-tag" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User row actions ─────────────────────────────────────────────────────────

function UserActions({
  user,
  onViewProfile,
}: {
  user: AdminUserRow;
  onViewProfile: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onViewProfile(user.idUsuario)}
        className="flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-tag bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary"
        aria-label={`Ver perfil de ${user.nombre} ${user.apellido}`}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        {/* En tarjetas estrechas queda solo el icono: el nombre accesible ya lo dice. */}
        <span className="hidden @xl/bandeja:inline">Ver perfil</span>
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminUsuariosPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [search, setSearch] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);

  // Pending confirmation
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleViewProfile = useCallback((id: number) => {
    setSelectedUserId(id);
    setDetailOpen(true);
  }, []);

  const queryParams: ListAdminUsersParams = {
    page,
    limit: LIMIT,
    ...(search ? { search } : {}),
    ...(rol ? { rol } : {}),
    ...(estado ? { estado: estado as AdminUserStatus } : {}),
    ...(year ? { year } : {}),
  };

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['adminUsers', queryParams],
    queryFn: () => listAdminUsers(queryParams),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, nuevoEstado }: { id: number | string; nuevoEstado: AdminUserStatus }) =>
      updateAdminUserStatus(id, nuevoEstado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      uvgSwal.fire({
        icon: 'success',
        title: 'Estado actualizado',
        text: 'El estado del usuario fue actualizado correctamente.',
        timer: 2000,
        showConfirmButton: false,
      });
      setPendingAction(null);
    },
    onError: (error: Error) => {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: getApiErrorMessage(error, 'admin', 'No se pudo actualizar el estado del usuario.'),
      });
      setPendingAction(null);
    },
  });

  const handleFilterChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ) => {
    setter(value);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setRol('');
    setEstado('');
    setYear('');
    setPage(1);
  };

  const usuarios = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hayFiltros = Boolean(search || rol || estado || year);

  return (
    <>
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
        <AdminBreadcrumb seccion="Usuarios" pagina="Gestión de Usuarios" />
        {/* Header */}
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="type-display text-balance">
              Gestión de Usuarios
            </h1>
            <p className="mt-2 max-w-2xl text-base text-tertiary">
              Consulta usuarios registrados, revisa su estado y administra accesos básicos.
            </p>
          </div>
        </section>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Search */}
          <DashboardSearchField
            containerClassName="flex-1 min-w-50"
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar por nombre o correo institucional…"
          />

          {/* Rol */}
          <Select
            value={rol || '__all__'}
            onValueChange={(v) => handleFilterChange(setRol, v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-48 py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30">
              <SelectValue placeholder="Todos los roles" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__all__" className="focus:bg-primary focus:text-on-primary">Todos los roles</SelectItem>
              <SelectItem value="estudiante" className="focus:bg-primary focus:text-on-primary">Estudiante</SelectItem>
              <SelectItem value="mentor" className="focus:bg-primary focus:text-on-primary">Mentor</SelectItem>
              <SelectItem value="lider_asociacion" className="focus:bg-primary focus:text-on-primary">Líder de asociación</SelectItem>
              <SelectItem value="coordinador_academico" className="focus:bg-primary focus:text-on-primary">Coordinador académico</SelectItem>
              <SelectItem value="administrador" className="focus:bg-primary focus:text-on-primary">Administrador</SelectItem>
            </SelectContent>
          </Select>

          {/* Estado */}
          <Select
            value={estado || '__all__'}
            onValueChange={(v) => handleFilterChange(setEstado, v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-44 py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__all__" className="focus:bg-primary focus:text-on-primary">Todos los estados</SelectItem>
              <SelectItem value="ACTIVO" className="focus:bg-primary focus:text-on-primary">Activo</SelectItem>
              <SelectItem value="INACTIVO" className="focus:bg-primary focus:text-on-primary">Inactivo</SelectItem>
              <SelectItem value="BLOQUEADO" className="focus:bg-primary focus:text-on-primary">Bloqueado</SelectItem>
            </SelectContent>
          </Select>

          {/* Año */}
          <Select
            value={year || '__all__'}
            onValueChange={(v) => handleFilterChange(setYear, v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-40 py-2.5 h-auto rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface text-sm focus:ring-2 focus:ring-primary focus-visible:ring-primary/30">
              <SelectValue placeholder="Todos los años" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__all__" className="focus:bg-primary focus:text-on-primary">Todos los años</SelectItem>
              <SelectItem value="2026" className="focus:bg-primary focus:text-on-primary">2026</SelectItem>
              <SelectItem value="2025" className="focus:bg-primary focus:text-on-primary">2025</SelectItem>
              <SelectItem value="2024" className="focus:bg-primary focus:text-on-primary">2024</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear */}
          {(search || rol || estado || year) && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-tertiary hover:bg-surface-container-high transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="@container/bandeja flex flex-col gap-stack">
          {!isLoading && !isError && (
            <p className="type-body text-text-secondary" role="status" aria-live="polite">
              {hayFiltros ? 'Usuarios encontrados: ' : 'Total de usuarios: '}
              <span className="font-semibold tabular-nums text-text-primary">{total}</span>
              {totalPages > 1 && <> · página {page} de {totalPages}</>}
            </p>
          )}

          {isError ? (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No se pudieron cargar los usuarios.</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                  Reintentar
                </Button>
              </EmptyContent>
            </Empty>
          ) : isLoading ? (
            <TablaSkeleton />
          ) : usuarios.length === 0 ? (
            <Empty tone={hayFiltros ? undefined : 'muted'} role="status">
              <EmptyMedia variant="icon">
                {hayFiltros ? <SearchX aria-hidden="true" className="size-7" /> : <Users aria-hidden="true" className="size-7" />}
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {hayFiltros ? 'No se encontraron usuarios con los filtros seleccionados.' : 'No hay usuarios registrados.'}
                </EmptyTitle>
                {hayFiltros && <EmptyDescription>Prueba con otro texto o quita algún filtro.</EmptyDescription>}
              </EmptyHeader>
              {hayFiltros && (
                <EmptyContent>
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <>
              <div className={DATA_TABLE_CARD}>
                <Table>
                  <TableHeader>
                    <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                      <TableHead scope="col" className={TH}>
                        Usuario
                      </TableHead>
                      <TableHead scope="col" className={`${TH} hidden ${COL_CORREO}`}>
                        Correo institucional
                      </TableHead>
                      <TableHead scope="col" className={`${TH} hidden ${COL_ROL}`}>
                        Rol
                      </TableHead>
                      <TableHead scope="col" className={TH}>
                        Estado
                      </TableHead>
                      <TableHead scope="col" className={`${TH} hidden ${COL_FECHA}`}>
                        Fecha de registro
                      </TableHead>
                      <TableHead scope="col" className={`${TH} text-right`}>
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((user) => {
                      const rolPrincipal = user.roles[0] ?? '';
                      const extras = user.roles.length > 1 ? user.roles.length - 1 : 0;

                      return (
                        <TableRow key={user.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                          {/* Usuario */}
                          <TableCell className={`${TD} min-w-0`}>
                            <div className="flex min-w-0 items-center gap-tight">
                              <div className="size-8 shrink-0 overflow-hidden rounded-full border border-outline-variant/30">
                                {user.fotoUrl ? (
                                  <Image
                                    src={user.fotoUrl}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-primary/10 text-[10px] font-bold text-primary">
                                    {getInitials(user.nombre, user.apellido)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="type-body break-words font-semibold text-text-primary">
                                  {user.nombre} {user.apellido}
                                </p>
                                <p className={`type-meta break-all ${META_CORREO}`}>{user.correo}</p>
                                <p className={`type-meta ${META_ROL}`}>
                                  {formatRol(rolPrincipal)}
                                  {extras > 0 && <> +{extras}</>}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          {/* Correo */}
                          <TableCell className={`${TD} hidden ${COL_CORREO}`}>
                            <span className="type-body break-all text-text-secondary">{user.correo}</span>
                          </TableCell>

                          {/* Rol */}
                          <TableCell className={`${TD} hidden ${COL_ROL}`}>
                            <div className="flex items-center gap-tight">
                              <span className="type-body text-text-primary">{formatRol(rolPrincipal)}</span>
                              {extras > 0 && <span className="pill pill-sm pill-neutral tabular-nums">+{extras}</span>}
                            </div>
                          </TableCell>

                          {/* Estado */}
                          <TableCell className={TD}>
                            <UserStatusBadge estado={user.estado} />
                          </TableCell>

                          {/* Fecha */}
                          <TableCell className={`${TD} hidden ${COL_FECHA}`}>
                            <span className="type-body whitespace-nowrap text-text-secondary">{formatFecha(user.fechaCreacion)}</span>
                          </TableCell>

                          {/* Acciones */}
                          <TableCell className={`${TD} text-right`}>
                            <UserActions user={user} onViewProfile={handleViewProfile} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <DataTablePager label="Paginación de usuarios" pagina={page} totalPaginas={totalPages} onPagina={setPage} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {pendingAction && (
        <ConfirmActionDialog
          open={true}
          title={pendingAction.title}
          description={pendingAction.description}
          actionLabel={pendingAction.actionLabel}
          variant={pendingAction.variant}
          isPending={statusMutation.isPending}
          onConfirm={() =>
            statusMutation.mutate({
              id: pendingAction.userId,
              nuevoEstado: pendingAction.nuevoEstado,
            })
          }
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* User detail drawer */}
      <UserDetailSheet
        userId={selectedUserId}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setSelectedUserId(null);
        }}
        onStatusChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
        }}
      />
    </>
  );
}
