'use client';

import { useId, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ChevronDown, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { iniciales } from '@/components/calendar/invitados-field';
import { useActiveAdministrators } from '@/hooks/use-admin-meetings';
import { POLITICA_EDICION_OPCIONES, type AdminMeetingFormValues } from '@/lib/admin/admin-meeting-form';
import type { AdminMeetingPersona, PoliticaEdicionReunion } from '@/lib/types/admin-meetings';

/**
 * «Permisos de gestión» de una reunión de Administración: quién puede
 * editarla o cancelarla (`politicaEdicion`) y, con «Administradores
 * seleccionados», quiénes (`editores`, solo administradores activos). Va
 * plegada para no cargar el formulario; el valor por defecto es el del
 * backend (todos los administradores). Solo el creador vigente puede
 * cambiarla (`puedeCambiarPolitica`): para los demás se muestra bloqueada.
 */
export function MeetingPermissionsField({
  isPending,
  puedeCambiar,
  idCreador,
  editoresConocidos,
}: {
  isPending: boolean;
  puedeCambiar: boolean;
  /** Quien la creó (o crea): nunca figura como editor, ya puede gestionarla. */
  idCreador: number | null;
  /** Editores actuales de la reunión que se edita, para nombrarlos antes de cargar la lista. */
  editoresConocidos: AdminMeetingPersona[];
}) {
  const form = useFormContext<AdminMeetingFormValues>();
  const politica = form.watch('politicaEdicion');
  const editores = form.watch('editores');
  const [abierta, setAbierta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const grupoId = useId();
  const seleccionados = politica === 'ADMINISTRADORES_SELECCIONADOS';
  const administradores = useActiveAdministrators(abierta && seleccionados && puedeCambiar);
  const bloqueado = isPending || !puedeCambiar;

  const nombres = new Map<number, AdminMeetingPersona>(editoresConocidos.map((e) => [e.idUsuario, e]));
  for (const a of administradores.data ?? []) nombres.set(a.idUsuario, a);
  const disponibles = (administradores.data ?? []).filter((a) => a.idUsuario !== idCreador && !editores.includes(a.idUsuario));
  const resumen = POLITICA_EDICION_OPCIONES.find((o) => o.value === politica)?.label ?? '';

  return (
    <Collapsible open={abierta} onOpenChange={setAbierta} className="rounded-card border border-outline-variant/60 bg-surface-container-low">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-tight rounded-card p-stack text-left outline-none motion-focus focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-on-surface">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            Permisos de gestión
          </span>
          <span className="flex min-w-0 items-center gap-micro">
            <span className="truncate type-meta">{resumen}</span>
            <ChevronDown className={`size-4 shrink-0 text-on-surface-variant motion-icon ${abierta ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-stack pb-stack">
        {!puedeCambiar && (
          <p className="type-meta mb-tight">Solo quien programó la reunión puede cambiar quién la gestiona.</p>
        )}
        <RadioGroup
          value={politica}
          onValueChange={(v) => form.setValue('politicaEdicion', v as PoliticaEdicionReunion, { shouldDirty: true })}
          disabled={bloqueado}
          aria-label="Quién puede editar o cancelar la reunión"
          className="gap-tight"
        >
          {POLITICA_EDICION_OPCIONES.map((opcion) => (
            <div key={opcion.value} className="flex items-start gap-tight">
              <RadioGroupItem id={`${grupoId}-${opcion.value}`} value={opcion.value} className="mt-0.5" aria-describedby={`${grupoId}-${opcion.value}-ayuda`} />
              <div className="min-w-0">
                <Label htmlFor={`${grupoId}-${opcion.value}`} className="text-sm font-medium text-on-surface">
                  {opcion.label}
                </Label>
                <p id={`${grupoId}-${opcion.value}-ayuda`} className="type-meta">
                  {opcion.ayuda}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {seleccionados && (
          <div role="group" aria-label="Administradores que también pueden gestionarla" className="mt-tight">
            <div className="flex flex-wrap items-center gap-tight">
              {editores.length === 0 && <span className="type-meta">Aún no elegiste administradores: solo tú podrás gestionarla.</span>}
              {editores.map((id) => {
                const persona = nombres.get(id);
                const nombre = persona ? `${persona.nombre} ${persona.apellido}` : `Administrador ${id}`;
                return (
                  <span
                    key={id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-outline-variant bg-surface-container-lowest py-0.5 pl-0.5 pr-2 text-xs text-text-primary"
                  >
                    <Avatar className="size-6">
                      <AvatarFallback className="bg-surface-container-high type-micro font-bold text-text-secondary">
                        {persona ? iniciales(persona.nombre, persona.apellido) : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{nombre}</span>
                    <button
                      type="button"
                      disabled={bloqueado}
                      onClick={() => form.setValue('editores', editores.filter((e) => e !== id), { shouldDirty: true })}
                      aria-label={`Quitar a ${nombre} de los editores`}
                      className="-mr-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-text-secondary motion-icon motion-focus hover:bg-error/10 hover:text-error disabled:pointer-events-none disabled:opacity-50"
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
            </div>
            <Popover open={buscando} onOpenChange={setBuscando}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" disabled={bloqueado} className="mt-tight h-8 gap-1.5 rounded-pill px-tight text-sm font-medium text-primary hover:bg-primary/10 hover:text-primary">
                  <UserPlus className="size-4" aria-hidden="true" />
                  Agregar administrador
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar administrador" />
                  <CommandList>
                    <CommandEmpty>
                      {administradores.isPending
                        ? 'Cargando administradores…'
                        : administradores.isError
                          ? 'No se pudo cargar la lista de administradores.'
                          : 'No hay más administradores activos.'}
                    </CommandEmpty>
                    {disponibles.map((a) => (
                      <CommandItem
                        key={a.idUsuario}
                        value={`${a.nombre} ${a.apellido}`}
                        onSelect={() => {
                          form.setValue('editores', [...editores, a.idUsuario], { shouldDirty: true });
                          setBuscando(false);
                        }}
                      >
                        <Avatar className="size-6">
                          <AvatarFallback className="type-micro">{iniciales(a.nombre, a.apellido)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">
                          {a.nombre} {a.apellido}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
