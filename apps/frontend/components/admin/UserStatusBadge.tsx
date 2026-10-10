import { Tag, type TagTone } from '@/components/ui/tag';
import type { AdminUserStatus } from '@/lib/services/admin';

const statusConfig: Record<AdminUserStatus, { label: string; tone: TagTone }> = {
  ACTIVO: { label: 'Activo', tone: 'success' },
  INACTIVO: { label: 'Inactivo', tone: 'neutral' },
  BLOQUEADO: { label: 'Bloqueado', tone: 'red' },
  PENDIENTE_VERIFICACION: { label: 'Pendiente', tone: 'neutral' },
};

export function UserStatusBadge({ estado }: { estado: AdminUserStatus }) {
  const config = statusConfig[estado] ?? { label: estado, tone: 'neutral' as const };
  return <Tag tone={config.tone}>{config.label}</Tag>;
}
