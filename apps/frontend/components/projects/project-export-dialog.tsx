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
import { Button } from '@/components/ui/button';
import { FormStepper } from '@/components/ui/form-stepper';
import { hexToRgb } from '@/lib/color';
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
const BOTON_SECUNDARIO =
  'inline-flex items-center justify-center rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-60';

/** Pasos del PDF; el CSV solo ofrece el rango de fechas y no usa pasos. */
const PASOS_PDF = ['Qué incluir', 'Rango de fechas', 'Apariencia', 'Vista previa'] as const;
const PASO_DATOS = 0;
const PASO_FECHAS = 1;
const PASO_VISTA_PREVIA = PASOS_PDF.length - 1;

function alternar<T>(lista: T[], valor: T, activo: boolean): T[] {
  return activo ? [...lista, valor] : lista.filter((item) => item !== valor);
}

/** Blanco o negro según el brillo del color, igual que el encabezado de las tablas del PDF. */
function textoSobre(hex: string): string {
  const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
}

function diaLegible(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Revisión del PR (HU-164): el usuario elige cómo sale el archivo. El PDF se
 * arma por pasos (qué incluir, rango de fechas, apariencia y vista previa); el
 * CSV solo ofrece el rango de fechas, ya que el resto no le aplica. Las
 * validaciones se muestran aquí, pero la autoridad es el backend (un valor
 * inválido allá es un 400).
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
  const [paso, setPaso] = useState(0);
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
  const pasoActual = esPdf ? paso : PASO_FECHAS;
  const ultimo = !esPdf || paso === PASO_VISTA_PREVIA;
  // Cada paso solo se deja avanzar si lo que contiene es válido.
  const pasoInvalido = pasoActual === PASO_DATOS ? errorDatos !== null : pasoActual === PASO_FECHAS ? error !== null : false;
  const graficasFinales = sinMiembros ? [] : opciones.graficas;

  function confirmar() {
    if (error) {
      return;
    }
    onConfirm({ ...opciones, graficas: graficasFinales });
  }

  const panelDatos = (
    <div className="space-y-5">
      <fieldset>
        <legend className={LEGEND}>Datos a exportar</legend>
        <div className="space-y-1.5">
          {SECCION_OPCIONES.map(({ value, label }) => (
            <label key={value} className={OPCION}>
              <input
                type="checkbox"
                checked={opciones.secciones.includes(value)}
                onChange={(e) =>
                  setOpciones({ ...opciones, secciones: alternar(opciones.secciones, value, e.target.checked) })
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
                  setOpciones({ ...opciones, graficas: alternar(opciones.graficas, value, e.target.checked) })
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

      {errorDatos && (
        <p role="alert" className="text-xs font-medium text-error">
          {errorDatos}
        </p>
      )}
    </div>
  );

  const panelFechas = (
    <fieldset>
      <legend className={LEGEND}>Rango de fechas (opcional)</legend>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
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
      {errorDatos && (
        <p role="alert" className="mt-2 text-xs font-medium text-error">
          {errorDatos} Vuelve al paso «Qué incluir» para corregirlo.
        </p>
      )}
    </fieldset>
  );

  const panelApariencia = (
    <div className="space-y-5">
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
    </div>
  );

  const nombresSecciones = SECCION_OPCIONES.filter((o) => opciones.secciones.includes(o.value)).map((o) => o.label);
  const nombresGraficas = GRAFICA_OPCIONES.filter((o) => graficasFinales.includes(o.value)).map((o) => o.label);
  const fuenteElegida = FUENTE_OPCIONES.find((o) => o.value === opciones.fuente)?.label;
  const rango =
    opciones.desde || opciones.hasta
      ? `${opciones.desde ? diaLegible(opciones.desde) : 'Inicio del proyecto'} a ${opciones.hasta ? diaLegible(opciones.hasta) : 'hoy'}`
      : 'Todo el proyecto';

  const panelVistaPrevia = (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-3 rounded-md border border-outline-variant/50 bg-surface-container-low p-4 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">Datos</dt>
          <dd className="mt-1 text-on-surface">{nombresSecciones.join(', ')}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">Gráficas</dt>
          <dd className="mt-1 text-on-surface">{nombresGraficas.length > 0 ? nombresGraficas.join(', ') : 'Ninguna'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">Periodo</dt>
          <dd className="mt-1 text-on-surface">{rango}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-tertiary">Fuente</dt>
          <dd className="mt-1 text-on-surface">{fuenteElegida}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="text-xs font-medium text-error">
          {error} Vuelve al paso correspondiente para corregirlo.
        </p>
      )}
      <div className="overflow-hidden rounded-md border border-outline-variant" aria-label="Muestra de tabla">
        <div
          data-testid="vista-previa-encabezado"
          className="px-3 py-2 text-xs font-bold"
          style={{ backgroundColor: opciones.color, color: textoSobre(opciones.color) }}
        >
          Integrante · Horas
        </div>
        <div className="px-3 py-2 text-xs text-on-surface">Ejemplo · 12.5</div>
      </div>
    </div>
  );

  const paneles = [panelDatos, panelFechas, panelApariencia, panelVistaPrevia];

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) setPaso(0);
        onOpenChange(abierto);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar {etiqueta}</DialogTitle>
          <DialogDescription>
            {esPdf
              ? `Paso ${paso + 1} de ${PASOS_PDF.length}: ${PASOS_PDF[paso]}.`
              : 'Puedes limitar las horas del CSV a un rango de fechas.'}
          </DialogDescription>
        </DialogHeader>

        {esPdf && <FormStepper pasos={[...PASOS_PDF]} actual={paso} />}

        <div className="min-h-[12rem]">{esPdf ? paneles[paso] : panelFechas}</div>

        <DialogFooter>
          {esPdf && paso > 0 ? (
            <button type="button" onClick={() => setPaso(paso - 1)} className={BOTON_SECUNDARIO}>
              Atrás
            </button>
          ) : (
            <button type="button" onClick={() => onOpenChange(false)} className={BOTON_SECUNDARIO}>
              Cancelar
            </button>
          )}
          {ultimo ? (
            <Button
              type="button"
              onClick={confirmar}
              disabled={isPending || error !== null}
              className="h-auto gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90 has-[>svg]:px-4 disabled:opacity-60 motion-glow-primary"
            >
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isPending ? 'Generando…' : `Descargar ${etiqueta}`}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setPaso(paso + 1)}
              disabled={pasoInvalido}
              className="h-auto rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
            >
              Siguiente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
