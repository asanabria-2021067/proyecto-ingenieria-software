'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon } from 'lucide-react';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { aviso } from '@/lib/mensajes';
import { getHorarioSilencio, horarioSilencioQueryKey, updateHorarioSilencio, type HorarioSilencio } from '@/lib/services/notifications';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** MEJ-136: horario de silencio. Dentro del horario no hay avisos emergentes ni push; la bandeja guarda todo igual. */
export function HorarioSilencioSection() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: horarioSilencioQueryKey,
    queryFn: getHorarioSilencio,
    retry: false,
  });

  return (
    <section aria-labelledby="horario-silencio-titulo" className="card-base p-card">
      <h2 id="horario-silencio-titulo" className="type-section">
        Horario de silencio
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        En este horario no verás avisos emergentes ni recibirás notificaciones del navegador. Las notificaciones se guardan
        igual y las encuentras en tu bandeja.
      </p>
      <div className="mt-stack">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !data ? (
          <div role="alert" className="flex flex-wrap items-center gap-stack">
            <p className="type-body text-error">No se pudo cargar tu horario de silencio.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <FormularioSilencio inicial={data} />
        )}
      </div>
    </section>
  );
}

function FormularioSilencio({ inicial }: { inicial: HorarioSilencio }) {
  const queryClient = useQueryClient();
  const [activo, setActivo] = useState(inicial.activo);
  const [horaInicio, setHoraInicio] = useState(inicial.horaInicio);
  const [horaFin, setHoraFin] = useState(inicial.horaFin);
  const [error, setError] = useState('');
  const [actual, setActual] = useState(inicial);

  const guardar = useMutation({
    mutationFn: () => updateHorarioSilencio({ activo, horaInicio, horaFin }),
    onSuccess: (guardado) => {
      setActual(guardado);
      queryClient.setQueryData(horarioSilencioQueryKey, guardado);
      aviso.exito('Horario de silencio guardado');
    },
    onError: (e: Error) => setError(getApiErrorMessage(e, 'general', 'No se pudo guardar el horario de silencio.')),
  });

  const enviar = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!HORA.test(horaInicio) || !HORA.test(horaFin)) {
      setError('Escribe las dos horas con formato HH:mm.');
      return;
    }
    guardar.mutate();
  };

  const sinCambios = activo === actual.activo && horaInicio === actual.horaInicio && horaFin === actual.horaFin;

  return (
    <form onSubmit={enviar} className="flex max-w-xl flex-col gap-stack">
      <div className="flex items-center gap-stack">
        <Switch id="silencio-activo" checked={activo} onCheckedChange={setActivo} />
        <Label htmlFor="silencio-activo" className="type-body cursor-pointer font-medium text-text-primary">
          Activar horario de silencio
        </Label>
        {actual.activo && actual.enSilencio && (
          <Tag tone="subtle" size="sm">
            <Moon aria-hidden="true" />
            En silencio ahora
          </Tag>
        )}
      </div>

      <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
        <div className="flex flex-col gap-tight">
          <Label htmlFor="silencio-inicio">Desde</Label>
          <Input id="silencio-inicio" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} disabled={!activo} />
        </div>
        <div className="flex flex-col gap-tight">
          <Label htmlFor="silencio-fin">Hasta</Label>
          <Input id="silencio-fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} disabled={!activo} />
        </div>
      </div>
      <p className="type-meta">
        Hora de Guatemala. Si «Hasta» es menor que «Desde» el horario cruza la medianoche, por ejemplo de 22:00 a 07:00.
      </p>

      {error && (
        <p role="alert" className="type-meta text-error">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={guardar.isPending || sinCambios}>
          {guardar.isPending ? 'Guardando…' : 'Guardar horario'}
        </Button>
      </div>
    </form>
  );
}
