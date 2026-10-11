'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  const [errorLocal, setErrorLocal] = useState<{ field: 'propuestas' | 'justificacion'; message: string } | null>(null);
  // El panel del líder no está abierto de entrada: la fila se lee primero
  // (lo que hizo el estudiante) y solo se ajusta cuando se pide explícitamente.
  const [ajustando, setAjustando] = useState(false);
  const [historial, setHistorial] = useState<AjusteHoraDTO[] | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Cuando el resumen se refresca (tras guardar/revertir o por realtime),
  // el valor del servidor manda sobre el borrador local.
  useEffect(() => {
    setPropuestas(formatearDecimal(tramo.propuestas));
    setJustificacion(tramo.justificacionAjuste ?? '');
    setErrorLocal(null);
    setAjustando(false);
  }, [tramo.propuestas, tramo.justificacionAjuste]);

  // Contrato backend (task-hour-adjustments.service.ts): solo se ajusta un tramo
  // ya CERRADO (desasignadaEn ≠ null → `abierto:false`), con participación
  // resuelta y todavía no consumido por un cierre (`reconocidoEn` null).
  // Un tramo abierto lo cierra su integrante; el líder no lo ajusta.
  const consumido = tramo.reconocidoEn != null;
  const ajustable = !tramo.abierto && tramo.idParticipacion != null && !consumido;
  const editable = ajustable && !disabled;
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
    editable && !pending && !sinCambios;

  const idPropuestas = `${baseId}-propuestas`;
  const idJustificacion = `${baseId}-justificacion`;
  const idError = `${baseId}-error`;
  const etiquetaTramo = `Tramo ${indice} · ${tramo.tituloTarea}`;

  // Sin estimación no hay exceso que medir, y sin exceso el estudiante no
  // tenía nada que justificar: en ambos casos la pregunta NO APLICA, que es
  // distinto de «cero» o de «lo dejó vacío».
  const hayExceso = Number(tramo.exceso) > 0;
  const tieneAjuste = tramo.ajuste != null;
  const NO_APLICA = 'No aplica';

  const abrirAjuste = () => {
    setPropuestas(formatearDecimal(tramo.propuestas));
    setJustificacion(tramo.justificacionAjuste ?? '');
    setErrorLocal(null);
    setAjustando(true);
  };

  const cancelarAjuste = () => {
    setPropuestas(formatearDecimal(tramo.propuestas));
    setJustificacion(tramo.justificacionAjuste ?? '');
    setErrorLocal(null);
    setAjustando(false);
  };

  const guardar = () => {
    if (!editable) return;
    if (!propuestasValidas) {
      setErrorLocal({ field: 'propuestas', message: 'Ingresa una cantidad de horas válida, igual o mayor que cero.' });
      return;
    }
    if (!/^-?\d{1,10}\.\d{2}$/.test(delta)) {
      setErrorLocal({ field: 'propuestas', message: 'La cantidad de horas es demasiado grande.' });
      return;
    }
    if (requiereJustificacion && justificacion.trim().length === 0) {
      setErrorLocal({ field: 'justificacion', message: 'La justificación es obligatoria cuando cambias las horas propuestas.' });
      return;
    }
    if (justificacion.trim().length > JUSTIFICACION_AJUSTE_MAX) {
      setErrorLocal({ field: 'justificacion', message: 'La justificación no puede exceder 5000 caracteres.' });
      return;
    }
    setErrorLocal(null);
    setAjustando(false);
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

  const errorPropuestas = errorLocal?.field === 'propuestas' ? errorLocal.message : null;
  const errorJustificacion = error ?? (errorLocal?.field === 'justificacion' ? errorLocal.message : null);
  const motivoNoEditable = tramo.abierto
    ? 'Este tramo sigue abierto: el integrante debe cerrarlo antes de que puedas ajustar sus horas.'
    : consumido
      ? 'Este tramo ya fue acreditado en un cierre; no admite ajustes.'
      : tramo.idParticipacion == null
        ? 'Este tramo no tiene participación histórica resuelta; no admite ajustes.'
        : 'El Sprint no admite ajustes en este momento.';

  // Cada dato va arriba cuando aplica y, si «No aplica», baja al detalle
  // secundario: así la fila enseña primero lo que hay que leer sin perder nada.
  const campos: { label: string; aplica: boolean; valor: React.ReactNode; ancho?: boolean; tono?: string }[] = [
    {
      label: 'Horas sobreestimadas',
      aplica: hayExceso,
      valor: `${formatearDecimal(tramo.exceso)} h`,
      tono: 'text-attention-strong dark:text-attention',
    },
    {
      label: 'Horas aceptadas',
      aplica: tieneAjuste,
      valor: `${formatearDecimal(tramo.propuestas)} h`,
    },
    {
      label: 'Justificación',
      aplica: hayExceso,
      valor: tramo.justificacionExceso ?? 'Sin justificación del estudiante',
      ancho: true,
    },
    {
      label: 'Justificación del líder',
      aplica: tieneAjuste,
      valor: tramo.justificacionAjuste ?? 'Sin justificación',
      ancho: true,
    },
  ];
  const cifrasAplicables = campos.filter((c) => c.aplica && !c.ancho);
  const textosAplicables = campos.filter((c) => c.aplica && c.ancho);
  const noAplican = campos.filter((c) => !c.aplica);
  const ACCION = 'text-xs font-semibold';

  return (
    <div className="flex flex-col gap-inline py-stack first:pt-0 last:pb-0" aria-label={etiquetaTramo}>
      <div className="flex flex-col gap-tight sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-tight">
          <p className="type-body font-semibold text-text-primary">Tramo {indice}</p>
          {tramo.abierto ? (
            <span className="pill pill-sm pill-amber">Abierto · pendiente de cierre</span>
          ) : consumido ? (
            <span className="pill pill-sm pill-neutral">Acreditado</span>
          ) : (
            <span className="pill pill-sm pill-neutral">Tramo cerrado</span>
          )}
          {tramo.tareaEliminada && <span className="pill pill-sm pill-subtle">Tarea eliminada</span>}
          {tramo.origen !== 'GRANULAR' && (
            <span className="pill pill-sm pill-subtle">{ORIGEN_LABEL[tramo.origen] ?? tramo.origen}</span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-tight">
          {!editable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex rounded-md">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    aria-label={`Ajustar — ${etiquetaTramo}`}
                    className={ACCION}
                  >
                    Ajustar
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{motivoNoEditable}</TooltipContent>
            </Tooltip>
          ) : !ajustando ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={abrirAjuste}
              aria-expanded={false}
              aria-label={`${tieneAjuste ? 'Editar ajuste' : 'Ajustar'} — ${etiquetaTramo}`}
              className={ACCION}
            >
              {tieneAjuste ? 'Editar ajuste' : 'Ajustar'}
            </Button>
          ) : null}

          {editable && tieneAjuste && !ajustando && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => onRevert(tramo.idAsignacion)}
              aria-label={`Revertir — ${etiquetaTramo}`}
              className={`${ACCION} text-text-secondary hover:text-text-primary`}
            >
              Revertir
            </Button>
          )}

          {onLoadHistory && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={verHistorial}
              aria-expanded={historialAbierto}
              aria-controls={`${baseId}-historial`}
              aria-label={`Ver historial — ${etiquetaTramo}`}
              className={`${ACCION} text-text-secondary hover:text-text-primary`}
            >
              {historialAbierto ? 'Ocultar historial' : 'Ver historial'}
            </Button>
          )}
        </div>
      </div>

      {/* Lo que hizo el estudiante: solo lectura. El líder no reescribe su
          registro; propone un ajuste aparte. */}
      <dl className="grid grid-cols-2 gap-x-card gap-y-tight sm:grid-cols-4">
        <div>
          <dt className="type-meta">Horas reportadas</dt>
          <dd className="mt-micro type-body font-semibold tabular-nums text-text-primary">
            {formatearDecimal(tramo.reportadas)} h
          </dd>
        </div>
        <div>
          <dt className="type-meta">Horas totales hechas</dt>
          <dd className="mt-micro type-body font-semibold tabular-nums text-primary">{formatearDecimal(tramo.propuestas)} h</dd>
        </div>
        {tieneAjuste && tramo.ajuste != null && (
          <div>
            <dt className="type-meta">Ajuste vigente</dt>
            <dd className="mt-micro type-body font-semibold tabular-nums text-text-primary">{formatearSigno(tramo.ajuste)} h</dd>
          </div>
        )}
        {cifrasAplicables.map((campo) => (
          <div key={campo.label}>
            <dt className="type-meta">{campo.label}</dt>
            <dd className={`mt-micro type-body font-semibold tabular-nums ${campo.tono ?? 'text-text-primary'}`}>{campo.valor}</dd>
          </div>
        ))}
        {textosAplicables.map((campo) => (
          <div key={campo.label} className="col-span-2 sm:col-span-4">
            <dt className="type-meta">{campo.label}</dt>
            <dd className="mt-micro type-body whitespace-pre-wrap break-words text-text-secondary">{campo.valor}</dd>
          </div>
        ))}
      </dl>

      {noAplican.length > 0 && (
        <details className="group">
          <summary className="type-meta w-fit cursor-pointer rounded-sm font-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary/40">
            Más detalles
          </summary>
          <dl className="mt-tight grid grid-cols-2 gap-x-card gap-y-tight sm:grid-cols-4">
            {noAplican.map((campo) => (
              <div key={campo.label} className={campo.ancho ? 'col-span-2' : undefined}>
                <dt className="type-meta">{campo.label}</dt>
                <dd className="mt-micro type-body text-text-secondary">{NO_APLICA}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {/* Panel del líder: solo tras pedir «Ajustar». */}
      {ajustando && editable && (
        <div className="grid grid-cols-1 gap-inline rounded-control bg-surface-container-low p-inline sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
          <div>
            <Label htmlFor={idPropuestas} className="text-xs font-semibold text-on-surface">
              Horas aceptadas
            </Label>
            <Input
              id={idPropuestas}
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              value={propuestas}
              onChange={(e) => {
                setPropuestas(e.target.value);
                setErrorLocal(null);
              }}
              disabled={pending}
              autoFocus
              aria-describedby={errorPropuestas ? `${idError}-propuestas` : undefined}
              aria-invalid={errorPropuestas ? 'true' : undefined}
              className="mt-1 h-9 bg-surface-container-lowest text-sm"
            />
            {errorPropuestas && <p id={`${idError}-propuestas`} role="alert" className="mt-1 text-xs text-error">{errorPropuestas}</p>}
          </div>
          <div>
            <Label htmlFor={idJustificacion} className="text-xs font-semibold text-on-surface">
              Justificación del líder{requiereJustificacion ? <span aria-hidden="true"> *</span> : null}
            </Label>
            <Textarea
              id={idJustificacion}
              value={justificacion}
              onChange={(e) => {
                setJustificacion(e.target.value);
                setErrorLocal(null);
              }}
              rows={2}
              maxLength={JUSTIFICACION_AJUSTE_MAX}
              disabled={pending}
              required={requiereJustificacion}
              aria-required={requiereJustificacion ? 'true' : undefined}
              aria-invalid={errorJustificacion ? 'true' : undefined}
              aria-describedby={errorJustificacion ? idError : undefined}
              placeholder={requiereJustificacion ? 'Explica el ajuste propuesto' : 'Sin ajuste'}
              className="mt-1 min-h-9 bg-surface-container-lowest text-sm"
            />
            <div className="mt-1 flex items-start justify-between gap-2">
              {errorJustificacion ? (
                <p id={idError} role="alert" className="text-xs text-error">
                  {errorJustificacion}
                </p>
              ) : (
                <span />
              )}
              <span className="shrink-0 text-[11px] text-tertiary">
                {justificacion.length}/{JUSTIFICACION_AJUSTE_MAX}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-tight sm:col-span-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={cancelarAjuste}
              aria-label={`Cancelar ajuste — ${etiquetaTramo}`}
              className={ACCION}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!puedeGuardar}
              onClick={guardar}
              aria-label={`Guardar ajuste — ${etiquetaTramo}`}
              className={`${ACCION} bg-primary text-on-primary hover:bg-primary/90`}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Guardar ajuste
            </Button>
          </div>
        </div>
      )}

      {/* El error del servidor (400) también se ve con el panel cerrado. */}
      {!ajustando && error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      {historialAbierto && (
        <div id={`${baseId}-historial`}>
          {cargandoHistorial ? (
            <p className="type-meta">Cargando historial…</p>
          ) : historial == null || historial.length === 0 ? (
            <p className="type-meta italic">Este tramo no tiene ajustes registrados.</p>
          ) : (
            <ol className="space-y-1.5 border-l-2 border-outline-variant/40 pl-3">
              {historial.map((ajuste) => (
                <li key={ajuste.idAjusteHora} className="text-xs text-on-surface-variant">
                  <span className="font-semibold text-on-surface">
                    {formatearSigno(ajuste.deltaHoras)} h
                  </span>{' '}
                  (base {formatearDecimal(ajuste.horasBase)} h → {formatearDecimal(ajuste.propuesta)} h) ·{' '}
                  {formatearFechaHora(ajuste.creadoEn)}
                  <span className={`pill pill-sm ml-2 ${ajuste.vigente ? 'pill-green' : 'pill-subtle'}`}>
                    {ajuste.vigente ? 'Vigente' : 'Anulado'}
                  </span>
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
