'use client';

import { useId, useMemo, useState } from 'react';
import { Calendar, Clock, History, Hourglass, Loader2, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OverestimationNotice } from '@/components/hours/overestimation-notice';
import { TimeRecordActions } from '@/components/hours/time-record-actions';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { crossesEstimate, useTaskHours } from '@/hooks/use-task-hours';
import uvgSwal, { swalCustomClass } from '@/lib/swal';
import type { RegistroTiempoTareaDTO, TaskHoursSummaryDTO } from '@/lib/types/tasks';

export interface TaskHoursSectionProps {
  idProyecto: number;
  idTarea: number;
  /** Id del usuario autenticado: solo para marcar «Propio»; los permisos vienen del servidor. */
  idUsuarioActual: number | null;
  enabled?: boolean;
}

const NO_CREAR_REASON =
  'No puedes registrar horas en esta tarea ahora: necesitas la asignación activa y un Sprint activo.';

function getInitials(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

function formatearFecha(fecha: string): string {
  return new Date(`${fecha}T00:00:00.000Z`).toLocaleDateString('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Los importes del resumen llegan como string decimal: se formatean sin operar en punto flotante. */
function formatearDecimal(value: string): string {
  const [entera, decimal = ''] = value.split('.');
  const dec = decimal.replace(/0+$/, '');
  return dec.length > 0 ? `${entera}.${dec}` : entera;
}

function formatearHorasNumero(horas: number): string {
  return horas.toLocaleString('es-GT', { maximumFractionDigits: 2 });
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function esNegativo(value: string): boolean {
  return value.trim().startsWith('-');
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: 'default' | 'negative';
}) {
  const negative = tone === 'negative';
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        negative
          ? 'border-error/30 bg-error/10'
          : 'border-outline-variant/40 bg-surface-container-lowest'
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          negative ? 'bg-error/15 text-error' : 'bg-primary/10 text-primary'
        }`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-tertiary">{label}</p>
        <p className={`text-base font-bold leading-tight ${negative ? 'text-error' : 'text-on-surface'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function KpiRow({ resumen }: { resumen: TaskHoursSummaryDTO }) {
  const sinEstimacion = resumen.estimacion == null;
  const restantes = resumen.restantes;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen de horas de la tarea">
      <Kpi
        icon={Calendar}
        label="Estimación"
        value={sinEstimacion ? '—' : `${formatearHorasNumero(resumen.estimacion as number)} h`}
      />
      <Kpi icon={Clock} label="Reportadas" value={`${formatearDecimal(resumen.horasReportadasTarea)} h`} />
      <Kpi
        icon={Hourglass}
        label="Restantes"
        value={restantes == null ? '—' : `${formatearDecimal(restantes)} h`}
        tone={restantes != null && esNegativo(restantes) ? 'negative' : 'default'}
      />
      {/* Lo reportado por encima de la estimación. Sin estimación no hay
          umbral que exceder, así que es `null` («—»), no un cero. El origen
          legacy de las horas ya se distingue en el cierre del Sprint, donde
          sí decide algo; aquí solo restaba espacio a lo que el líder revisa. */}
      <Kpi
        icon={TrendingUp}
        label="Horas sobreestimadas"
        value={resumen.sobreEstimacion == null ? '—' : `${formatearDecimal(resumen.sobreEstimacion)} h`}
        tone={resumen.sobreEstimacion != null && Number(resumen.sobreEstimacion) > 0 ? 'negative' : 'default'}
      />
    </div>
  );
}

// ─── Formulario (registrar / editar) ─────────────────────────────────────────
interface FormState {
  horas: string;
  fecha: string;
  nota: string;
  justificacion: string;
}

function emptyForm(): FormState {
  return { horas: '', fecha: hoyISO(), nota: '', justificacion: '' };
}

function formFromRecord(record: RegistroTiempoTareaDTO): FormState {
  return { horas: String(record.horas), fecha: record.fecha, nota: record.nota ?? '', justificacion: '' };
}

// ─── Sección ─────────────────────────────────────────────────────────────────
/**
 * VIEW-04 (F001) — «Horas de la tarea»: KPIs del resumen autoritativo,
 * aviso de exceso SOLO cuando la operación cruza la estimación, formulario
 * en línea (registrar / editar) y tabla de registros con acciones propias.
 * Los tres flags del servidor gobiernan la UI; nada se infiere localmente.
 */
export function TaskHoursSection({ idProyecto, idTarea, idUsuarioActual, enabled = true }: TaskHoursSectionProps) {
  const baseId = useId();
  const { registros, resumen, isLoading, isError, error, refetch, registrar, editar, revocar } = useTaskHours(
    idProyecto,
    idTarea,
    enabled,
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editando, setEditando] = useState<RegistroTiempoTareaDTO | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [errorJustificacion, setErrorJustificacion] = useState<string | null>(null);
  const [revocandoId, setRevocandoId] = useState<number | null>(null);
  const [errorRevocar, setErrorRevocar] = useState<string | null>(null);

  const horasNumericas = Number(form.horas);
  const horasValidas = form.horas.trim().length > 0 && Number.isFinite(horasNumericas) && horasNumericas > 0;

  // Delta que introduce la operación en curso sobre el total de la tarea.
  const delta = useMemo(() => {
    if (!horasValidas) return 0;
    return editando ? horasNumericas - editando.horas : horasNumericas;
  }, [editando, horasNumericas, horasValidas]);

  const cruzaEstimacion =
    resumen != null && horasValidas && crossesEstimate(resumen.horasReportadasTarea, delta, resumen.estimacion);

  const totalDespues = resumen ? Number(resumen.horasReportadasTarea) + delta : 0;

  const puedeCrear = resumen?.puedeCrear ?? false;
  const puedeEditar = resumen?.puedeEditar ?? false;
  const puedeRevocar = resumen?.puedeRevocar ?? false;
  const modoEdicion = editando != null;
  const formularioHabilitado = modoEdicion ? puedeEditar : puedeCrear;

  const mutationActiva = modoEdicion ? editar : registrar;
  const pending = registrar.isPending || editar.isPending;

  const puedeEnviar =
    formularioHabilitado &&
    horasValidas &&
    form.fecha.length > 0 &&
    (!cruzaEstimacion || form.justificacion.trim().length > 0) &&
    !pending;

  const resetForm = () => {
    setForm(emptyForm());
    setEditando(null);
    setErrorLocal(null);
    setErrorJustificacion(null);
    registrar.reset();
    editar.reset();
  };

  const iniciarEdicion = (record: RegistroTiempoTareaDTO) => {
    setEditando(record);
    setForm(formFromRecord(record));
    setErrorLocal(null);
    setErrorJustificacion(null);
    registrar.reset();
    editar.reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formularioHabilitado || !horasValidas) return;
    if (cruzaEstimacion && form.justificacion.trim().length === 0) {
      setErrorJustificacion('Debes justificar el exceso sobre la estimación.');
      return;
    }
    setErrorJustificacion(null);
    setErrorLocal(null);

    const nota = form.nota.trim();
    const justificacion = cruzaEstimacion ? { justificacionExceso: form.justificacion.trim() } : {};

    if (editando) {
      const notaOriginal = editando.nota ?? '';
      const notaCampo =
        nota === notaOriginal.trim()
          ? {}
          : nota.length === 0
            ? { nota: null }
            : { nota };
      editar.mutate(
        {
          idRegistro: editando.idRegistroTiempo,
          input: { horas: horasNumericas, fecha: form.fecha, ...notaCampo, ...justificacion },
        },
        { onSuccess: resetForm },
      );
      return;
    }

    registrar.mutate(
      { horas: horasNumericas, fecha: form.fecha, ...(nota ? { nota } : {}), ...justificacion },
      { onSuccess: resetForm },
    );
  };

  const confirmarRevocar = async (record: RegistroTiempoTareaDTO) => {
    const result = await uvgSwal.fire({
      icon: 'warning',
      title: '¿Revocar este registro?',
      text: `Se retirarán ${formatearHorasNumero(record.horas)} h del ${formatearFecha(record.fecha)}. Esta acción no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: 'Revocar',
      cancelButtonText: 'Cancelar',
      customClass: {
        ...swalCustomClass,
        confirmButton:
          'rounded-xl bg-error px-5 py-2 text-xs font-bold text-on-error hover:bg-error/90 transition-all shadow-md mx-4',
      },
    });
    if (!result.isConfirmed) return;
    setErrorRevocar(null);
    setRevocandoId(record.idRegistroTiempo);
    revocar.mutate(
      { idRegistro: record.idRegistroTiempo },
      {
        onError: (err) => setErrorRevocar(getApiErrorMessage(err, 'hours')),
        onSettled: () => setRevocandoId(null),
      },
    );
  };

  // 404 al editar/registrar: el registro o tramo desapareció → vaciar y recargar.
  const mutationError = mutationActiva.isError ? mutationActiva.error : null;
  const mutationStatus = getApiErrorStatus(mutationError);
  const mensajeMutation = mutationError ? getApiErrorMessage(mutationError, 'hours') : errorLocal;
  const accionTerminal = mutationStatus === 403;

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Cargando horas de la tarea">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-28 rounded-md" />
      </div>
    );
  }

  if (isError || !resumen) {
    const status = getApiErrorStatus(error);
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-error">
          {status === 403
            ? 'No tienes acceso a las horas de esta tarea.'
            : 'No fue posible cargar las horas de la tarea.'}
        </p>
        {status !== 403 && (
          <Button type="button" variant="outline" size="sm" onClick={refetch} className="h-8 text-xs font-semibold">
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  const idHoras = `${baseId}-horas`;
  const idFecha = `${baseId}-fecha`;
  const idNota = `${baseId}-nota`;
  const idJustificacion = `${baseId}-justificacion`;

  const botonEnviar = (
    <Button
      type="submit"
      size="sm"
      disabled={!puedeEnviar}
      className="h-9 w-full gap-1.5 rounded-md text-xs font-bold sm:w-auto"
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {modoEdicion ? (pending ? 'Guardando...' : 'Guardar cambios') : pending ? 'Registrando...' : 'Registrar'}
    </Button>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-tertiary">
        Las horas registradas aquí corresponden únicamente a esta tarea y serán consideradas en el cierre del
        Sprint.
      </p>

      <KpiRow resumen={resumen} />

      {cruzaEstimacion && resumen.estimacion != null && (
        <OverestimationNotice
          id={idJustificacion}
          estimacion={resumen.estimacion}
          despues={totalDespues}
          value={form.justificacion}
          onChange={(value) => {
            setForm((f) => ({ ...f, justificacion: value }));
            if (value.trim()) setErrorJustificacion(null);
          }}
          error={errorJustificacion}
          disabled={pending}
        />
      )}

      <form
        onSubmit={handleSubmit}
        aria-label={modoEdicion ? 'Editar registro de horas' : 'Registrar horas'}
        className="space-y-3 rounded-md border border-outline-variant/40 p-3"
      >
        {modoEdicion && (
          <p className="text-xs font-semibold text-on-surface">
            Editando el registro del {formatearFecha(editando.fecha)} ({formatearHorasNumero(editando.horas)} h)
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,180px)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor={idHoras} className="text-xs font-semibold text-on-surface">
              Horas
            </Label>
            <Input
              id={idHoras}
              type="number"
              step="0.01"
              inputMode="decimal"
              min={0.01}
              placeholder="1.5"
              value={form.horas}
              onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))}
              disabled={!formularioHabilitado || pending}
              aria-invalid={mutationStatus === 400 ? 'true' : undefined}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor={idFecha} className="text-xs font-semibold text-on-surface">
              Fecha
            </Label>
            <Input
              id={idFecha}
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              disabled={!formularioHabilitado || pending}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor={idNota} className="text-xs font-semibold text-on-surface">
              Nota
            </Label>
            <Textarea
              id={idNota}
              value={form.nota}
              onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))}
              placeholder="Nota (opcional)"
              rows={1}
              disabled={!formularioHabilitado || pending}
              className="mt-1 min-h-9 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {modoEdicion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetForm}
                disabled={pending}
                className="h-9 w-full rounded-md text-xs font-semibold sm:w-auto"
              >
                Cancelar
              </Button>
            )}
            {formularioHabilitado ? (
              botonEnviar
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex w-full rounded-md sm:w-auto">
                    {botonEnviar}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{NO_CREAR_REASON}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {mensajeMutation && (
          <p role="alert" className="text-xs text-error">
            {mensajeMutation}
            {mutationStatus === 404 && (
              <>
                {' '}
                <button type="button" onClick={() => { refetch(); resetForm(); }} className="font-semibold underline underline-offset-2">
                  Actualizar
                </button>
              </>
            )}
            {mutationStatus === 409 && (
              <>
                {' '}
                <button type="button" onClick={() => { refetch(); mutationActiva.reset(); }} className="font-semibold underline underline-offset-2">
                  Actualizar
                </button>
              </>
            )}
          </p>
        )}
        {accionTerminal && (
          <p className="text-[11px] text-tertiary">
            Los permisos cambiaron; recarga la información para ver tu estado actual.
          </p>
        )}
      </form>

      {errorRevocar && (
        <p role="alert" className="text-xs text-error">
          {errorRevocar}
        </p>
      )}

      {registros.length === 0 ? (
        <p className="text-sm italic text-tertiary">Aún no hay horas registradas en esta tarea.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-outline-variant/40">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-surface-container-low text-[11px] font-semibold uppercase tracking-wide text-tertiary">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Usuario</th>
                <th scope="col" className="px-3 py-2 text-left">Fecha</th>
                <th scope="col" className="px-3 py-2 text-left">Horas</th>
                <th scope="col" className="px-3 py-2 text-left">Nota</th>
                <th scope="col" className="px-3 py-2 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {registros.map((registro) => {
                const propio = idUsuarioActual != null && registro.idUsuario === idUsuarioActual;
                // Un registro revocado solo llega a quien lee el histórico
                // (líder/administración): se muestra como traza, no se opera.
                const revocado = registro.revocadoEn != null;
                return (
                  <tr key={registro.idRegistroTiempo} className="align-middle">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <Avatar className="size-6">
                          {registro.usuario.fotoUrl && <AvatarImage src={registro.usuario.fotoUrl} alt="" />}
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {getInitials(registro.usuario.nombre, registro.usuario.apellido)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-on-surface">
                          {registro.usuario.nombre} {registro.usuario.apellido}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-on-surface-variant">
                      {formatearFecha(registro.fecha)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-bold text-on-surface">
                      <span className={revocado ? 'text-tertiary line-through' : undefined}>
                        {formatearHorasNumero(registro.horas)} h
                      </span>
                      {revocado && (
                        <Badge variant="outline" className="ml-2 text-[10px] font-semibold text-tertiary">
                          Revocado
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-xs text-on-surface-variant">
                      {registro.nota ? (
                        <span className="line-clamp-2 whitespace-pre-wrap break-words">{registro.nota}</span>
                      ) : (
                        <span aria-label="Sin nota">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {propio && !revocado ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge className="border-transparent bg-primary/10 text-[10px] font-semibold text-primary">
                            Propio
                          </Badge>
                          <TimeRecordActions
                            record={registro}
                            puedeEditar={puedeEditar}
                            puedeRevocar={puedeRevocar}
                            onEdit={iniciarEdicion}
                            onRevoke={confirmarRevocar}
                            revoking={revocandoId === registro.idRegistroTiempo}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resumen.tramos.some((t) => t.justificaciones.length > 0) && (
        <div className="space-y-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
            <History className="size-3.5 text-tertiary" aria-hidden="true" />
            Justificaciones de exceso
          </h3>
          <ul className="space-y-1">
            {resumen.tramos.flatMap((tramo) =>
              tramo.justificaciones.map((justificacion, index) => (
                <li
                  key={`${tramo.idAsignacion}-${index}`}
                  className="rounded-md bg-amber-400/10 px-3 py-2 text-xs text-on-surface-variant"
                >
                  <span className="font-semibold text-on-surface">
                    {tramo.usuario.nombre} {tramo.usuario.apellido}:
                  </span>{' '}
                  {justificacion}
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
