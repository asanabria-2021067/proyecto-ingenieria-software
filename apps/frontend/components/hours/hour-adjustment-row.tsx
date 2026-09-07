'use client';

import { useEffect, useId, useState } from 'react';
import { History, Loader2, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isDeltaCero, toDeltaHoras } from '@/hooks/use-hour-adjustments';
import type { AjusteHoraDTO, SprintClosingTramoDto, UpsertHourAdjustmentInput } from '@/lib/types/sprints';

export const JUSTIFICACION_AJUSTE_MAX = 5000;

export interface HourAdjustmentRowProps {
  tramo: SprintClosingTramoDto;
  /** Índice legible dentro de la tarea («Tramo 1», «Tramo 2»…). */
  indice: number;
  disabled?: boolean;
  pending?: boolean;
  /** Recibe el DTO ya convertido (`deltaHoras` con signo y 2 decimales). */
  onUpsert: (idAsignacion: number, input: UpsertHourAdjustmentInput) => void;
  onRevert: (idAsignacion: number) => void;
  /** Carga la cadena de ajustes bajo demanda; resuelve con el historial. */
  onLoadHistory?: (idAsignacion: number) => Promise<AjusteHoraDTO[]>;
  error?: string | null;
}

export function formatearDecimal(value: string): string {
  const negativo = value.trim().startsWith('-');
  const limpio = value.trim().replace(/^[+-]/, '');
  const [entera, decimal = ''] = limpio.split('.');
  const dec = decimal.replace(/0+$/, '');
  return `${negativo ? '-' : ''}${entera}${dec.length > 0 ? `.${dec}` : ''}`;
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
}

const ORIGEN_LABEL: Record<string, string> = {
  GRANULAR: 'Granular',
  LEGACY: 'Legacy',
  POR_CONCILIAR: 'Por conciliar',
};

/**
 * VIEW-03 (F002) — una fila de TRAMO: reportadas (lectura), «Horas
 * propuestas» (input absoluto), justificación, Guardar, Revertir y Ver
 * historial. Convierte el absoluto en `deltaHoras = propuestas − reportadas`
 * con signo y dos decimales. La justificación es obligatoria si el delta no
 * es cero. Un tramo `abierto:false` o un Sprint no operable se renderiza en
 * solo lectura.
 */
