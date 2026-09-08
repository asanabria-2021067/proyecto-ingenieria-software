'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { useLeadershipAppealMutations, useLeadershipCandidates } from '@/hooks/use-leadership';
import uvgSwal from '@/lib/swal';
import {
  ASUNTO_MAX,
  MENSAJE_APELACION_MAX,
  motivoInelegibilidadLabel,
  type LeadershipCandidateDto,
} from '@/lib/types/leadership';

export interface LeadershipAppealSheetProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

/** Texto accesible de una opción: identidad, rol, hechos objetivos y, si no es seleccionable, su motivo real. */
export function describirCandidato(c: LeadershipCandidateDto): string {
  const roles = c.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol';
  const base = `${c.nombre} ${c.apellido} · ${roles} · ${c.tareasDistintas} ${c.tareasDistintas === 1 ? 'tarea' : 'tareas'} · ${formatearDecimal(c.horasReportadas)} h reportadas`;
  if (c.seleccionable) return base;
  const motivos = c.motivos.map(motivoInelegibilidadLabel).join('; ') || 'No elegible';
  return `${base} · No seleccionable: ${motivos}`;
}

/**
 * VIEW-17 (F009) — Sheet «Apelar cambio de liderazgo». El candidato es
 * OBLIGATORIO (no «opcional» como en el mockup); Asunto ≤ 200 y Mensaje
 * ≤ 10000 (no 500). Los no `seleccionable` se muestran deshabilitados con
 * su motivo del catálogo real de 9: nunca se inventa «horas mínimas» ni
 * existe ranking. La decisión es del administrador.
 */
