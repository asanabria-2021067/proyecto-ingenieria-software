'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisponibilidad, useGuardarDisponibilidad } from '@/hooks/use-perfil-portafolio';
import type { BloqueDisponible } from '@/lib/services/perfil-portafolio';
import { cn } from '@/lib/utils';

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 a 21:00 (bloques de 1 hora)

const clave = (dia: number, hora: number) => dia * 24 + hora;
export const etiquetaHora = (hora: number) => `${String(hora).padStart(2, '0')}:00`;

/** MEJ-148: cuadrícula semanal de días y bloques de 1 hora (hora de Guatemala). Editable solo en el perfil propio. */
export function DisponibilidadSemanal({ idUsuario, editable = false }: { idUsuario: number; editable?: boolean }) {
  const { data, isLoading, isError } = useDisponibilidad(idUsuario);
  if (isLoading) return <Skeleton className="h-72 rounded-card" aria-label="Cargando disponibilidad" />;
  if (isError || !data) return null;
  return <Grilla idUsuario={idUsuario} editable={editable} bloques={data.bloques} />;
}

function Grilla({ idUsuario, editable, bloques }: { idUsuario: number; editable: boolean; bloques: BloqueDisponible[] }) {
  const guardar = useGuardarDisponibilidad(idUsuario);
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(bloques.map((b) => clave(b.dia, b.hora))));

  const alternar = (dia: number, hora: number) =>
    setMarcados((prev) => {
      const next = new Set(prev);
      if (!next.delete(clave(dia, hora))) next.add(clave(dia, hora));
      return next;
    });

  const guardarCambios = () =>
    guardar.mutate([...marcados].sort((a, b) => a - b).map((k) => ({ dia: Math.floor(k / 24), hora: k % 24 })));

  const sinBloques = !editable && bloques.length === 0;

  return (
    <section className="card-base space-y-stack" aria-labelledby={`disponibilidad-${idUsuario}`}>
      <div className="space-y-micro">
        <h2 id={`disponibilidad-${idUsuario}`} className="type-subtitle flex items-center gap-tight text-text-primary">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Disponibilidad semanal
        </h2>
        <p className="type-meta">
          {editable
            ? 'Marca los bloques de una hora en los que sueles estar libre. Hora de Guatemala.'
            : 'Bloques de una hora en los que suele estar libre. Hora de Guatemala.'}
        </p>
      </div>

      {sinBloques ? (
        <p className="type-body text-text-secondary">Sin disponibilidad registrada.</p>
      ) : (
        <div role="grid" aria-label="Disponibilidad semanal" className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] gap-px">
          <div role="row" className="contents">
            <span role="columnheader" className="sr-only">Hora</span>
            {DIAS.map((d) => (
              <span key={d} role="columnheader" className="type-meta text-center" title={d}>
                <span aria-hidden="true">{d.slice(0, 3)}</span>
                <span className="sr-only">{d}</span>
              </span>
            ))}
          </div>
          {HORAS.map((hora) => (
            <div key={hora} role="row" className="contents">
              <span role="rowheader" className="type-meta pr-1 text-right leading-6">{etiquetaHora(hora)}</span>
              {DIAS.map((dia, i) => {
                const activo = marcados.has(clave(i, hora));
                const nombre = `${dia} ${etiquetaHora(hora)}`;
                const color = activo ? 'bg-primary' : 'bg-surface-container';
                return (
                  <div key={dia} role="gridcell">
                    {editable ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={activo}
                        aria-label={nombre}
                        onClick={() => alternar(i, hora)}
                        className={cn('block h-6 w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary', color)}
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label={`${nombre}: ${activo ? 'disponible' : 'no disponible'}`}
                        className={cn('block h-6 w-full rounded-sm', color)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex justify-end">
          <Button type="button" disabled={guardar.isPending} onClick={guardarCambios}>
            Guardar disponibilidad
          </Button>
        </div>
      )}
    </section>
  );
}
