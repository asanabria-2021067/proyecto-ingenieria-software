'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { getHorasTarea, registrarHorasTarea } from '@/lib/services/task-hours';
import { projectAvanceQueryKey, projectTasksQueryKey, taskHoursQueryKey } from '@/lib/query-keys/tasks';
import type { RegistroTiempoTareaDTO } from '@/lib/types/tasks';

export interface TaskHoursPanelProps {
  idProyecto: number;
  idTarea: number;
  /** T-170: solo el usuario con la asignación activa puede registrar horas — mismo criterio que el backend. */
  puedeRegistrar: boolean;
  /** La consulta solo se dispara cuando el contenedor está visible. */
  enabled: boolean;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00.000Z`).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatearHoras(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function totalHoras(registros: RegistroTiempoTareaDTO[]): number {
  return registros.reduce((total, registro) => total + registro.horas, 0);
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * HU-142 (T-171) — Registro de horas trabajadas en el detalle de tarea.
 * Mismo patrón de panel reutilizable (query + mutation locales, sin hook
 * propio) que TaskCommentsPanel. "Horas registradas" (este panel, suma de
 * RegistroTiempoTarea) es un concepto distinto de "horas aprobadas"
 * (HorasParticipacion.horasAprobadas, reconocidas por Sprint) — mismo
 * criterio de separación ya establecido para el detalle de integrante
 * (ver `@/lib/dto/member-detail.dto`): nunca se deriva uno del otro.
 */
export function TaskHoursPanel({ idProyecto, idTarea, puedeRegistrar, enabled }: TaskHoursPanelProps) {
  const queryClient = useQueryClient();
  const [horas, setHoras] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState('');

  const horasKey = taskHoursQueryKey(idProyecto, idTarea);

  const { data: registros = [], isLoading, isError } = useQuery<RegistroTiempoTareaDTO[]>({
    queryKey: horasKey,
    queryFn: () => getHorasTarea(idProyecto, idTarea),
    enabled,
  });

  const registrarMutation = useMutation({
    mutationFn: () =>
      registrarHorasTarea(idProyecto, idTarea, {
        horas: Number(horas),
        fecha,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }),
    onSuccess: () => {
      setHoras('');
      setNota('');
      setFecha(hoyISO());
      queryClient.invalidateQueries({ queryKey: horasKey });
      queryClient.invalidateQueries({ queryKey: projectTasksQueryKey(idProyecto) });
      queryClient.invalidateQueries({ queryKey: projectAvanceQueryKey(idProyecto) });
    },
  });

  const horasNumericas = Number(horas);
  const puedeEnviar =
    horas.trim().length > 0 &&
    Number.isFinite(horasNumericas) &&
    horasNumericas > 0 &&
    fecha.length > 0 &&
    !registrarMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    registrarMutation.mutate();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-tertiary">
        Horas registradas para tu propio seguimiento. No sustituyen las horas aprobadas del Sprint, que
        el líder reconoce por separado.
      </p>

      {!isLoading && !isError && (
        <p className="text-sm font-bold text-on-surface">
          Total registrado: {formatearHoras(totalHoras(registros))} h
        </p>
      )}

      {puedeRegistrar && (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-outline-variant/40 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`horas-tarea-${idTarea}`} className="text-xs font-semibold text-on-surface">
                Horas
              </label>
              <Input
                id={`horas-tarea-${idTarea}`}
                type="number"
                step="any"
                inputMode="decimal"
                min={0}
                placeholder="1.5"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                disabled={registrarMutation.isPending}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`fecha-horas-tarea-${idTarea}`} className="text-xs font-semibold text-on-surface">
                Fecha
              </label>
              <Input
                id={`fecha-horas-tarea-${idTarea}`}
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={registrarMutation.isPending}
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional)"
            rows={2}
            disabled={registrarMutation.isPending}
            className="text-sm"
          />
          {registrarMutation.isError && (
            <p role="alert" className="text-xs text-error">
              {getApiErrorMessage(registrarMutation.error, 'task')}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!puedeEnviar}
              className="h-8 gap-1.5 rounded-md text-xs font-bold"
            >
              {registrarMutation.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {registrarMutation.isPending ? 'Registrando...' : 'Registrar horas'}
            </Button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-tertiary">Cargando horas registradas...</p>}
      {isError && (
        <p role="alert" className="text-sm text-error">
          No fue posible cargar las horas registradas.
        </p>
      )}
      {!isLoading && !isError && registros.length === 0 && (
        <p className="text-sm italic text-tertiary">Aún no hay horas registradas en esta tarea.</p>
      )}

      {!isLoading && !isError && registros.length > 0 && (
        <ul className="space-y-3">
          {registros.map((registro) => (
            <li key={registro.idRegistroTiempo} className="flex items-start gap-2.5">
              <Avatar className="mt-0.5 size-7">
                <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                  {getInitials(registro.usuario.nombre, registro.usuario.apellido)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-on-surface">
                    {registro.usuario.nombre} {registro.usuario.apellido}
                  </p>
                  <span className="shrink-0 text-xs font-bold text-on-surface">
                    {formatearHoras(registro.horas)} h
                  </span>
                </div>
                <p className="text-[11px] text-tertiary">{formatearFecha(registro.fecha)}</p>
                {registro.nota && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-on-surface-variant">
                    {registro.nota}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
