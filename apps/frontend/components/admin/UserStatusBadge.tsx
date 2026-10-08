import type { AdminUserStatus } from '@/lib/services/admin';

const statusConfig: Record<
  AdminUserStatus,
  { label: string; classes: string }
> = {
  ACTIVO: {
    label: 'Activo',
    classes: 'pill-success',
  },
  INACTIVO: {
    label: 'Inactivo',
    classes: 'pill-neutral',
  },
  BLOQUEADO: {
    label: 'Bloqueado',
    classes: 'pill-error',
  },
  PENDIENTE_VERIFICACION: {
    label: 'Pendiente',
    classes: 'bg-surface-container-high text-on-surface',
  },
};

export function UserStatusBadge({ estado }: { estado: AdminUserStatus }) {
  const config = statusConfig[estado] ?? {
    label: estado,
    classes: 'pill-neutral',
  };
  return (
    <span
      className={`pill whitespace-nowrap ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
