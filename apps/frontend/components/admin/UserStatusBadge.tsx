import type { AdminUserStatus } from '@/lib/services/admin';

const statusConfig: Record<
  AdminUserStatus,
  { label: string; classes: string }
> = {
  ACTIVO: {
    label: 'Activo',
    classes: 'bg-primary/10 text-primary',
  },
  INACTIVO: {
    label: 'Inactivo',
    classes: 'bg-surface-container-high text-tertiary',
  },
  BLOQUEADO: {
    label: 'Bloqueado',
    classes: 'bg-error-container text-error',
  },
};

export function UserStatusBadge({ estado }: { estado: AdminUserStatus }) {
  const config = statusConfig[estado] ?? {
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
