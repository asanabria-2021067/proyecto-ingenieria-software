'use client';

import { useId, useState } from 'react';
import { FolderKanban, Info, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEligibleMeetingProjects, useMeetingProjectTeam } from '@/hooks/use-admin-meetings';
import { MOTIVO_NO_ELEGIBLE } from '@/lib/admin/admin-meeting-form';
import type { AdminMeetingPersona, MotivoNoElegible, ProyectoElegibleReunion } from '@/lib/types/admin-meetings';

const nombreDe = (persona: AdminMeetingPersona) => `${persona.nombre} ${persona.apellido}`;

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Tarjeta compacta de un proyecto invitado: ícono, nombre, líder y la acción
 * para retirarlo. El líder sale de la lista de elegibles; si el proyecto ya
 * no está en ella (al editar, o porque cambió el horario), se lee de su equipo.
 */
export function InvitedProjectCard({
  idProyecto,
  titulo,
  lider,
  aviso,
  onQuitar,
  disabled,
}: {
  idProyecto: number;
  titulo: string;
  /** `undefined` = no se conoce todavía (se consulta el equipo); `null` = sin líder. */
  lider: AdminMeetingPersona | null | undefined;
  aviso: string | null;
  onQuitar: () => void;
  disabled?: boolean;
}) {
  const equipo = useMeetingProjectTeam(idProyecto, lider === undefined);
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
