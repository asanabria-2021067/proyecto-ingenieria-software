'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useStartSprint } from '@/hooks/use-project-sprints';
import { parseFechaSolo, toDateKey } from '@/lib/calendar/utils';

interface StartSprintButtonProps {
  idProyecto: number;
}

/** Horizonte máximo de planificación, igual al que valida el backend. */
export const SPRINT_PLAN_MAX_DIAS = 90;

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «6 oct 2026» a partir de un día `YYYY-MM-DD`, sin pasar por UTC. */
function formatDia(dia: string): string {
  const fecha = parseFechaSolo(dia);
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/** Día calendario local desplazado `dias` desde hoy, como `YYYY-MM-DD`. */
function diaDesdeHoy(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return toDateKey(fecha);
}

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

type Paso = 'planificacion' | 'confirmacion';

/**
 * Cambio de paso dentro del mismo diálogo: un fundido corto con 8 px de
 * desplazamiento en la dirección del avance (adelante hacia la confirmación,
 * atrás hacia el formulario). Solo transform/opacity, ease-out, 150 ms; con
 * `prefers-reduced-motion` la regla global lo deja en un corte seco.
 */
const PASO_ENTER_BASE = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 motion-safe:ease-out';
const PASO_ENTER_CONFIRM = `${PASO_ENTER_BASE} motion-safe:slide-in-from-right-2`;
const PASO_ENTER_FORM = `${PASO_ENTER_BASE} motion-safe:slide-in-from-left-2`;

/**
 * Acción del líder para iniciar el Sprint de trabajo desde el Tablero, en
 * dos pasos dentro del mismo diálogo: planificación (fecha esperada de
 * finalización, obligatoria) y confirmación. El Sprint se crea únicamente al
 * confirmar.
 *
 * La fecha de inicio se muestra solo como referencia: la fija el servidor en
 * el instante real de inicio y nunca viaja en la petición. La fecha esperada
 * de finalización es la del fin del trabajo, no el cierre formal (ese sigue
 * siendo Finalizar → Cerrar), y una vez iniciado el Sprint no puede cambiar.
 */
export function StartSprintButton({ idProyecto }: StartSprintButtonProps) {
  const startSprint = useStartSprint(idProyecto);
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState<Paso>('planificacion');
  const [fechaFinPlaneada, setFechaFinPlaneada] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);
  const confirmTitleRef = useRef<HTMLHeadingElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  // `isPending` de React Query se actualiza en el siguiente render: dos clics
  // en el mismo tick pasarían ambos. Este ref cierra esa ventana.
  const enviandoRef = useRef(false);

  // Los límites se calculan al abrir, para que un diálogo que cruza la
  // medianoche no quede con un «hoy» viejo.
  const [limites, setLimites] = useState(() => ({ hoy: diaDesdeHoy(0), min: diaDesdeHoy(1), max: diaDesdeHoy(SPRINT_PLAN_MAX_DIAS) }));

  const fechaValida =
    FORMATO_DIA.test(fechaFinPlaneada) && fechaFinPlaneada >= limites.min && fechaFinPlaneada <= limites.max;
  const fechaFueraDeRango = fechaFinPlaneada !== '' && !fechaValida;

  // Al cambiar de paso, el foco va al título del paso para que se anuncie el
  // cambio; al volver, directamente al campo que el usuario quiere revisar.
  useEffect(() => {
    if (!open) return;
    if (paso === 'confirmacion') confirmTitleRef.current?.focus();
    else fechaInputRef.current?.focus();
  }, [open, paso]);

  // Tras un error, el botón estuvo deshabilitado durante la petición y el foco
  // se perdió: vuelve a él en cuanto se reactiva, para leer el error en
  // contexto y poder reintentar.
  useEffect(() => {
    if (error && !startSprint.isPending) confirmButtonRef.current?.focus();
  }, [error, startSprint.isPending]);

  const abrir = () => {
    setLimites({ hoy: diaDesdeHoy(0), min: diaDesdeHoy(1), max: diaDesdeHoy(SPRINT_PLAN_MAX_DIAS) });
    setOpen(true);
  };

  /** Cerrar por Cancelar, Esc, X o clic fuera abandona el flujo entero. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (startSprint.isPending) return;
      setPaso('planificacion');
      setFechaFinPlaneada('');
      setError(null);
    }
    setOpen(next);
  };

  const continuar = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fechaValida) return;
    setError(null);
    setPaso('confirmacion');
  };

  const volverAlFormulario = () => {
    setError(null);
    setPaso('planificacion');
  };

  const confirmar = async () => {
    if (enviandoRef.current || !fechaValida) return;
    enviandoRef.current = true;
    setError(null);
    try {
      await startSprint.mutateAsync(fechaFinPlaneada);
      handleOpenChange(false);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'task', 'No se pudo iniciar el Sprint. Intenta de nuevo.'));
    } finally {
      enviandoRef.current = false;
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={abrir}
        className="gap-1.5 rounded-lg bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
      >
        Iniciar Sprint
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[96vw] max-w-[440px] gap-0 overscroll-contain border-outline-variant bg-surface-container-lowest p-0"
          onOpenAutoFocus={(event) => {
            // Radix enfocaría el primer control (la X); el foco útil es el campo.
            event.preventDefault();
            fechaInputRef.current?.focus();
          }}
        >
          {paso === 'planificacion' ? (
            <form
              onSubmit={continuar}
              noValidate
              data-paso="planificacion"
              className={PASO_ENTER_FORM}
            >
              <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
                <DialogTitle className="text-xl font-bold text-balance text-on-surface">Iniciar Sprint</DialogTitle>
                <DialogDescription className="text-sm text-on-surface-variant">
                  Define la planificación inicial del nuevo Sprint.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-6 py-5">
                <div>
                  <p id="sprint-fecha-inicio-label" className="text-xs font-semibold text-on-surface">
                    Fecha de inicio
                  </p>
                  <div
                    role="group"
                    aria-labelledby="sprint-fecha-inicio-label"
                    aria-describedby="sprint-fecha-inicio-ayuda"
                    data-slot="fecha-inicio"
                    className="mt-1 flex h-10 items-center gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface-variant"
                  >
                    <CalendarDays className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                    <span className="flex-1 tabular-nums">{formatDia(limites.hoy)}</span>
                    <Lock className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
                  </div>
                  <p id="sprint-fecha-inicio-ayuda" className="mt-1.5 text-xs text-tertiary">
                    Se establecerá automáticamente al iniciar el Sprint.
                  </p>
                </div>

                <div>
                  <label htmlFor="sprint-fecha-fin-planeada" className="text-xs font-semibold text-on-surface">
                    Fecha esperada de finalización <span aria-hidden="true">*</span>
                    <span className="sr-only">(obligatoria)</span>
                  </label>
                  <Input
                    ref={fechaInputRef}
                    id="sprint-fecha-fin-planeada"
                    name="fechaFinPlaneada"
                    type="date"
                    autoComplete="off"
                    required
                    min={limites.min}
                    max={limites.max}
                    value={fechaFinPlaneada}
                    aria-invalid={fechaFueraDeRango || undefined}
                    aria-describedby={`sprint-fecha-fin-ayuda${fechaFueraDeRango ? ' sprint-fecha-fin-error' : ''}`}
                    onChange={(event) => setFechaFinPlaneada(event.target.value)}
                    className={`mt-1 h-10 rounded-md ${fechaFueraDeRango ? 'border-error' : 'border-outline-variant'}`}
                  />
                  <p id="sprint-fecha-fin-ayuda" className="mt-1.5 text-xs text-tertiary">
                    Fecha en la que se espera terminar el trabajo del Sprint. El cierre formal puede realizarse
                    posteriormente.
                  </p>
                  {fechaFueraDeRango && (
                    <p id="sprint-fecha-fin-error" role="alert" className="mt-1.5 text-xs text-error">
                      Elige una fecha entre el {formatDia(limites.min)} y el {formatDia(limites.max)}.
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="h-10 rounded-md border-outline-variant text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={!fechaValida}
                  className="h-10 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
                >
                  Continuar
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div data-paso="confirmacion" className={PASO_ENTER_CONFIRM}>
              <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
                <DialogTitle
                  ref={confirmTitleRef}
                  tabIndex={-1}
                  className="rounded-sm text-xl font-bold text-balance text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  ¿Seguro que quieres iniciar este Sprint?
                </DialogTitle>
                <DialogDescription className="text-sm text-on-surface-variant">
                  Una vez iniciado, la planificación quedará registrada y las fechas no podrán modificarse
                  durante este Sprint.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 px-6 py-5">
                <dl className="grid grid-cols-1 gap-3 rounded-md border border-outline-variant/50 bg-surface-container-low p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">Fecha de inicio</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-on-surface">{formatDia(limites.hoy)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                      Fecha esperada de finalización
                    </dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-on-surface">{formatDia(fechaFinPlaneada)}</dd>
                  </div>
                </dl>

                {error && (
                  <p role="alert" className="rounded-md bg-status-error px-3 py-2 text-xs font-medium text-on-status-error">
                    {error}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={startSprint.isPending}
                  onClick={volverAlFormulario}
                  className="h-10 rounded-md border-outline-variant text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  ref={confirmButtonRef}
                  type="button"
                  disabled={startSprint.isPending}
                  aria-busy={startSprint.isPending || undefined}
                  onClick={confirmar}
                  className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
                >
                  {startSprint.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  {startSprint.isPending ? 'Iniciando…' : 'Sí, iniciar Sprint'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
