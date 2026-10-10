'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Search, Share2, UserMinus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/components/projects/api-error';
import {
  useCalendariosCompartidos,
  useCompartirCalendario,
  useDejarDeCompartirCalendario,
} from '@/hooks/use-calendar-shares';
import { aviso } from '@/lib/mensajes';
import { buscarUsuarios } from '@/lib/services/social';
import type { UsuarioResumenDto } from '@/lib/types/social';
import { iniciales } from './invitados-field';

/** Mínimo de letras para consultar (`buscarUsuarios` ignora consultas más cortas). */
export const MIN_BUSQUEDA = 2;

function Persona({ persona, detalle }: { persona: UsuarioResumenDto; detalle?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-tight">
      <Avatar className="size-8">
        {persona.fotoUrl && <AvatarImage src={persona.fotoUrl} alt="" />}
        <AvatarFallback className="text-xs font-bold">{iniciales(persona.nombre, persona.apellido)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <span className="type-body truncate text-text-primary">
          {persona.nombre} {persona.apellido}
        </span>
        {detalle && <span className="type-meta truncate">{detalle}</span>}
      </span>
    </span>
  );
}

/**
 * HU-184: compartir mi agenda en solo lectura con cualquier usuario de la
 * plataforma (buscador de /social/usuarios/buscar). No requiere aceptación:
 * a la otra persona le llega una notificación y puede activarla en su
 * calendario. Dejar de compartir es reversible, así que no pide confirmación
 * (regla de docs/architecture/sprint8-mensajes.md); solo avisa el resultado.
 */
export function ShareCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { data: compartidos, isLoading: cargandoLista, isError: errorLista, refetch: recargarLista } = useCalendariosCompartidos();
  const compartir = useCompartirCalendario();
  const dejar = useDejarDeCompartirCalendario();

  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTexto('');
      setBusqueda('');
    }
    onOpenChange(next);
  };

  // G03 (UI-40): cada estado del buscador se distingue: consulta corta (sin
  // pedir nada), buscando, fallo HTTP (con reintento) y vacío legítimo. La
  // consulta sigue con debounce de 300 ms y una clave por texto, así que una
  // respuesta tardía de un texto anterior nunca pisa a la actual.
  const consultaCorta = texto.trim().length > 0 && texto.trim().length < MIN_BUSQUEDA;
  const resultados = useQuery({
    queryKey: ['compartir-agenda-busqueda', busqueda],
    queryFn: () => buscarUsuarios({ q: busqueda }),
    enabled: open && busqueda.length >= MIN_BUSQUEDA,
    retry: false,
  });

  const yaCompartido = new Set((compartidos?.compartidoPorMi ?? []).map((u) => u.idUsuario));

  const handleCompartir = (persona: UsuarioResumenDto) => {
    compartir.mutate(persona.idUsuario, {
      onSuccess: () => aviso.exito('Agenda compartida', `${persona.nombre} ${persona.apellido} ya puede ver tu agenda.`),
      onError: (err) => aviso.error('No se pudo compartir tu agenda', getApiErrorMessage(err, 'calendar')),
    });
  };

  const handleDejar = (persona: UsuarioResumenDto) => {
    dejar.mutate(persona.idUsuario, {
      onSuccess: () => aviso.exito('Dejaste de compartir tu agenda', `${persona.nombre} ${persona.apellido} ya no la verá.`),
      onError: (err) => aviso.error('No se pudo dejar de compartir', getApiErrorMessage(err, 'calendar')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-[480px]">
        <DialogHeader className="shrink-0 flex-row items-start gap-3 space-y-0 border-b border-outline-variant/35 px-4 pb-4 pt-5 pr-12 text-left sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary">
            <Share2 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold text-on-surface">Compartir mi agenda</DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant sm:text-sm">
              Verán tus eventos y fechas límite de tareas, sin poder editarlos.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="space-y-tight">
            <label htmlFor="buscar-persona-agenda" className="text-sm font-medium text-on-surface">
              Buscar persona
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
                aria-hidden="true"
              />
              <Input
                id="buscar-persona-agenda"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Nombre o apellido (mínimo 2 letras)"
                aria-describedby="buscar-persona-agenda-pista"
                className="h-10 rounded-md border-outline-variant pl-9 text-sm"
              />
            </div>
            <p id="buscar-persona-agenda-pista" className="type-meta" aria-live="polite">
              {consultaCorta ? `Escribe al menos ${MIN_BUSQUEDA} letras para buscar.` : 'Busca por nombre o apellido.'}
            </p>

            {busqueda.length >= MIN_BUSQUEDA && (
              <ul className="divide-y divide-outline-variant/30 rounded-card border border-outline-variant/50" aria-label="Resultados">
                {resultados.isLoading && (
                  <li role="status" className="type-meta flex items-center gap-tight px-stack py-tight">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Buscando...
                  </li>
                )}
                {resultados.isError && (
                  <li role="alert" className="flex flex-wrap items-center justify-between gap-tight px-stack py-tight">
                    <span className="type-meta flex items-center gap-tight text-status-error">
                      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                      No se pudo buscar personas. {getApiErrorMessage(resultados.error, 'calendar')}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void resultados.refetch()} className="shrink-0">
                      Reintentar búsqueda
                    </Button>
                  </li>
                )}
                {resultados.data?.items.length === 0 && (
                  <li className="type-meta px-stack py-tight">No se encontraron personas.</li>
                )}
                {resultados.data?.items.map((persona) => {
                  const compartido = yaCompartido.has(persona.idUsuario);
                  return (
                    <li key={persona.idUsuario} className="flex items-center justify-between gap-tight px-stack py-tight">
                      <Persona persona={persona} detalle={persona.carrera ?? undefined} />
                      <Button
                        type="button"
                        size="sm"
                        variant={compartido ? 'outline' : 'default'}
                        disabled={compartido || compartir.isPending}
                        onClick={() => handleCompartir(persona)}
                        aria-label={compartido ? `Ya compartida con ${persona.nombre}` : `Compartir con ${persona.nombre} ${persona.apellido}`}
                        className="shrink-0 gap-1"
                      >
                        {compartido ? <Check className="size-3.5" aria-hidden="true" /> : <Share2 className="size-3.5" aria-hidden="true" />}
                        {compartido ? 'Compartida' : 'Compartir'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-tight">
            <h3 className="text-sm font-medium text-on-surface">
              Compartida con{compartidos ? ` (${compartidos.compartidoPorMi.length})` : ''}
            </h3>
            {cargandoLista ? (
              <p role="status" className="type-meta flex items-center gap-tight">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Cargando...
              </p>
            ) : errorLista ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-tight">
                <span className="type-meta text-status-error">No se pudo cargar con quién compartes tu agenda.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void recargarLista()} className="shrink-0">
                  Reintentar
                </Button>
              </div>
            ) : (compartidos?.compartidoPorMi.length ?? 0) === 0 ? (
              <p className="type-meta">Todavía no compartes tu agenda con nadie.</p>
            ) : (
              <ul className="space-y-tight">
                {compartidos?.compartidoPorMi.map((persona) => (
                  <li key={persona.idUsuario} className="flex items-center justify-between gap-tight">
                    <Persona persona={persona} detalle={persona.correo} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={dejar.isPending}
                      onClick={() => handleDejar(persona)}
                      aria-label={`Dejar de compartir con ${persona.nombre} ${persona.apellido}`}
                      className="shrink-0 gap-1 text-status-error hover:text-status-error"
                    >
                      <UserMinus className="size-3.5" aria-hidden="true" />
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
