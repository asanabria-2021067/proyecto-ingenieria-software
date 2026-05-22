'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import {
  RefreshCw,
  Search,
  X,
  AlertCircle,
  MoreHorizontal,
  UserCheck,
  UserX,
  ShieldOff,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import uvgSwal from '@/lib/swal';
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

// ─── Skeleton rows ────────────────────────────────────────────────────────────

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
            <Skeleton className="h-4 w-44 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-24 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-5 w-16 rounded-full bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-28 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-8 w-20 rounded-lg bg-surface-container-high" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── User row actions ─────────────────────────────────────────────────────────

function UserActions({
  user,
  onViewProfile,
  onChangeStatus,
}: {
  user: AdminUserRow;
  onViewProfile: (id: number) => void;
  onChangeStatus: (action: PendingAction) => void;
}) {
  const userName = `${user.nombre} ${user.apellido}`;

  const triggerAction = (nuevoEstado: AdminUserStatus) => {
    const configs: Record<AdminUserStatus, Omit<PendingAction, 'userId' | 'userName' | 'nuevoEstado'>> = {
      INACTIVO: {
        title: 'Desactivar usuario',
        description: `¿Deseas desactivar a ${userName}? El usuario perderá acceso activo a la plataforma.`,
        actionLabel: 'Desactivar',
        variant: 'warning',
      },
      BLOQUEADO: {
        title: 'Bloquear usuario',
        description: `¿Deseas bloquear a ${userName}? El usuario no podrá iniciar sesión.`,
        actionLabel: 'Bloquear',
        variant: 'destructive',
      },
      ACTIVO: {
        title: user.estado === 'BLOQUEADO' ? 'Desbloquear usuario' : 'Activar usuario',
        description:
          user.estado === 'BLOQUEADO'
            ? `¿Deseas desbloquear a ${userName}? Recuperará acceso normal.`
            : `¿Deseas activar a ${userName}? Recuperará acceso a la plataforma.`,
        actionLabel: user.estado === 'BLOQUEADO' ? 'Desbloquear' : 'Activar',
        variant: 'default',
      },
    };
    onChangeStatus({
      userId: user.idUsuario,
      userName,
      nuevoEstado,
      ...configs[nuevoEstado],
    });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Ver perfil — preparado para Tarea 7 */}
      <button
        onClick={() => onViewProfile(user.idUsuario)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
        title="Ver perfil"
      >
        <Eye className="h-3.5 w-3.5" />
        Ver perfil
      </button>

      {!isAdmin(user) && (
        <>
          {user.estado === 'ACTIVO' && (
            <>
              <button
                onClick={() => triggerAction('INACTIVO')}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-tertiary hover:bg-surface-container-high transition-colors"
                title="Desactivar"
              >
                <UserX className="h-3.5 w-3.5" />
                Desactivar
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface-container-high transition-colors"
                    title="Más acciones"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface"
                >
                  <DropdownMenuItem
                    onClick={() => triggerAction('BLOQUEADO')}
                    className="text-error focus:bg-error/10 focus:text-error cursor-pointer"
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    Bloquear
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {user.estado === 'INACTIVO' && (
            <button
              onClick={() => triggerAction('ACTIVO')}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              title="Activar"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Activar
            </button>
          )}

          {user.estado === 'BLOQUEADO' && (
            <button
              onClick={() => triggerAction('ACTIVO')}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              title="Desbloquear"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Desbloquear
            </button>
          )}
        </>
      )}
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

  // TODO (Tarea 7): abrir drawer con este id
  const [, setSelectedUserId] = useState<number | null>(null);

  const handleViewProfile = useCallback((id: number) => {
    setSelectedUserId(id);
    // Drawer se implementará en Tarea 7
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
        text: error.message || 'No se pudo actualizar el estado del usuario.',
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

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const inicio = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const fin = Math.min(page * LIMIT, total);

  const visiblePages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <AdminLayout>
      <div className="px-4 pb-12 pt-8 md:px-8">
        {/* Header */}
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="mb-2 block text-xs font-black uppercase tracking-widest text-primary">
              Administración
            </span>
            <h1 className="font-headline text-4xl font-black tracking-tighter text-on-surface md:text-5xl">
              Gestión de Usuarios
            </h1>
            <p className="mt-2 max-w-2xl text-base text-tertiary">
              Consulta usuarios registrados, revisa su estado y administra accesos básicos.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary/90 self-start"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </section>

        {/* Filters */}
        <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Buscar por nombre o correo institucional…"
                className="w-full rounded-xl border border-outline-variant bg-surface-container-low py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-tertiary outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>

            {/* Rol */}
            <Select
              value={rol || '__all__'}
              onValueChange={(v) => handleFilterChange(setRol, v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-full sm:w-48 rounded-xl border-outline-variant bg-surface-container-low text-sm text-on-surface">
                <SelectValue placeholder="Todos los roles" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface">
                <SelectItem value="__all__">Todos los roles</SelectItem>
                <SelectItem value="estudiante">Estudiante</SelectItem>
                <SelectItem value="mentor">Mentor</SelectItem>
                <SelectItem value="lider_asociacion">Líder de asociación</SelectItem>
                <SelectItem value="coordinador_academico">Coordinador académico</SelectItem>
                <SelectItem value="administrador">Administrador</SelectItem>
              </SelectContent>
            </Select>

            {/* Estado */}
            <Select
              value={estado || '__all__'}
              onValueChange={(v) => handleFilterChange(setEstado, v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-outline-variant bg-surface-container-low text-sm text-on-surface">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface">
                <SelectItem value="__all__">Todos los estados</SelectItem>
                <SelectItem value="ACTIVO">Activo</SelectItem>
                <SelectItem value="INACTIVO">Inactivo</SelectItem>
                <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
              </SelectContent>
            </Select>

            {/* Año */}
            <Select
              value={year || '__all__'}
              onValueChange={(v) => handleFilterChange(setYear, v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-full sm:w-40 rounded-xl border-outline-variant bg-surface-container-low text-sm text-on-surface">
                <SelectValue placeholder="Todos los años" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest text-on-surface">
                <SelectItem value="__all__">Todos los años</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            {(search || rol || estado || year) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-tertiary hover:bg-surface-container-high transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table card */}
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Usuario
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Correo institucional
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Rol
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Estado
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Fecha de registro
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <SkeletonRows />}

              {isError && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-6 w-6 text-error" />
                      <p className="text-sm font-medium text-on-surface">
                        No se pudieron cargar los usuarios.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && data?.data.length === 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm text-tertiary">
                      No se encontraron usuarios con los filtros seleccionados.
                    </p>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !isError &&
                data?.data.map((user) => {
                  const rolPrincipal = user.roles[0] ?? '';
                  const extras = user.roles.length > 1 ? user.roles.length - 1 : 0;

                  return (
                    <TableRow
                      key={user.idUsuario}
                      className="border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                    >
                      {/* Usuario */}
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-outline-variant/30">
                            {user.fotoUrl ? (
                              <Image
                                src={user.fotoUrl}
                                alt=""
                                width={32}
                                height={32}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-primary-container text-xs font-bold text-on-primary-container">
                                {getInitials(user.nombre, user.apellido)}
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-on-surface">
                            {user.nombre} {user.apellido}
                          </span>
                        </div>
                      </TableCell>

                      {/* Correo */}
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">{user.correo}</span>
                      </TableCell>

                      {/* Rol */}
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-on-surface">
                            {formatRol(rolPrincipal)}
                          </span>
                          {extras > 0 && (
                            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-black text-tertiary">
                              +{extras}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Estado */}
                      <TableCell className="px-4 py-3">
                        <UserStatusBadge estado={user.estado} />
                      </TableCell>

                      {/* Fecha */}
                      <TableCell className="px-4 py-3">
                        <span className="text-sm text-tertiary">
                          {formatFecha(user.fechaCreacion)}
                        </span>
                      </TableCell>

                      {/* Acciones */}
                      <TableCell className="px-4 py-3">
                        <UserActions
                          user={user}
                          onViewProfile={handleViewProfile}
                          onChangeStatus={setPendingAction}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!isLoading && !isError && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-tertiary">
              Mostrando{' '}
              <span className="font-bold text-on-surface">{inicio}–{fin}</span>{' '}
              de{' '}
              <span className="font-bold text-on-surface">{total}</span>{' '}
              usuarios
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {visiblePages.map((p, idx) => {
                const prev = visiblePages[idx - 1];
                const showEllipsis = prev !== undefined && p - prev > 1;
                return (
                  <span key={p} className="flex items-center gap-1">
                    {showEllipsis && (
                      <span className="px-1 text-xs text-tertiary">…</span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        p === page
                          ? 'bg-primary text-on-primary'
                          : 'border border-outline-variant text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                );
              })}

              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
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
    </AdminLayout>
  );
}
