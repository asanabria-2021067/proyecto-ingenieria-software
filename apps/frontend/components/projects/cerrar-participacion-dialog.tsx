'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { cerrarParticipacion, getDesgloseHoras } from '@/lib/services/horas';
import { projectMembersQueryKey } from '@/lib/query-keys/members';
import { getApiErrorMessage } from '@/components/projects/api-error';

interface CerrarParticipacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idParticipacion: number;
  nombreCompleto: string;
}

/**
 * Componente reutilizable de cierre de participación, sin conectar todavía
 * a ninguna vista. Se conectará a la vista moderna de miembros cuando
 * HU-123 esté disponible.
 */
export function CerrarParticipacionDialog({
  open,
  onOpenChange,
  idProyecto,
  idParticipacion,
  nombreCompleto,
}: CerrarParticipacionDialogProps) {
  const queryClient = useQueryClient();
  const [ajustar, setAjustar] = useState(false);
  const [horasAjustadas, setHorasAjustadas] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const desglose = useQuery({
    queryKey: ['horas-desglose', idProyecto, idParticipacion],
    queryFn: () => getDesgloseHoras(idProyecto, idParticipacion),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setAjustar(false);
      setHorasAjustadas('');
      setJustificacion('');
      setError(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      cerrarParticipacion(idProyecto, idParticipacion, {
        horasReconocidas: ajustar ? Number(horasAjustadas) : undefined,
        justificacion: ajustar ? justificacion : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(idProyecto) });
      onOpenChange(false);
    },
    onError: (e) => setError(getApiErrorMessage(e, 'horas')),
  });

  const handleConfirmar = () => {
    setError(null);
    if (ajustar && justificacion.trim().length < 10) {
      setError('La justificación debe tener al menos 10 caracteres.');
      return;
    }
    if (ajustar && horasAjustadas === '') {
      setError('Indica el número de horas reconocidas.');
      return;
    }
    mutation.mutate();
  };

  const horasCalculadas = desglose.data?.horasCalculadas ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar participación de {nombreCompleto}</DialogTitle>
          <DialogDescription>
            Cerrar no elimina a la persona del proyecto: su historial de tareas, comentarios y
            evidencias se conserva. La participación pasa a estado Completado.
          </DialogDescription>
        </DialogHeader>

        {desglose.isLoading && (
          <div className="flex items-center justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        )}

        {desglose.isError && (
          <p className="text-sm text-error">No se pudo cargar el desglose de horas.</p>
        )}

        {desglose.data && (
          <div className="space-y-4">
            <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
              <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-2">
                Horas calculadas (tareas completadas)
              </p>
              <p className="text-2xl font-bold text-on-surface mb-2">{horasCalculadas} h</p>
              {desglose.data.tareas.length > 0 ? (
                <ul className="space-y-1 text-sm text-tertiary">
                  {desglose.data.tareas.map((t) => (
                    <li key={t.idTarea} className="flex justify-between gap-2">
                      <span className="truncate">{t.tituloTarea}</span>
                      <span className="shrink-0">{t.horas} h</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-tertiary">
                  No hay tareas completadas asignadas a esta persona.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={ajustar}
                onChange={(e) => setAjustar(e.target.checked)}
                className="h-4 w-4"
              />
              Ajustar el valor final (requiere justificación)
            </label>

            {ajustar && (
              <div className="space-y-3 rounded-xl border border-outline-variant p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="horas-ajustadas">Horas reconocidas</Label>
                  <Input
                    id="horas-ajustadas"
                    type="number"
                    min={0}
                    step="0.01"
                    value={horasAjustadas}
                    onChange={(e) => setHorasAjustadas(e.target.value)}
                    placeholder={String(horasCalculadas)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="justificacion-ajuste">Justificación</Label>
                  <Textarea
                    id="justificacion-ajuste"
                    value={justificacion}
                    onChange={(e) => setJustificacion(e.target.value)}
                    placeholder="Explica por qué el valor final difiere de las horas calculadas..."
                    rows={3}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-error">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={mutation.isPending || desglose.isLoading || !desglose.data}
          >
            {mutation.isPending && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            Confirmar cierre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
