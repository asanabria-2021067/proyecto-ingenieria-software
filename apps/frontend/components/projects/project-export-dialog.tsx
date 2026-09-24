'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  DEFAULT_EXPORT_OPTIONS,
  FUENTE_OPCIONES,
  GRAFICA_OPCIONES,
  SECCION_OPCIONES,
  diaDeCreacion,
  erroresDeFechas,
  hoyLocal,
  validarOpciones,
  type ExportOptions,
  type FormatoExport,
} from '@/lib/export-options';

interface ProjectExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formato: FormatoExport;
  isPending: boolean;
  /** ISO de la creación del proyecto: el "Desde" no puede ser anterior. Sin ella no se pone mínimo. */
  fechaCreacionProyecto?: string | null;
  onConfirm: (opciones: ExportOptions) => void;
}

const LEGEND = 'mb-2 text-xs font-bold uppercase tracking-wide text-tertiary';
const OPCION = 'flex cursor-pointer items-center gap-2 text-sm text-on-surface';
const INPUT_FECHA =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface';

function alternar<T>(lista: T[], valor: T, activo: boolean): T[] {
  return activo ? [...lista, valor] : lista.filter((item) => item !== valor);
}

/**
 * Revisión del PR (HU-164): el usuario elige cómo sale el archivo. El PDF
 * ofrece tamaño de fuente, color de las tablas, qué datos incluir, rango de
 * fechas y gráficas (barras y pastel); el CSV solo el rango de fechas, ya que
 * el resto no le aplica. Las validaciones se muestran aquí, pero la
 * autoridad es el backend (un valor inválido allá es un 400).
 */
export function ProjectExportDialog({
  open,
  onOpenChange,
  formato,
  isPending,
  fechaCreacionProyecto = null,
  onConfirm,
}: ProjectExportDialogProps) {
  const [opciones, setOpciones] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const esPdf = formato === 'pdf';
  // "Hoy" se fija al abrir el diálogo: un diálogo abierto pasada la medianoche
  // seguiría con el día en que se abrió; el backend revalida de todos modos.
  const contexto = useMemo(
    () => ({ hoy: hoyLocal(), fechaCreacion: diaDeCreacion(fechaCreacionProyecto) }),
    [fechaCreacionProyecto],
  );
  const erroresFecha = erroresDeFechas(opciones, contexto);
  const error = validarOpciones(formato, opciones, contexto);
  const errorDatos = error && !erroresFecha.desde && !erroresFecha.hasta ? error : null;
  const sinMiembros = !opciones.secciones.includes('miembros');
  const etiqueta = esPdf ? 'PDF' : 'CSV';

  function confirmar() {
    if (error) {
      return;
    }
    onConfirm({ ...opciones, graficas: sinMiembros ? [] : opciones.graficas });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar {etiqueta}</DialogTitle>
          <DialogDescription>
            {esPdf
              ? 'Elige cómo quieres el reporte antes de descargarlo.'
              : 'Puedes limitar las horas del CSV a un rango de fechas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {esPdf && (
            <>
              <fieldset>
                <legend className={LEGEND}>Tamaño de fuente</legend>
                <div className="flex flex-wrap gap-4">
                  {FUENTE_OPCIONES.map(({ value, label }) => (
                    <label key={value} className={OPCION}>
                      <input
                        type="radio"
                        name="fuente"
                        value={value}
                        checked={opciones.fuente === value}
                        onChange={() => setOpciones({ ...opciones, fuente: value })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className={LEGEND}>Color de las tablas</legend>
                <ColorPicker value={opciones.color} onChange={(color) => setOpciones({ ...opciones, color })} />
                <p className="mt-1 text-xs text-tertiary">
                  El texto del encabezado cambia solo entre blanco y negro para que siempre se lea.
                </p>
              </fieldset>

              <fieldset>
                <legend className={LEGEND}>Datos a exportar</legend>
                <div className="space-y-1.5">
                  {SECCION_OPCIONES.map(({ value, label }) => (
                    <label key={value} className={OPCION}>
                      <input
                        type="checkbox"
                        checked={opciones.secciones.includes(value)}
                        onChange={(e) =>
                          setOpciones({
                            ...opciones,
                            secciones: alternar(opciones.secciones, value, e.target.checked),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className={LEGEND}>Gráficas</legend>
                <div className="space-y-1.5">
                  {GRAFICA_OPCIONES.map(({ value, label }) => (
                    <label key={value} className={`${OPCION} ${sinMiembros ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={sinMiembros}
                        checked={!sinMiembros && opciones.graficas.includes(value)}
                        onChange={(e) =>
                          setOpciones({
                            ...opciones,
                            graficas: alternar(opciones.graficas, value, e.target.checked),
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {sinMiembros && (
                  <p className="mt-1 text-xs text-tertiary">
                    Las gráficas salen de “Miembros y horas”; actívalo para poder elegirlas.
                  </p>
                )}
              </fieldset>
            </>
          )}

          <fieldset>
            <legend className={LEGEND}>Rango de fechas (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { campo: 'desde', etiqueta: 'Desde' },
                  { campo: 'hasta', etiqueta: 'Hasta' },
                ] as const
              ).map(({ campo, etiqueta }) => (
                <div key={campo} className="space-y-1">
                  <label className="block space-y-1 text-sm text-on-surface">
                    <span>{etiqueta}</span>
                    <input
                      type="date"
                      className={`${INPUT_FECHA} ${erroresFecha[campo] ? 'border-error' : ''}`}
                      value={opciones[campo]}
                      min={contexto.fechaCreacion ?? undefined}
                      max={contexto.hoy}
                      aria-invalid={erroresFecha[campo] ? true : undefined}
                      aria-describedby={erroresFecha[campo] ? `error-${campo}` : undefined}
                      onChange={(e) => setOpciones({ ...opciones, [campo]: e.target.value })}
                    />
                  </label>
                  {erroresFecha[campo] && (
                    <p id={`error-${campo}`} role="alert" className="text-xs font-medium text-error">
                      {erroresFecha[campo]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-tertiary">
              Limita las horas y los Sprints a ese periodo. Sin fechas se exporta todo el proyecto.
            </p>
          </fieldset>

          {errorDatos && (
            <p role="alert" className="text-xs font-medium text-error">
              {errorDatos}
            </p>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={isPending || error !== null}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {isPending ? 'Generando…' : `Descargar ${etiqueta}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