export function HourAdjustmentRow({
  tramo,
  indice,
  disabled = false,
  pending = false,
  onUpsert,
  onRevert,
  onLoadHistory,
  error,
}: HourAdjustmentRowProps) {
  const baseId = useId();
  const [propuestas, setPropuestas] = useState(formatearDecimal(tramo.propuestas));
  const [justificacion, setJustificacion] = useState(tramo.justificacionAjuste ?? '');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [historial, setHistorial] = useState<AjusteHoraDTO[] | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Cuando el resumen se refresca (tras guardar/revertir o por realtime),
  // el valor del servidor manda sobre el borrador local.
  useEffect(() => {
    setPropuestas(formatearDecimal(tramo.propuestas));
    setJustificacion(tramo.justificacionAjuste ?? '');
    setErrorLocal(null);
  }, [tramo.propuestas, tramo.justificacionAjuste]);

  const editable = tramo.abierto && !disabled;
  const propuestasNum = Number(propuestas);
  const propuestasValidas = propuestas.trim().length > 0 && Number.isFinite(propuestasNum) && propuestasNum >= 0;
  const delta = propuestasValidas ? toDeltaHoras(propuestasNum, tramo.reportadas) : '0.00';
  const deltaCero = isDeltaCero(delta);
  const requiereJustificacion = propuestasValidas && !deltaCero;
  const sinCambios =
    propuestasValidas &&
    toDeltaHoras(propuestasNum, tramo.reportadas) === (tramo.ajuste != null ? formatearSigno(tramo.ajuste) : '0.00') &&
    justificacion.trim() === (tramo.justificacionAjuste ?? '').trim();
  const puedeGuardar =
    editable && propuestasValidas && !pending && !sinCambios && (!requiereJustificacion || justificacion.trim().length > 0);

  const idPropuestas = `${baseId}-propuestas`;
  const idJustificacion = `${baseId}-justificacion`;
  const idError = `${baseId}-error`;
  const etiquetaTramo = `Tramo ${indice} · ${tramo.tituloTarea}`;

  const guardar = () => {
    if (!editable || !propuestasValidas) return;
    if (requiereJustificacion && justificacion.trim().length === 0) {
      setErrorLocal('La justificación es obligatoria cuando cambias las horas propuestas.');
      return;
    }
    setErrorLocal(null);
    onUpsert(tramo.idAsignacion, {
      deltaHoras: delta,
      ...(deltaCero ? {} : { justificacion: justificacion.trim() }),
    });
  };

  const verHistorial = async () => {
    if (historialAbierto) {
      setHistorialAbierto(false);
      return;
    }
    setHistorialAbierto(true);
    if (!onLoadHistory || historial != null) return;
    setCargandoHistorial(true);
    try {
      setHistorial(await onLoadHistory(tramo.idAsignacion));
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const mensajeError = error ?? errorLocal;
  const motivoNoEditable = !tramo.abierto
    ? 'Este tramo ya fue consolidado; no admite ajustes.'
    : 'El Sprint no admite ajustes en este momento.';

  return (
    <div
      className="grid grid-cols-1 gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(120px,auto)_minmax(0,1.6fr)_auto] lg:items-start"
      aria-label={etiquetaTramo}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block size-2.5 rounded-full ${tramo.abierto ? 'bg-primary' : 'bg-outline-variant'}`}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-on-surface">
            Tramo {indice} · <span className="font-normal text-on-surface-variant">{tramo.tituloTarea}</span>
          </p>
          {tramo.tareaEliminada && (
            <Badge variant="outline" className="text-[10px] text-tertiary">
              Tarea eliminada
            </Badge>
          )}
          {tramo.origen !== 'GRANULAR' && (
            <Badge variant="outline" className="text-[10px] text-tertiary">
              {ORIGEN_LABEL[tramo.origen] ?? tramo.origen}
            </Badge>
          )}
          {!tramo.abierto && (
            <Badge variant="outline" className="text-[10px] text-tertiary">
              Consolidado
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-tertiary">
          Reportadas: <span className="font-semibold text-on-surface">{formatearDecimal(tramo.reportadas)} h</span>
          {tramo.ajuste != null && (
            <>
              {' '}
              · Ajuste vigente:{' '}
              <span className="font-semibold text-on-surface">{formatearSigno(tramo.ajuste)} h</span>
            </>
          )}
        </p>
      </div>

      <div>
        <Label htmlFor={idPropuestas} className="text-xs font-semibold text-on-surface">
          Horas propuestas
        </Label>
        {editable ? (
          <Input
            id={idPropuestas}
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={propuestas}
            onChange={(e) => setPropuestas(e.target.value)}
            disabled={pending}
            aria-describedby={mensajeError ? idError : undefined}
            aria-invalid={mensajeError ? 'true' : undefined}
            className="mt-1 h-9 text-sm"
          />
        ) : (
          <p id={idPropuestas} className="mt-1 text-sm font-bold text-on-surface">
            {formatearDecimal(tramo.propuestas)} h
          </p>
        )}
      </div>

      <div>
        <Label htmlFor={idJustificacion} className="text-xs font-semibold text-on-surface">
          Justificación{requiereJustificacion && editable ? <span aria-hidden="true"> *</span> : null}
        </Label>
        {editable ? (
          <>
            <Textarea
              id={idJustificacion}
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              rows={2}
              maxLength={JUSTIFICACION_AJUSTE_MAX}
              disabled={pending}
              required={requiereJustificacion}
              aria-required={requiereJustificacion ? 'true' : undefined}
              placeholder={requiereJustificacion ? 'Explica el ajuste propuesto' : 'Sin ajuste'}
              className="mt-1 min-h-9 text-sm"
            />
            <div className="mt-1 flex items-start justify-between gap-2">
              {mensajeError ? (
                <p id={idError} role="alert" className="text-xs text-error">
                  {mensajeError}
                </p>
              ) : (
                <span />
              )}
              <span className="shrink-0 text-[11px] text-tertiary">
                {justificacion.length}/{JUSTIFICACION_AJUSTE_MAX}
              </span>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-on-surface-variant">{tramo.justificacionAjuste ?? '—'}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 lg:items-stretch">
        {editable ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={!puedeGuardar}
              onClick={guardar}
              aria-label={`Guardar ajuste — ${etiquetaTramo}`}
              className="h-9 w-full gap-1.5 rounded-md text-xs font-bold lg:w-auto"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-3.5" aria-hidden="true" />
              )}
              Guardar ajuste
            </Button>
            {tramo.ajuste != null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onRevert(tramo.idAsignacion)}
                aria-label={`Revertir — ${etiquetaTramo}`}
                className="h-9 w-full gap-1.5 rounded-md border-outline-variant text-xs font-semibold lg:w-auto"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Revertir
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex w-full rounded-md lg:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled
                      aria-label={`Revertir — ${etiquetaTramo}`}
                      className="h-9 w-full gap-1.5 rounded-md border-outline-variant text-xs font-semibold"
                    >
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                      Revertir
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>No hay ajuste vigente que revertir.</TooltipContent>
              </Tooltip>
            )}
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex w-full rounded-md lg:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-label={`Guardar ajuste — ${etiquetaTramo}`}
                  className="h-9 w-full gap-1.5 rounded-md border-outline-variant text-xs font-semibold"
                >
                  <Save className="size-3.5" aria-hidden="true" />
                  Guardar ajuste
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{motivoNoEditable}</TooltipContent>
          </Tooltip>
        )}
        {onLoadHistory && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={verHistorial}
            aria-expanded={historialAbierto}
            aria-controls={`${baseId}-historial`}
            aria-label={`Ver historial — ${etiquetaTramo}`}
            className="h-9 w-full gap-1.5 rounded-md border-primary/40 text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary lg:w-auto"
          >
            <History className="size-3.5" aria-hidden="true" />
            {historialAbierto ? 'Ocultar historial' : 'Ver historial'}
          </Button>
        )}
      </div>

      {historialAbierto && (
        <div id={`${baseId}-historial`} className="lg:col-span-4">
          {cargandoHistorial ? (
            <p className="text-xs text-tertiary">Cargando historial…</p>
          ) : historial == null || historial.length === 0 ? (
            <p className="text-xs italic text-tertiary">Este tramo no tiene ajustes registrados.</p>
          ) : (
            <ol className="space-y-1.5 border-l-2 border-outline-variant/40 pl-3">
              {historial.map((ajuste) => (
                <li key={ajuste.idAjusteHora} className="text-xs text-on-surface-variant">
                  <span className="font-semibold text-on-surface">
                    {formatearSigno(ajuste.deltaHoras)} h
                  </span>{' '}
                  (base {formatearDecimal(ajuste.horasBase)} h → {formatearDecimal(ajuste.propuesta)} h) ·{' '}
                  {formatearFechaHora(ajuste.creadoEn)}
                  {ajuste.vigente ? (
                    <Badge className="ml-2 border-transparent bg-primary/10 text-[10px] text-primary">Vigente</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2 text-[10px] text-tertiary">
                      Anulado
                    </Badge>
                  )}
                  {ajuste.justificacion && <p className="mt-0.5 whitespace-pre-wrap">{ajuste.justificacion}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Formatea un delta decimal conservando el signo (+/-), sin ceros de cola. */
export function formatearSigno(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  const sin = formatearDecimal(value.replace(/^\+/, ''));
  return num > 0 ? `+${sin}` : sin;
}
