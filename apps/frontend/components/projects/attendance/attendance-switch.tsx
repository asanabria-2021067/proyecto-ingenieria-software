'use client';

import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/components/projects/api-error';
import type { useProjectAttendanceMutations } from '@/hooks/use-project-attendance';
import type { IntegranteAsistencia } from '@/lib/types/attendance';

type AttendanceMutations = ReturnType<typeof useProjectAttendanceMutations>;

export interface AttendanceSwitchProps {
  idActividad: number;
  integrante: IntegranteAsistencia;
  marcarAsistencia: AttendanceMutations['marcarAsistencia'];
}

/**
 * T-297 (HU-177): switch «Asistió» de un integrante dentro del detalle de
 * una actividad. El optimismo (actualizar antes de que responda el PATCH)
 * y la reversión en error viven en `useProjectAttendanceMutations`
 * (onMutate/onError sobre la caché de detalle); este componente solo
 * dispara la mutación y avisa con un toast cuando falla.
 */
export function AttendanceSwitch({ idActividad, integrante, marcarAsistencia }: AttendanceSwitchProps) {
  const handleChange = (asistio: boolean) => {
    marcarAsistencia.mutate(
      { idActividad, idUsuario: integrante.idUsuario, input: { asistio } },
      {
        onError: (error) => {
          toast.error('No se pudo actualizar la asistencia', {
            description: getApiErrorMessage(error, 'task'),
          });
        },
      },
    );
  };

  return (
    <Switch
      checked={integrante.asistio}
      onCheckedChange={handleChange}
      disabled={marcarAsistencia.isPending}
      aria-label={`Asistió ${integrante.nombre} ${integrante.apellido}`}
    />
  );
}
