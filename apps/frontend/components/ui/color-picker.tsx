'use client';

import { useEffect, useRef, useState } from 'react';
import { hexToRgb, hsvToRgb, normalizarHex, rgbToHex, rgbToHsv, type Hsv, type Rgb } from '@/lib/color';

interface ColorPickerProps {
  /** Color vigente, `#rrggbb`. */
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

const ARCO_IRIS = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';
const A_BLANCO = 'linear-gradient(to bottom, rgba(255,255,255,0), #fff)';
const CAMPO =
  'w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface';

const THUMB =
  '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-neutral-900 [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-neutral-900';

function hsvDe(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex) ?? [0, 0, 0]);
}

/**
 * Al pasar de RGB a HSV el matiz (y la saturación) se pierden en gris y
 * negro; se conservan los anteriores para que el cuadro no salte al mover
 * el brillo hasta 0 o al escribir un gris.
 */
function conservandoMatiz(nuevo: Hsv, previo: Hsv): Hsv {
  if (nuevo.v === 0) {
    return { h: previo.h, s: previo.s, v: 0 };
  }
  if (nuevo.s === 0) {
    return { h: previo.h, s: 0, v: nuevo.v };
  }
  return nuevo;
}

/**
 * Selector de color: cuadro de matiz (x) × saturación (y), muestra del color
 * elegido, barra de brillo, hexadecimal y canales RGB — todo sincronizado.
 * Controlado: `value` manda; cada cambio notifica un `#rrggbb` completo.
 */
export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hsvDe(value));
  const [hexTexto, setHexTexto] = useState(value);
  const [hexInvalido, setHexInvalido] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const arrastrando = useRef(false);

  const rgb = hexToRgb(value) ?? hsvToRgb(hsv);
  const hexVigente = rgbToHex(rgb);

  // Cambios que llegan desde fuera (p. ej. restablecer): se reflejan sin
  // pisar el matiz que el usuario ya elegía dentro del selector.
  useEffect(() => {
    const entrante = normalizarHex(value);
    if (entrante && entrante !== rgbToHex(hsvToRgb(hsv))) {
      setHsv((previo) => conservandoMatiz(hsvDe(entrante), previo));
    }
    setHexTexto(value);
    setHexInvalido(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emitirHsv(siguiente: Hsv) {
    setHsv(siguiente);
    const hex = rgbToHex(hsvToRgb(siguiente));
    setHexTexto(hex);
    setHexInvalido(false);
    onChange(hex);
  }

  function emitirRgb(siguiente: Rgb) {
    const hex = rgbToHex(siguiente);
    setHsv((previo) => conservandoMatiz(rgbToHsv(siguiente), previo));
    setHexTexto(hex);
    setHexInvalido(false);
    onChange(hex);
  }

  function desdePuntero(e: React.PointerEvent<HTMLDivElement>) {
    const caja = areaRef.current?.getBoundingClientRect();
    if (!caja || caja.width === 0 || caja.height === 0) {
      return;
    }
    const x = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const y = Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height));
    emitirHsv({ h: x * 360, s: 1 - y, v: hsv.v });
  }

  function alTeclear(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso = e.shiftKey ? 1 : 5;
    const cambios: Record<string, Hsv> = {
      ArrowRight: { ...hsv, h: (hsv.h + paso) % 360 },
      ArrowLeft: { ...hsv, h: (hsv.h - paso + 360) % 360 },
      ArrowUp: { ...hsv, s: Math.min(1, hsv.s + paso / 100) },
      ArrowDown: { ...hsv, s: Math.max(0, hsv.s - paso / 100) },
    };
    const siguiente = cambios[e.key];
    if (siguiente) {
      e.preventDefault();
      emitirHsv(siguiente);
    }
  }

  function alEscribirHex(texto: string) {
    setHexTexto(texto);
    const normalizado = normalizarHex(texto);
    if (normalizado) {
      setHexInvalido(false);
      emitirRgb(hexToRgb(normalizado) as Rgb);
    } else {
      setHexInvalido(true);
    }
  }

  const colorPleno = rgbToHex(hsvToRgb({ ...hsv, v: 1 }));
  const canales: Array<{ etiqueta: string; indice: 0 | 1 | 2 }> = [
    { etiqueta: 'Rojo', indice: 0 },
    { etiqueta: 'Verde', indice: 1 },
    { etiqueta: 'Azul', indice: 2 },
  ];

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      <div className="flex gap-3">
        <div
          ref={areaRef}
          role="slider"
          tabIndex={0}
          aria-label="Matiz y saturación"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`Matiz ${Math.round(hsv.h)}°, saturación ${Math.round(hsv.s * 100)} %`}
          className="relative h-40 min-w-0 flex-1 cursor-crosshair touch-none rounded-lg border border-outline-variant"
          style={{ backgroundImage: `${A_BLANCO}, ${ARCO_IRIS}` }}
          onPointerDown={(e) => {
            arrastrando.current = true;
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
            desdePuntero(e);
          }}
          onPointerMove={(e) => arrastrando.current && desdePuntero(e)}
          onPointerUp={() => {
            arrastrando.current = false;
          }}
          onKeyDown={alTeclear}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-900 bg-white/30 shadow"
            style={{ left: `${(hsv.h / 360) * 100}%`, top: `${(1 - hsv.s) * 100}%` }}
          />
        </div>
        <div
          data-testid="color-muestra"
          aria-hidden="true"
          className="h-40 w-10 shrink-0 rounded-lg border border-outline-variant"
          style={{ backgroundColor: hexVigente }}
        />
      </div>

      <input
        type="range"
        aria-label="Brillo"
        min={0}
        max={100}
        value={Math.round(hsv.v * 100)}
        onChange={(e) => emitirHsv({ ...hsv, v: Number(e.target.value) / 100 })}
        className={`h-3 w-full cursor-pointer appearance-none rounded-full border border-outline-variant ${THUMB}`}
        style={{ backgroundImage: `linear-gradient(to right, #000, ${colorPleno})` }}
      />

      <div className="flex items-center gap-3">
        <span className={`${CAMPO} max-w-[7rem] text-tertiary`}>RGB</span>
        <input
          type="text"
          aria-label="Hexadecimal"
          aria-invalid={hexInvalido || undefined}
          spellCheck={false}
          value={hexTexto}
          onChange={(e) => alEscribirHex(e.target.value)}
          onBlur={() => {
            setHexTexto(hexVigente);
            setHexInvalido(false);
          }}
          className={`${CAMPO} ${hexInvalido ? 'border-error' : ''}`}
        />
      </div>
      {hexInvalido && (
        <p className="-mt-1 text-xs text-error">El color debe tener el formato #RRGGBB (por ejemplo, #59f7ff).</p>
      )}

      <div className="space-y-2">
        {canales.map(({ etiqueta, indice }) => (
          <label key={etiqueta} className="flex items-center gap-3 text-sm text-on-surface">
            <input
              type="number"
              aria-label={etiqueta}
              min={0}
              max={255}
              value={rgb[indice]}
              onChange={(e) => {
                const siguiente: Rgb = [...rgb];
                siguiente[indice] = Math.min(255, Math.max(0, Math.round(Number(e.target.value) || 0)));
                emitirRgb(siguiente);
              }}
              className={`${CAMPO} max-w-[7rem]`}
            />
            <span aria-hidden="true">{etiqueta}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
