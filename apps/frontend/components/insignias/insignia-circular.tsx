'use client';

import { Award, CheckCircle2, Clock, Crown, Flag, FolderCheck, MessageSquare, UserCheck, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  NIVEL_ANILLO,
  NIVEL_NOMBRE,
  contadorNivel,
  etiquetaInsignia,
  fechaNivelActual,
  porcentajeSiguiente,
  siguienteNivel,
} from '@/lib/insignias/niveles';
import type { InsigniaDto } from '@/lib/types/insignias';
import { cn } from '@/lib/utils';

const ICONOS: Record<string, LucideIcon> = {
  CheckCircle2,
  Clock,
  FolderCheck,
  Crown,
  UserCheck,
  MessageSquare,
  Flag,
};

interface InsigniaCircularProps {
  insignia: InsigniaDto;
  /** Perfil de otra persona: se omite el progreso hacia el siguiente nivel. */
  publica?: boolean;
}

export function InsigniaCircular({ insignia, publica = false }: InsigniaCircularProps) {
  const { nivel } = insignia;
  const bloqueada = nivel === null;
  const Icono = ICONOS[insignia.icono] ?? Award;
  const contador = contadorNivel(nivel);
  const siguiente = siguienteNivel(nivel);
  const fecha = fechaNivelActual(insignia);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={etiquetaInsignia(insignia)}
          className="flex w-full flex-col items-center gap-tight rounded-card p-tight text-center outline-none transition-colors hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative flex size-20 items-center justify-center rounded-full border-4 bg-card',
              bloqueada ? 'border-dashed border-outline-variant' : NIVEL_ANILLO[nivel],
            )}
          >
            <Icono className={cn('size-8', bloqueada ? 'text-text-disabled' : 'text-text-primary')} />
            {contador && (
              <span className="type-micro absolute -right-1 -bottom-1 rounded-full bg-action px-1.5 font-semibold text-on-action">
                {contador}
              </span>
            )}
          </span>
          <span className="type-meta font-medium text-text-primary">{insignia.nombre}</span>
          <span className="type-micro text-text-secondary">{bloqueada ? 'Bloqueada' : NIVEL_NOMBRE[nivel]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="space-y-tight">
        <p className="type-subtitle text-text-primary">{insignia.nombre}</p>
        <p className="type-meta">{insignia.descripcion}</p>
        <p className="type-body text-text-primary">
          Nivel actual: <strong>{bloqueada ? 'Sin nivel' : NIVEL_NOMBRE[nivel]}</strong>
        </p>
        {fecha && <p className="type-meta">Obtenida el {fecha}</p>}
        {!publica && (
          <div className="space-y-micro">
            {siguiente && insignia.siguienteUmbral !== null ? (
              <>
                <p className="type-meta">
                  Progreso: {insignia.progreso} / {insignia.siguienteUmbral} para {NIVEL_NOMBRE[siguiente]}
                </p>
                <Progress
                  value={porcentajeSiguiente(insignia)}
                  aria-label={`Progreso hacia ${NIVEL_NOMBRE[siguiente]}`}
                />
              </>
            ) : (
              <p className="type-meta">Nivel máximo alcanzado.</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
