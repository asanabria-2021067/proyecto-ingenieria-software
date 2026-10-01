'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Bell, ChevronsUpDown, LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserMenuUser {
  nombre: string;
  apellido: string;
  correo: string;
  fotoUrl?: string | null;
}

interface UserMenuProps {
  user: UserMenuUser | null | undefined;
  onLogout: () => void;
  /** `sidebar`: bloque completo (avatar + nombre + correo), usado en el pie del sidebar de escritorio.
   *  `compact`: solo el avatar, usado en la barra inferior móvil. */
  variant?: 'sidebar' | 'compact';
  /** `admin`: usa los tokens `--admin-*` para calzar con el sidebar oscuro de AdminLayout. */
  theme?: 'default' | 'admin';
}

function UserAvatar({ user, theme }: { user: UserMenuUser | null | undefined; theme: 'default' | 'admin' }) {
  if (user?.fotoUrl) {
    return (
      <Image
        src={user.fotoUrl}
        alt=""
        width={32}
        height={32}
        className={`h-8 w-8 shrink-0 rounded-full object-cover ${theme === 'admin' ? 'admin-account-photo' : ''}`}
      />
    );
  }
  const initials = user ? `${user.nombre[0] ?? ''}${user.apellido[0] ?? ''}` : '?';
  return (
    <div
      className={
        theme === 'admin'
          ? 'admin-account-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold'
          : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-accent text-meta font-medium text-on-accent'
      }
    >
      {initials}
    </div>
  );
}

function UserMenuContent({
  user,
  onLogout,
}: {
  user: UserMenuUser | null | undefined;
  onLogout: () => void;
}) {
  return (
    <DropdownMenuContent align="end" side="top" className="w-56">
      {user && (
        <>
          <DropdownMenuLabel className="font-normal">
            <p className="type-body truncate font-medium text-text-primary">
              {user.nombre} {user.apellido}
            </p>
            <p className="type-meta truncate">{user.correo}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem asChild className="cursor-pointer">
        <Link href="/dashboard/perfil">
          <User className="size-4" aria-hidden="true" />
          Perfil
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="cursor-pointer">
        <Link href="/dashboard/notificaciones">
          <Bell className="size-4" aria-hidden="true" />
          Notificaciones
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="cursor-pointer"
        onSelect={(event) => {
          event.preventDefault();
          onLogout();
        }}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Cerrar sesión
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Dropdown de cuenta: Perfil, Notificaciones y Cerrar sesión detrás de un solo trigger
 *  (avatar/nombre del usuario), reutilizado por DashboardLayout y AdminLayout tanto en
 *  el pie del sidebar de escritorio como en la barra inferior móvil. */
export function UserMenu({ user, onLogout, variant = 'sidebar', theme = 'default' }: UserMenuProps) {
  const isAdmin = theme === 'admin';

  if (variant === 'compact') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-slot="account-compact-trigger"
            aria-label={user ? `Cuenta de ${user.nombre} ${user.apellido}` : 'Cuenta'}
            // Vive en la barra inferior móvil, que es clara también para el
            // administrador: hover y foco de superficie clara; el avatar
            // conserva el verde institucional del tema admin.
            className="flex h-12 w-12 items-center justify-center rounded-control outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <UserAvatar user={user} theme={theme} />
          </button>
        </DropdownMenuTrigger>
        <UserMenuContent user={user} onLogout={onLogout} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            isAdmin
              ? 'admin-account-trigger flex w-full items-center gap-3 rounded-control px-3 py-2 text-left outline-none transition-colors'
              : 'flex w-full items-center gap-inline rounded-control px-inline py-tight text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30'
          }
        >
          <UserAvatar user={user} theme={theme} />
          {user && (
            <div className="min-w-0 flex-1">
              <p className={isAdmin ? 'admin-account-name truncate text-sm font-semibold' : 'type-body truncate font-medium text-text-primary'}>
                {user.nombre} {user.apellido}
              </p>
              <p className={isAdmin ? 'admin-account-email truncate text-xs' : 'type-meta truncate'}>
                {user.correo}
              </p>
            </div>
          )}
          <ChevronsUpDown
            className={isAdmin ? 'admin-account-chevron size-4 shrink-0' : 'size-4 shrink-0 text-tertiary'}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <UserMenuContent user={user} onLogout={onLogout} />
    </DropdownMenu>
  );
}
