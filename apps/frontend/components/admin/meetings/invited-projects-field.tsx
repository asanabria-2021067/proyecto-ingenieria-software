'use client';

import { useId, useState } from 'react';
import { ChevronDown, FolderKanban, Info, Plus, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { iniciales } from '@/components/calendar/invitados-field';
import { useEligibleMeetingProjects, useMeetingProjectTeam } from '@/hooks/use-admin-meetings';
import { MOTIVO_NO_ELEGIBLE } from '@/lib/admin/admin-meeting-form';
import type { AdminMeetingPersona, MotivoNoElegible, PersonaDeEquipo, ProyectoElegibleReunion } from '@/lib/types/admin-meetings';

const nombreDe = (persona: AdminMeetingPersona) => `${persona.nombre} ${persona.apellido}`;

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Persona del equipo con sus iniciales; quien no recibe la convocatoria (cuenta no activa) lo dice. */
function PersonaFila({ persona, detalle }: { persona: PersonaDeEquipo; detalle?: string }) {
  return (
    <li className="flex items-center gap-tight">
      <Avatar className="size-7">
        <AvatarFallback className="bg-surface-container-high type-micro font-bold text-text-secondary">
          {iniciales(persona.nombre, persona.apellido)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-on-surface">{nombreDe(persona)}</span>
        {(detalle || !persona.convocado) && (
          <span className="block truncate text-xs text-text-secondary">
            {[detalle, persona.convocado ? null : 'Cuenta no activa: no recibe la convocatoria'].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Detalles de un proyecto invitado dentro de su tarjeta: título, descripción,
 * líder y estudiantes participantes, con la regla de equipo del backend
 * (`GET /admin/reuniones/equipos/:id`: ACTIVO y, en un CERRADO, COMPLETADO).
 */
function DetallesDelProyecto({ id, equipo }: { id: string; equipo: ReturnType<typeof useMeetingProjectTeam> }) {
  return (
    <div id={id} className="mt-tight border-t border-outline-variant/40 pt-tight">
      {equipo.isPending ? (
        <div role="status" aria-label="Cargando los detalles del proyecto" className="space-y-tight">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ) : equipo.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-tight">
          <p className="text-xs text-on-status-error">No se pudieron cargar los detalles del proyecto.</p>
          <Button type="button" variant="outline" size="sm" className="rounded-pill" onClick={() => void equipo.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <dl className="space-y-tight">
          <div>
            <dt className="type-meta">Título del proyecto</dt>
            <dd className="text-sm font-medium text-on-surface">{equipo.data.tituloProyecto}</dd>
          </div>
          <div>
            <dt className="type-meta">Descripción</dt>
            <dd className="whitespace-pre-line break-words text-sm text-on-surface">
              {equipo.data.descripcionProyecto?.trim() || <span className="text-text-secondary">Este proyecto no tiene descripción.</span>}
            </dd>
          </div>
          <div>
            <dt className="type-meta">Líder del proyecto</dt>
            <dd>
              {equipo.data.lider ? (
                <ul className="mt-micro">
                  <PersonaFila persona={equipo.data.lider} />
                </ul>
              ) : (
                <span className="text-sm text-text-secondary">Sin líder registrado.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="type-meta">
              Estudiantes participantes
              {equipo.data.integrantes.length > 0 && <span className="tabular-nums"> ({equipo.data.integrantes.length})</span>}
            </dt>
            <dd>
              {equipo.data.integrantes.length === 0 ? (
                <span className="text-sm text-text-secondary">Sin integrantes además del líder.</span>
              ) : (
                <ul className="mt-micro flex flex-col gap-micro">
                  {equipo.data.integrantes.map((persona) => (
                    <PersonaFila
                      key={persona.idUsuario}
                      persona={persona}
                      detalle={persona.estadoParticipacion === 'COMPLETADO' ? `${persona.rol} · Equipo al cierre` : persona.rol}
                    />
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/**
 * Tarjeta compacta de un proyecto invitado: ícono, nombre, líder, «Ver
 * detalles» (despliega la misma tarjeta, sin otro modal) y la acción para
 * retirarlo. El líder sale de la lista de elegibles; si el proyecto ya no
 * está en ella (al editar, o porque cambió el horario), se lee de su equipo.
 */
export function InvitedProjectCard({
  idProyecto,
  titulo,
  lider,
  consultarLider,
  aviso,
  onQuitar,
  disabled,
}: {
  idProyecto: number;
  titulo: string;
  /** `undefined` = la lista de elegibles no lo trae; `null` = sin líder. */
  lider: AdminMeetingPersona | null | undefined;
  /** El líder se lee del equipo solo cuando la elegibilidad ya respondió sin este proyecto (sin peticiones de más). */
  consultarLider: boolean;
  aviso: string | null;
  onQuitar: () => void;
  disabled?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const detallesId = useId();
  // Una sola consulta por proyecto (en caché): para el líder si no se conoce y para los detalles.
  const equipo = useMeetingProjectTeam(idProyecto, abierta || (lider === undefined && consultarLider));
  const liderVisible = lider !== undefined ? lider : equipo.data?.lider;
  return (
    <li className="rounded-control border border-outline-variant/60 bg-surface-container-lowest p-tight">
      <div className="flex items-center gap-tight">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
          <FolderKanban className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-on-surface">{titulo}</p>
          <p className="truncate type-meta">
            {liderVisible ? `Líder: ${nombreDe(liderVisible)}` : liderVisible === null ? 'Sin líder registrado' : 'Cargando líder…'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls={detallesId}
          aria-label={`${abierta ? 'Ocultar' : 'Ver'} detalles de ${titulo}`}
          className="h-8 shrink-0 gap-micro rounded-pill px-tight text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary"
        >
          <span className="hidden sm:inline">{abierta ? 'Ocultar detalles' : 'Ver detalles'}</span>
          <ChevronDown className={`size-4 motion-icon ${abierta ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onQuitar}
          disabled={disabled}
          aria-label={`Quitar ${titulo} de la reunión`}
          className="size-8 shrink-0 rounded-pill text-on-surface-variant hover:bg-error/10 hover:text-error"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {aviso && (
        <p role="alert" className="mt-tight flex items-start gap-micro text-xs text-on-status-error">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {aviso}
        </p>
      )}
      {abierta && <DetallesDelProyecto id={detallesId} equipo={equipo} />}
    </li>
  );
}

/**
 * «Proyectos invitados» del formulario de reunión de Administración: reemplaza
 * a los invitados individuales del evento de proyecto. Se convoca al equipo
 * completo de cada proyecto; quién recibe la convocatoria (y una sola vez,
 * aunque esté en varios) lo resuelve el backend.
 *
 * Solo se ofrecen los proyectos que `GET /admin/reuniones/proyectos-elegibles`
 * da por convocables para el horario elegido; la consulta se repite al cambiar
 * fecha u hora. Un proyecto ya elegido que deja de serlo no se quita en
 * silencio: su tarjeta lo explica y el servidor decide al guardar.
 */
export function InvitedProjectsField({
  value,
  onChange,
  rango,
  conocidos,
  motivos,
  disabled,
  error,
}: {
  value: number[];
  onChange: (proyectos: number[]) => void;
  /** Inicio y fin de la reunión; `null` mientras el horario no sea válido. */
  rango: { fechaInicio: Date; fechaFin: Date } | null;
  /** Títulos ya conocidos (los proyectos de la reunión que se edita). */
  conocidos: ReadonlyMap<number, string>;
  /** Motivos del último rechazo del servidor, por proyecto. */
  motivos: ReadonlyMap<number, MotivoNoElegible>;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const tituloId = useId();
  const descripcionId = useId();
  const errorId = useId();
  const elegibles = useEligibleMeetingProjects(rango);
  const porId = new Map((elegibles.data ?? []).map((p) => [p.idProyecto, p]));
  const disponibles = (elegibles.data ?? []).filter((p) => !value.includes(p.idProyecto));
  // Mientras llega la elegibilidad del horario nuevo no se acusa a nadie de haber salido de ella.
  const elegibilidadVigente = elegibles.isSuccess && !elegibles.isPlaceholderData;

  const avisoDe = (idProyecto: number): string | null => {
    const motivo = motivos.get(idProyecto);
    if (motivo) return MOTIVO_NO_ELEGIBLE[motivo];
    if (elegibilidadVigente && !porId.has(idProyecto)) return 'No se puede convocar en este horario. Cámbialo o quítalo de la reunión.';
    return null;
  };

  const agregar = (proyecto: ProyectoElegibleReunion) => {
    if (!value.includes(proyecto.idProyecto)) onChange([...value, proyecto.idProyecto]);
    setOpen(false);
  };

  const vacioDeLaLista = elegibles.isPending
    ? rango === null
      ? 'Completa la fecha y el horario para ver los proyectos.'
      : 'Cargando proyectos…'
    : elegibles.isError
      ? 'No se pudieron cargar los proyectos elegibles.'
      : (elegibles.data ?? []).length === 0
        ? 'No hay proyectos que se puedan convocar en este horario.'
        : disponibles.length === 0
          ? 'Ya invitaste a todos los proyectos elegibles.'
          : 'Ningún proyecto coincide con la búsqueda.';

  return (
    <div
      role="group"
      aria-labelledby={tituloId}
      aria-describedby={descripcionId}
      className="rounded-card border border-outline-variant/60 bg-surface-container-low p-stack"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-tight gap-y-micro">
        <span id={tituloId} className="flex items-center gap-1.5 text-sm font-medium text-on-surface">
          <FolderKanban className="size-3.5 text-primary" aria-hidden="true" />
          Proyectos invitados
        </span>
        <span className="type-meta tabular-nums" aria-live="polite">
          {value.length === 1 ? '1 proyecto seleccionado' : `${value.length} proyectos seleccionados`}
        </span>
      </div>
      <p id={descripcionId} className="type-meta mt-micro">
        Selecciona los equipos que participarán en esta reunión.
      </p>

      {value.length > 0 && (
        <ul className="mt-tight flex flex-col gap-tight" aria-label="Proyectos seleccionados">
          {value.map((idProyecto) => {
            const elegible = porId.get(idProyecto);
            return (
              <InvitedProjectCard
                key={idProyecto}
                idProyecto={idProyecto}
                titulo={elegible?.tituloProyecto ?? conocidos.get(idProyecto) ?? `Proyecto ${idProyecto}`}
                lider={elegible ? elegible.lider : undefined}
                consultarLider={!elegibles.isPending && !elegible}
                aviso={avisoDe(idProyecto)}
                disabled={disabled}
                onQuitar={() => onChange(value.filter((id) => id !== idProyecto))}
              />
            );
          })}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {value.length === 0 ? (
            <button
              type="button"
              disabled={disabled}
              aria-describedby={error ? errorId : undefined}
              className={`mt-tight flex h-10 w-full items-center gap-tight rounded-control border bg-surface-container-lowest px-3 text-left text-sm text-on-surface-variant outline-none motion-focus hover:border-outline focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-50 ${
                error ? 'border-destructive' : 'border-outline-variant'
              }`}
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              Buscar proyecto para invitar…
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled}
              className="mt-tight inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar otro proyecto
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar proyecto para invitar…" />
            <CommandList>
              <CommandEmpty>{vacioDeLaLista}</CommandEmpty>
              {disponibles.map((p) => (
                <CommandItem key={p.idProyecto} value={`${p.tituloProyecto} ${p.lider ? nombreDe(p.lider) : ''}`} onSelect={() => agregar(p)}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{p.tituloProyecto}</span>
                    <span className="truncate text-xs text-text-secondary">
                      {p.lider ? `Líder: ${nombreDe(p.lider)}` : 'Sin líder registrado'}
                      {' · '}
                      {p.integrantesConvocables === 1 ? '1 persona' : `${p.integrantesConvocables} personas`}
                      {p.ventanaHasta && ` · Cerrado, convocable hasta ${fechaCorta(p.ventanaHasta)}`}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          {elegibles.isError && (
            <div className="border-t border-outline-variant/40 p-tight">
              <Button type="button" variant="outline" size="sm" className="w-full rounded-pill" onClick={() => void elegibles.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {error && (
        <p id={errorId} role="alert" className="mt-micro text-sm text-destructive">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <p className="type-meta mt-tight flex items-start gap-micro">
          <Info className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
          Los integrantes elegibles de los proyectos seleccionados recibirán una convocatoria.
        </p>
      )}
    </div>
  );
}
