'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import {
  coincideMencionable,
  consultaMencionActiva,
  etiquetaMencion,
  mencionesPresentes,
  type MencionSeleccionada,
} from '@/lib/mentions/mention-tokens';
import type { Mencionable } from '@/lib/services/comments';
import { cn } from '@/lib/utils';

const MAX_SUGERENCIAS = 6;

interface MentionTextareaProps {
  value: string;
  onChange: (texto: string) => void;
  menciones: MencionSeleccionada[];
  onMencionesChange: (menciones: MencionSeleccionada[]) => void;
  mencionables: Mencionable[];
  currentUserId?: number | null;
  /** Al editar: mencionados que ya recibieron su aviso (no se repite). */
  yaNotificados?: number[];
  /** Ctrl/⌘ + Enter. */
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  className?: string;
}

function iniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

/**
 * HU-200 (T-376): cuadro de comentario con autocompletado de @menciones.
 * Al escribir `@` se sugieren los integrantes del proyecto (sin incluirte a ti)
 * y, al elegir uno, el texto muestra `@Nombre Apellido` mientras la mención
 * queda registrada en `menciones`; el contenedor arma el token al enviar
 * (`editableAContenido`). Patrón combobox: flechas, Enter/Tab y Escape.
 */
export function MentionTextarea({
  value,
  onChange,
  menciones,
  onMencionesChange,
  mencionables,
  currentUserId,
  yaNotificados = [],
  onSubmit,
  placeholder,
  rows = 3,
  maxLength,
  disabled,
  autoFocus,
  'aria-label': ariaLabel,
  className,
}: MentionTextareaProps) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [consulta, setConsulta] = useState<{ inicio: number; consulta: string } | null>(null);
  const [activo, setActivo] = useState(0);
  const [descartada, setDescartada] = useState<number | null>(null);

  // Si el texto desde el @ empieza por una mención ya elegida, el usuario
  // sigue escribiendo después de ella: no es una búsqueda nueva.
  const consultaVigente =
    consulta &&
    consulta.inicio !== descartada &&
    !menciones.some((m) => consulta.consulta.startsWith(m.etiqueta))
      ? consulta
      : null;

  const sugerencias = useMemo(() => {
    if (!consultaVigente) return [];
    return (Array.isArray(mencionables) ? mencionables : [])
      .filter((m) => m.idUsuario !== currentUserId)
      .filter((m) => coincideMencionable(`${m.nombre} ${m.apellido}`, consultaVigente.consulta))
      .slice(0, MAX_SUGERENCIAS);
  }, [consultaVigente, mencionables, currentUserId]);

  // Sin coincidencias se avisa solo mientras la búsqueda es una sola palabra:
  // con espacios, lo más probable es que el usuario ya esté escribiendo texto.
  const sinCoincidencias =
    consultaVigente !== null && sugerencias.length === 0 && !/\s/.test(consultaVigente.consulta);
  const abierto = !disabled && consultaVigente !== null && (sugerencias.length > 0 || sinCoincidencias);
  const indiceActivo = Math.min(activo, Math.max(sugerencias.length - 1, 0));

  const actualizarConsulta = (texto: string, cursor: number | null) => {
    const nueva = cursor === null ? null : consultaMencionActiva(texto, cursor);
    setConsulta(nueva);
    if (nueva?.inicio !== consulta?.inicio) {
      setActivo(0);
      setDescartada(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const texto = e.target.value;
    onChange(texto);
    const presentes = mencionesPresentes(texto, menciones);
    if (presentes.length !== menciones.length) onMencionesChange(presentes);
    actualizarConsulta(texto, e.target.selectionStart);
  };

  const seleccionar = (m: Mencionable) => {
    if (!consultaVigente) return;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? consultaVigente.inicio + consultaVigente.consulta.length + 1;
    const etiqueta = etiquetaMencion(m.nombre, m.apellido);
    const antes = value.slice(0, consultaVigente.inicio);
    const despues = value.slice(cursor).replace(/^ /, '');
    const insertado = `@${etiqueta} `;
    onChange(`${antes}${insertado}${despues}`);
    if (!menciones.some((x) => x.idUsuario === m.idUsuario)) {
      onMencionesChange([...menciones, { idUsuario: m.idUsuario, etiqueta }]);
    }
    setConsulta(null);
    const posicion = antes.length + insertado.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(posicion, posicion);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (abierto && sugerencias.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActivo((indiceActivo + 1) % sugerencias.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActivo((indiceActivo - 1 + sugerencias.length) % sugerencias.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        seleccionar(sugerencias[indiceActivo]);
        return;
      }
    }
    if (abierto && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDescartada(consultaVigente?.inicio ?? null);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Lo que el usuario verá como «se notificará a»: sin incluirse a sí mismo
  // ni a quien ya fue avisado por este comentario.
  const avisados = menciones.filter((m) => m.idUsuario !== currentUserId && !yaNotificados.includes(m.idUsuario));

  return (
    <div className={cn('relative', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            actualizarConsulta(e.currentTarget.value, e.currentTarget.selectionStart);
          }
        }}
        onClick={(e) => actualizarConsulta(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setConsulta(null)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? listId : undefined}
        aria-activedescendant={abierto && sugerencias.length > 0 ? `${listId}-${indiceActivo}` : undefined}
      />

      {abierto && (
        <div className="surface-enter absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-lg">
          <p className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
            <AtSign className="size-3" aria-hidden="true" />
            Mencionar a un integrante
          </p>
          {sugerencias.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Integrantes que puedes mencionar" className="max-h-64 overflow-y-auto p-1">
              {sugerencias.map((m, i) => (
                <li
                  key={m.idUsuario}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === indiceActivo}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    seleccionar(m);
                  }}
                  onMouseEnter={() => setActivo(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    i === indiceActivo ? 'bg-primary/10 text-on-surface' : 'text-on-surface-variant',
                  )}
                >
                  <Avatar className="size-7">
                    {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
                    <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                      {iniciales(m.nombre, m.apellido)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.nombre} {m.apellido}
                  </span>
                  {m.esLider && <span className="pill pill-sm pill-forest">Líder</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-3 pb-3 pt-1 text-sm text-tertiary">
              {consultaVigente?.consulta
                ? `Ningún integrante coincide con «${consultaVigente.consulta}».`
                : 'No hay otros integrantes para mencionar en este proyecto.'}
            </p>
          )}
          {sugerencias.length > 0 && (
            <p className="hidden items-center gap-1.5 border-t border-outline-variant/40 px-3 py-1.5 text-[11px] text-tertiary sm:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              para moverte
              <span aria-hidden="true">·</span>
              <Kbd>Enter</Kbd>
              para elegir
              <span aria-hidden="true">·</span>
              <Kbd>Esc</Kbd>
              para cerrar
            </p>
          )}
        </div>
      )}

      {avisados.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-tertiary" aria-live="polite">
          <AtSign className="size-3" aria-hidden="true" />
          Se notificará a
          {avisados.map((m) => (
            <span key={m.idUsuario} className="pill pill-sm pill-subtle">
              {m.etiqueta}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
