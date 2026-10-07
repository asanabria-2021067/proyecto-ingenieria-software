'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso, confirmar } from '@/lib/mensajes';
import { deleteEvent, type EventoProyectoDTO } from '@/lib/services/events';

type EventoCancelable = Pick<EventoProyectoDTO, 'idEvento' | 'idProyecto' | 'tituloEvento'>;

/**
 * HU-184 (T-323/T-324): eliminar un evento del calendario con la
 * confirmación y los avisos del módulo común (lib/mensajes.ts). Lo comparten
 * el diálogo de edición y el panel de detalle para que ambos pregunten y
 * avisen igual.
 */
export function useCancelEvent() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (evento: EventoCancelable) => deleteEvent(evento.idProyecto, evento.idEvento),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mis-eventos'] });
    },
  });

  /** Resuelve true solo si el evento quedó eliminado (soft delete en el backend). */
  const cancelarEvento = async (evento: EventoCancelable): Promise<boolean> => {
    const ok = await confirmar({
      titulo: `¿Eliminar el evento «${evento.tituloEvento}»?`,
      descripcion: 'Sale del calendario del proyecto y los participantes ya no lo verán.',
      textoAccion: 'Eliminar evento',
      destructiva: true,
    });
    if (!ok) return false;

    try {
      await mutation.mutateAsync(evento);
      aviso.exito('Evento eliminado');
      return true;
    } catch (err) {
      aviso.error('No se pudo eliminar el evento', getApiErrorMessage(err, 'calendar'));
      return false;
    }
  };

  return { cancelarEvento, isPending: mutation.isPending };
}
