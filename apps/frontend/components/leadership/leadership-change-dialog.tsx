'use client';

import { useId, useState } from 'react';
import { AlertTriangle, Loader2, UserCog } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { describirCandidato } from '@/components/leadership/leadership-appeal-sheet';
import { useLeadershipCandidates, useTransferLeadership } from '@/hooks/use-leadership';
import uvgSwal from '@/lib/swal';
import {
  MOTIVO_TRANSFERENCIA_MAX,
  motivoInelegibilidadLabel,
  type TransferLeadershipInput,
} from '@/lib/types/leadership';

export interface LeadershipChangeDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** VIEW-18: candidato propuesto por la apelación, precargado y editable. */
  presetCandidateId?: number | null;
  /** VIEW-18: envío por el endpoint de aceptación de la apelación (mismo DTO). */
  submit?: (input: TransferLeadershipInput) => Promise<unknown>;
  title?: string;
  confirmLabel?: string;
  onTransferred?: () => void;
  /** Fecha desde la que lidera el líder actual, si se conoce. */
  liderDesde?: string | null;
}

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

function formatearFecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * VIEW-19 (F014), reutilizado por VIEW-18 (F015) — Dialog «Cambiar liderazgo».
 * Envía `{ idLiderNuevo, expectedLeaderId, motivo }`: `expectedLeaderId` sale
 * del contexto del servidor (`liderActual.idUsuario`), nunca de un valor
 * codificado. Motivo ≤ 5000 (no 500). Sin ranking ni recomendación: los
 * candidatos no `seleccionable` se muestran deshabilitados con su motivo. Un
 * 409 (CAS) se resuelve con «Actualizar» explícito; nunca se reintenta solo.
 */
