'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjectMembers, type MiembroProyecto } from '@/hooks/use-project-members';

export function iniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function Chip({ persona, sufijo, onQuitar, disabled }: {
  persona: Pick<MiembroProyecto, 'nombre' | 'apellido' | 'fotoUrl'>;
  sufijo?: string;
  onQuitar?: () => void;
  disabled?: boolean;
}) {
  const nombre = `${persona.nombre} ${persona.apellido.charAt(0)}.`;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-outline-variant bg-surface-container-lowest py-0.5 pl-0.5 pr-2 text-xs text-text-primary">
      <Avatar className="size-6">
        {persona.fotoUrl && <AvatarImage src={persona.fotoUrl} alt="" />}
        <AvatarFallback className="bg-surface-container-high text-[10px] font-bold text-text-secondary">
          {iniciales(persona.nombre, persona.apellido)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">
        {nombre}
        {sufijo && <span className="text-text-secondary"> {sufijo}</span>}
      </span>
      {onQuitar ? (
        <button
          type="button"
          onClick={onQuitar}
          disabled={disabled}
          aria-label={`Quitar a ${persona.nombre} ${persona.apellido}`}
          className="rounded-pill p-0.5 text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : (
        <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * HU-184 (T-323): "Participantes e invitados" del diálogo de evento. Se
 * eligen integrantes activos del proyecto (GET /proyectos/:id/equipo); sin
 * invitados el evento es para todo el proyecto. El líder (quien crea el
 * evento) siempre lo ve, por eso aparece fijo y no se puede quitar.
 */
export function InvitadosField({
  idProyecto,
  value,
  onChange,
  lider,
  disabled,
}: {
  idProyecto: number;
  value: number[];
  onChange: (invitados: number[]) => void;
  lider: Pick<MiembroProyecto, 'idUsuario' | 'nombre' | 'apellido' | 'fotoUrl'> | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { members, isLoading } = useProjectMembers(idProyecto);

  // Una persona con dos roles aparece dos veces en el equipo: se deduplica.
  const integrantes = useMemo(() => {
    const porId = new Map<number, MiembroProyecto>();
    for (const m of members) if (m.idUsuario !== lider?.idUsuario) porId.set(m.idUsuario, m);
    return [...porId.values()];
  }, [members, lider?.idUsuario]);

  const invitados = integrantes.filter((m) => value.includes(m.idUsuario));
  const disponibles = integrantes.filter((m) => !value.includes(m.idUsuario));

  return (
    <div className="rounded-card border border-outline-variant/60 bg-surface-container-low p-stack">
      <div className="mb-tight flex items-center justify-between gap-tight">
        <span className="text-sm font-medium text-on-surface">Participantes e invitados</span>
        <span className="type-meta">
          {value.length === 0 ? 'Todo el proyecto' : `${value.length} ${value.length === 1 ? 'invitado' : 'invitados'}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-tight">
        {lider && <Chip persona={lider} sufijo="(Tú · Líder)" />}
        {invitados.map((m) => (
          <Chip
            key={m.idUsuario}
            persona={m}
            disabled={disabled}
            onQuitar={() => onChange(value.filter((id) => id !== m.idUsuario))}
          />
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || idProyecto <= 0}
            className="mt-tight inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Añadir integrante
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar integrante del proyecto" />
            <CommandList>
              <CommandEmpty>{isLoading ? 'Cargando integrantes...' : 'No hay más integrantes para invitar.'}</CommandEmpty>
              {disponibles.map((m) => (
                <CommandItem
                  key={m.idUsuario}
                  value={`${m.nombre} ${m.apellido} ${m.correo}`}
                  onSelect={() => {
                    onChange([...value, m.idUsuario]);
                    setOpen(false);
                  }}
                >
                  <Avatar className="size-6">
                    {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">{iniciales(m.nombre, m.apellido)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {m.nombre} {m.apellido}
                    </span>
                    <span className="truncate text-xs text-text-secondary">{m.correo}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length === 0 && (
        <p className="type-meta mt-micro">Sin invitados, todos los integrantes del proyecto verán el evento.</p>
      )}
    </div>
  );
}
