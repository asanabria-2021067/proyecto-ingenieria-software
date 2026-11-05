'use client';

import { useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { normalizarHex } from '@/lib/color';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  /** Color vigente, `#rrggbb`. */
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  /** Id del campo hexadecimal (para asociarle un `<label>` externo). */
  id?: string;
  /** Deshabilita la paleta y el campo (p. ej. mientras se guarda). */
  disabled?: boolean;
  'aria-describedby'?: string;
}

/** Paleta cerrada de los colores del sistema (los mismos de las etiquetas, más el gris de las tablas). */
export const PALETA_COLORES = [
  { nombre: 'Verde UVG', valor: '#006735' },
  { nombre: 'Azul', valor: '#2680c2' },
  { nombre: 'Rojo', valor: '#e5484d' },
  { nombre: 'Naranja', valor: '#f97316' },
  { nombre: 'Amarillo', valor: '#d9a400' },
  { nombre: 'Violeta', valor: '#8b7ce8' },
  { nombre: 'Turquesa', valor: '#0f9f9a' },
  { nombre: 'Gris azulado', valor: '#64748b' },
  { nombre: 'Lima', valor: '#8bc34a' },
  { nombre: 'Rosa', valor: '#d946a6' },
  { nombre: 'Grafito', valor: '#464646' },
] as const;

const CAMPO =
  'w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-mono text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * Selector de color: paleta cerrada (grupo de opciones navegable con flechas,
 * Inicio y Fin) y un campo hexadecimal `#RRGGBB` validado. Controlado: cada
 * cambio notifica un `#rrggbb` completo en minúsculas; un hex incompleto
 * nunca se notifica.
 */
export function ColorPicker({
  value,
  onChange,
  className,
  id,
  disabled = false,
  'aria-describedby': describedBy,
}: ColorPickerProps) {
  const idError = useId();
  const actual = normalizarHex(value) ?? '#000000';
  const [hexTexto, setHexTexto] = useState(value);
  const [hexInvalido, setHexInvalido] = useState(false);
  const opciones = useRef<Array<HTMLButtonElement | null>>([]);

  // Un `value` nuevo desde fuera reemplaza lo que se estaba escribiendo.
  const [valorPrevio, setValorPrevio] = useState(value);
  if (value !== valorPrevio) {
    setValorPrevio(value);
    setHexTexto(value);
    setHexInvalido(false);
  }

  const indiceActual = PALETA_COLORES.findIndex((c) => c.valor === actual);

  function elegir(indice: number) {
    const total = PALETA_COLORES.length;
    const destino = (indice + total) % total;
    onChange(PALETA_COLORES[destino].valor);
    opciones.current[destino]?.focus();
  }

  function alTeclear(e: React.KeyboardEvent, indice: number) {
    const mover: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowDown: indice + 1,
      ArrowLeft: indice - 1,
      ArrowUp: indice - 1,
      Home: 0,
      End: PALETA_COLORES.length - 1,
    };
    if (e.key in mover) {
      e.preventDefault();
      elegir(mover[e.key]);
    }
  }

  function alEscribirHex(texto: string) {
    setHexTexto(texto);
    const normalizado = normalizarHex(texto.startsWith('#') ? texto : `#${texto}`);
    setHexInvalido(!normalizado);
    if (normalizado) onChange(normalizado);
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div role="radiogroup" aria-label="Paleta de colores" className="grid grid-cols-6 gap-2">
        {PALETA_COLORES.map((color, i) => {
          const seleccionado = color.valor === actual;
          return (
            <button
              key={color.valor}
              ref={(el) => {
                opciones.current[i] = el;
              }}
              type="button"
              role="radio"
              disabled={disabled}
              aria-checked={seleccionado}
              aria-label={color.nombre}
              title={color.nombre}
              tabIndex={seleccionado || (indiceActual === -1 && i === 0) ? 0 : -1}
              onClick={() => elegir(i)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-md border border-outline-variant/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                seleccionado && 'border-primary ring-2 ring-primary/30',
              )}
            >
              <span
                className="inline-flex size-6 items-center justify-center rounded-full border border-black/10"
                style={{ backgroundColor: color.valor }}
              >
                {seleccionado && <Check className="size-3.5 text-white drop-shadow" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span
          data-testid="color-muestra"
          aria-hidden="true"
          className="size-9 shrink-0 rounded-md border border-outline-variant"
          style={{ backgroundColor: actual }}
        />
        <input
          id={id}
          type="text"
          disabled={disabled}
          aria-label="Hexadecimal"
          aria-invalid={hexInvalido || undefined}
          aria-describedby={[describedBy, hexInvalido ? idError : null].filter(Boolean).join(' ') || undefined}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          placeholder="#RRGGBB"
          value={hexTexto}
          onChange={(e) => alEscribirHex(e.target.value)}
          onBlur={() => {
            setHexTexto(actual);
            setHexInvalido(false);
          }}
          className={cn(CAMPO, hexInvalido && 'border-error')}
        />
      </div>
      {hexInvalido && (
        <p id={idError} role="alert" className="text-xs text-error">
          El color debe tener el formato #RRGGBB (por ejemplo, #59f7ff).
        </p>
      )}
    </div>
  );
}
