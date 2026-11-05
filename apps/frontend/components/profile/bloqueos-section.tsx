'use client';

import { BellOff, ShieldBan } from 'lucide-react';
import { iniciales } from '@/components/calendar/invitados-field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccionesRestriccion, useRestricciones } from '@/hooks/use-perfil-portafolio';
import type { PersonaRestringida, TipoRestriccion } from '@/lib/services/perfil-portafolio';

function Lista({ titulo, vacio, personas, tipo, accion }: { titulo: string; vacio: string; personas: PersonaRestringida[]; tipo: TipoRestriccion; accion: string }) {
  const { quitar } = useAccionesRestriccion();
  return (
    <div className="space-y-tight">
      <h3 className="type-meta uppercase tracking-wide">{titulo}</h3>
      {personas.length === 0 ? (
        <p className="type-body text-text-secondary">{vacio}</p>
      ) : (
        <ul className="divide-y divide-outline-variant" aria-label={titulo}>
          {personas.map((p) => (
            <li key={p.idUsuario} className="flex items-center justify-between gap-stack py-tight">
              <span className="flex min-w-0 items-center gap-tight">
                <Avatar className="size-8">
                  {p.fotoUrl && <AvatarImage src={p.fotoUrl} alt="" />}
                  <AvatarFallback className="type-meta">{iniciales(p.nombre, p.apellido)}</AvatarFallback>
                </Avatar>
                <span className="type-body truncate text-text-primary">
                  {p.nombre} {p.apellido}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={quitar.isPending}
                aria-label={`${accion} a ${p.nombre} ${p.apellido}`}
                onClick={() => quitar.mutate({ tipo, idObjetivo: p.idUsuario })}
              >
                {accion}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** MEJ-153: gestión de bloqueos y silencios desde Configuración. */
export function BloqueosSection() {
  const { data, isLoading, isError } = useRestricciones();
  if (isLoading) return <Skeleton className="h-40 rounded-card" aria-label="Cargando bloqueos" />;
  if (isError || !data) return null;

  return (
    <section className="card-base space-y-stack" aria-labelledby="bloqueos-titulo">
      <div className="space-y-micro">
        <h2 id="bloqueos-titulo" className="type-subtitle flex items-center gap-tight text-text-primary">
          <ShieldBan className="size-4 text-primary" aria-hidden="true" />
          Bloqueos y silencios
        </h2>
        <p className="type-meta flex items-start gap-tight">
          <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Bloquear impide mensajes directos, solicitudes de amistad e invitaciones. Silenciar solo oculta sus notificaciones.
        </p>
      </div>
      <Lista titulo="Personas bloqueadas" vacio="No has bloqueado a nadie." personas={data.bloqueados} tipo="bloqueo" accion="Desbloquear" />
      <Lista titulo="Personas silenciadas" vacio="No has silenciado a nadie." personas={data.silenciados} tipo="silencio" accion="Dejar de silenciar" />
    </section>
  );
}