export function LeadershipAppealSheet({ projectId, open, onOpenChange, onSubmitted }: LeadershipAppealSheetProps) {
  const baseId = useId();
  const candidatesQuery = useLeadershipCandidates(projectId, open);
  const { create, invalidate } = useLeadershipAppealMutations(projectId);

  const [asunto, setAsunto] = useState('');
  const [candidato, setCandidato] = useState<string>('');
  const [mensaje, setMensaje] = useState('');
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const candidatos = candidatesQuery.data?.candidatos ?? [];
  const advertencia = candidatesQuery.data?.contexto.advertenciaApelacion ?? null;
  const candidatoSeleccionado = candidatos.find((c) => String(c.idUsuario) === candidato) ?? null;

  const asuntoValido = asunto.trim().length > 0 && asunto.length <= ASUNTO_MAX;
  const mensajeValido = mensaje.trim().length > 0 && mensaje.length <= MENSAJE_APELACION_MAX;
  const candidatoValido = candidatoSeleccionado != null && candidatoSeleccionado.seleccionable;
  const puedeEnviar = asuntoValido && mensajeValido && candidatoValido && !create.isPending;

  const cerrar = (siguiente: boolean) => {
    if (!siguiente) {
      setAsunto('');
      setCandidato('');
      setMensaje('');
      setErrorServidor(null);
      create.reset();
    }
    onOpenChange(siguiente);
  };

  const enviar = () => {
    if (!puedeEnviar || !candidatoSeleccionado) return;
    setErrorServidor(null);
    create.mutate(
      {
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        idCandidatoPropuesto: candidatoSeleccionado.idUsuario,
      },
      {
        onSuccess: () => {
          onSubmitted?.();
          cerrar(false);
          void uvgSwal.fire({
            icon: 'success',
            title: 'Apelación enviada',
            text: 'Un administrador la revisará y decidirá sobre el cambio de liderazgo.',
            timer: 2200,
            timerProgressBar: true,
            showConfirmButton: false,
          });
        },
        onError: (err) => {
          const status = getApiErrorStatus(err);
          if (status === 403) {
            // Terminal: el liderazgo cambió; se cierra con aviso, sin reintentar.
            cerrar(false);
            void uvgSwal.fire({ icon: 'warning', title: getApiErrorMessage(err, 'leadership') });
            return;
          }
          if (status === 409) {
            // Ya existe una apelación pendiente (u otro conflicto): invalidar y cerrar.
            invalidate();
            cerrar(false);
            void uvgSwal.fire({
              icon: 'info',
              title: 'La apelación no se pudo registrar',
              text: getApiErrorMessage(err, 'leadership'),
            });
            return;
          }
          setErrorServidor(getApiErrorMessage(err, 'leadership'));
        },
      },
    );
  };

  const idAsunto = `${baseId}-asunto`;
  const idCandidato = `${baseId}-candidato`;
  const idMensaje = `${baseId}-mensaje`;
  const idError = `${baseId}-error`;

  return (
    <Sheet open={open} onOpenChange={cerrar}>
      <SheetContent
        side="right"
        closeLabel="Cerrar"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        aria-describedby={`${baseId}-desc`}
      >
        <SheetHeader className="border-b border-outline-variant/40 px-5 py-4">
          <SheetTitle className="text-lg font-bold text-on-surface">Apelar cambio de liderazgo</SheetTitle>
          <SheetDescription id={`${baseId}-desc`} className="text-xs text-tertiary">
            Propón un candidato elegible y explica tu solicitud. La decisión final es del administrador.
          </SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          {candidatesQuery.isPending ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : advertencia ? (
            <div
              role="note"
              className="flex gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-800 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p>{advertencia}</p>
            </div>
          ) : null}

          <div>
            <Label htmlFor={idAsunto} className="text-xs font-semibold text-on-surface">
              Asunto <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={idAsunto}
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={ASUNTO_MAX}
              required
              aria-required="true"
              autoFocus
              placeholder="Resume el motivo de tu apelación"
              className="mt-1 h-9 text-sm"
            />
            <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
              {asunto.length}/{ASUNTO_MAX}
            </p>
          </div>

          <div>
            <Label htmlFor={idCandidato} className="text-xs font-semibold text-on-surface">
              Candidato propuesto <span aria-hidden="true">*</span>
            </Label>
            {candidatesQuery.isPending ? (
              <Skeleton className="mt-1 h-9 w-full rounded-md" />
            ) : candidatesQuery.isError ? (
              <p role="alert" className="mt-1 text-xs text-error">
                {getApiErrorMessage(candidatesQuery.error, 'leadership')}
              </p>
            ) : (
              <Select value={candidato} onValueChange={setCandidato} required>
                <SelectTrigger
                  id={idCandidato}
                  aria-label="Candidato propuesto"
                  aria-required="true"
                  className="mt-1 h-auto min-h-9 w-full text-sm"
                >
                  <SelectValue placeholder="Selecciona un integrante…" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.length === 0 && (
                    <div className="px-2 py-3 text-xs text-tertiary">No hay integrantes candidatos.</div>
                  )}
                  {candidatos.map((c) => (
                    <SelectItem
                      key={c.idUsuario}
                      value={String(c.idUsuario)}
                      disabled={!c.seleccionable}
                      textValue={describirCandidato(c)}
                      className="py-2"
                    >
                      <span className="flex items-center gap-2">
                        <Avatar className="size-7">
                          {c.fotoUrl && <AvatarImage src={c.fotoUrl} alt="" />}
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {getInitials(c.nombre, c.apellido)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold text-on-surface">
                            {c.nombre} {c.apellido}
                          </span>
                          <span className="text-[11px] text-tertiary">
                            {c.seleccionable
                              ? `${c.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol'} · ${c.tareasDistintas} ${c.tareasDistintas === 1 ? 'tarea' : 'tareas'} · ${formatearDecimal(c.horasReportadas)} h reportadas`
                              : c.motivos.map(motivoInelegibilidadLabel).join('; ') || 'No elegible'}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-1 text-[11px] text-tertiary">
              Solo pueden seleccionarse integrantes elegibles. Los demás muestran el motivo.
            </p>
          </div>

          <div>
            <Label htmlFor={idMensaje} className="text-xs font-semibold text-on-surface">
              Mensaje <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={idMensaje}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              maxLength={MENSAJE_APELACION_MAX}
              required
              aria-required="true"
              rows={6}
              placeholder="Describe las razones de tu apelación. Incluye cualquier información relevante para que pueda ser revisada."
              className="mt-1 text-sm"
            />
            <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
              {mensaje.length}/{MENSAJE_APELACION_MAX}
            </p>
          </div>

          {errorServidor && (
            <p id={idError} role="alert" className="text-xs text-error">
              {errorServidor}
            </p>
          )}
        </form>

        <SheetFooter className="border-t border-outline-variant/40 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => cerrar(false)}
            disabled={create.isPending}
            className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar}
            className="h-10 w-full gap-1.5 rounded-lg text-sm font-bold sm:w-auto"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Enviar apelación
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