export function LeadershipChangeDialog({
  projectId,
  open,
  onOpenChange,
  presetCandidateId = null,
  submit,
  title = 'Cambiar liderazgo',
  confirmLabel = 'Confirmar cambio',
  onTransferred,
  liderDesde,
}: LeadershipChangeDialogProps) {
  const baseId = useId();
  const candidatesQuery = useLeadershipCandidates(projectId, open);
  const { transfer, refreshContext } = useTransferLeadership(projectId, submit);

  const [candidato, setCandidato] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const contexto = candidatesQuery.data?.contexto ?? null;
  const candidatos = candidatesQuery.data?.candidatos ?? [];
  const seleccionActual = candidato || (presetCandidateId != null ? String(presetCandidateId) : '');
  const candidatoSeleccionado = candidatos.find((c) => String(c.idUsuario) === seleccionActual) ?? null;
  const motivoValido = motivo.trim().length > 0 && motivo.length <= MOTIVO_TRANSFERENCIA_MAX;
  const puedeConfirmar =
    contexto != null && candidatoSeleccionado != null && candidatoSeleccionado.seleccionable && motivoValido && !transfer.isPending;

  const cerrar = (siguiente: boolean) => {
    if (!siguiente) {
      setCandidato('');
      setMotivo('');
      setConflicto(null);
      setErrorServidor(null);
      transfer.reset();
    }
    onOpenChange(siguiente);
  };

  const confirmar = () => {
    if (!puedeConfirmar || !contexto || !candidatoSeleccionado) return;
    setConflicto(null);
    setErrorServidor(null);
    transfer.mutate(
      {
        idLiderNuevo: candidatoSeleccionado.idUsuario,
        expectedLeaderId: contexto.liderActual.idUsuario,
        motivo: motivo.trim(),
      },
      {
        onSuccess: () => {
          onTransferred?.();
          cerrar(false);
          void uvgSwal.fire({
            icon: 'success',
            title: 'Liderazgo transferido',
            text: `${candidatoSeleccionado.nombre} ${candidatoSeleccionado.apellido} es ahora el líder del proyecto.`,
            timer: 2200,
            timerProgressBar: true,
            showConfirmButton: false,
          });
        },
        onError: (err) => {
          const status = getApiErrorStatus(err);
          if (status === 409) {
            setConflicto('El liderazgo cambió mientras trabajabas. Actualiza para ver al líder actual y vuelve a confirmar.');
            return;
          }
          if (status === 403) {
            cerrar(false);
            void uvgSwal.fire({ icon: 'warning', title: getApiErrorMessage(err, 'admin') });
            return;
          }
          setErrorServidor(getApiErrorMessage(err, 'admin'));
        },
      },
    );
  };

  const actualizarContexto = () => {
    setConflicto(null);
    setCandidato('');
    refreshContext();
  };

  const idCandidato = `${baseId}-nuevo-lider`;
  const idMotivo = `${baseId}-motivo`;
  const desde = formatearFecha(liderDesde);

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,520px)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-outline-variant/40 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-on-surface">
            <UserCog className="size-5 text-primary" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-tertiary">
            Transfiere el liderazgo a un integrante elegible. El cambio queda registrado en el historial.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
        >
          <section aria-labelledby={`${baseId}-actual`}>
            <h3 id={`${baseId}-actual`} className="text-xs font-semibold text-on-surface">
              Líder actual
            </h3>
            {candidatesQuery.isPending ? (
              <Skeleton className="mt-2 h-14 w-full rounded-xl" />
            ) : contexto ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-outline-variant/40 p-3">
                <Avatar className="size-11">
                  <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                    {getInitials(contexto.liderActual.nombre, contexto.liderActual.apellido)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface">
                    {contexto.liderActual.nombre} {contexto.liderActual.apellido}
                  </p>
                  <p className="text-xs text-on-surface-variant">Líder del proyecto</p>
                  {desde && <p className="text-[11px] text-tertiary">Desde {desde}</p>}
                </div>
              </div>
            ) : (
              <p role="alert" className="mt-2 text-xs text-error">
                {getApiErrorMessage(candidatesQuery.error, 'admin')}
              </p>
            )}
          </section>

          <div>
            <Label htmlFor={idCandidato} className="text-xs font-semibold text-on-surface">
              Nuevo líder <span aria-hidden="true">*</span>
            </Label>
            {candidatesQuery.isPending ? (
              <Skeleton className="mt-1 h-10 w-full rounded-md" />
            ) : (
              <Select value={seleccionActual} onValueChange={setCandidato} required>
                <SelectTrigger
                  id={idCandidato}
                  aria-label="Nuevo líder"
                  aria-required="true"
                  autoFocus
                  className="mt-1 h-auto min-h-10 w-full text-sm"
                >
                  <SelectValue placeholder="Selecciona un integrante elegible…" />
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
                              ? `${c.rolesActivos.map((r) => r.nombreRol).join(', ') || 'Sin rol'} · ${c.tareasDistintas} ${c.tareasDistintas === 1 ? 'tarea' : 'tareas'} · ${formatearDecimal(c.horasReportadas)} h`
                              : c.motivos.map(motivoInelegibilidadLabel).join('; ') || 'No elegible'}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="mt-1 text-[11px] text-tertiary">Solo pueden seleccionarse integrantes elegibles.</p>
          </div>

          <div>
            <Label htmlFor={idMotivo} className="text-xs font-semibold text-on-surface">
              Motivo <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={idMotivo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MOTIVO_TRANSFERENCIA_MAX}
              required
              aria-required="true"
              rows={4}
              placeholder="Explica el motivo del cambio de liderazgo…"
              className="mt-1 text-sm"
            />
            <p className="mt-1 text-right text-[11px] text-tertiary" aria-live="polite">
              {motivo.length}/{MOTIVO_TRANSFERENCIA_MAX}
            </p>
          </div>

          {contexto?.advertenciaAdmin && (
            <div
              role="note"
              className="flex gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-800 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p>{contexto.advertenciaAdmin}</p>
            </div>
          )}

          {conflicto && (
            <p role="alert" className="text-xs text-error">
              {conflicto}{' '}
              <button type="button" onClick={actualizarContexto} className="font-bold underline underline-offset-2">
                Actualizar
              </button>
            </p>
          )}
          {errorServidor && (
            <p role="alert" className="text-xs text-error">
              {errorServidor}
            </p>
          )}
        </form>

        <DialogFooter className="border-t border-outline-variant/40 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            onClick={() => cerrar(false)}
            disabled={transfer.isPending}
            className="h-10 w-full rounded-lg border-outline-variant text-sm font-semibold sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={!puedeConfirmar}
            className="h-10 w-full gap-1.5 rounded-lg text-sm font-bold sm:w-auto"
          >
            {transfer.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserCog className="size-4" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
