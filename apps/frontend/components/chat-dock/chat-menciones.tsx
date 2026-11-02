'use client';

import { Fragment, useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { AtSign } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  coincideMencionable,
  consultaMencionActiva,
  editableAContenido,
  etiquetaMencion,
  mencionesPresentes,
  segmentarComentario,
  type MencionSeleccionada,
} from '@/lib/mentions/mention-tokens';
import type { ChatUsuario } from '@/lib/types/chat';
import { cn } from '@/lib/utils';

const MAX_SUGERENCIAS = 6;

/**
 * MEJ-44: autocompletado de @menciones en el compositor del chat (una linea, Enter envia).
 * Sugiere a los demas participantes de la conversacion; el texto muestra `@Nombre Apellido`
 * y el token `@[Nombre](id)` se arma al enviar con `contenidoFinal`.
 */
export function useMencionesChat(opts: {
  texto: string;
  setTexto: (texto: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  participantes: ChatUsuario[];
  idUsuarioActual: number | null;
}) {
  const { texto, setTexto, inputRef, participantes, idUsuarioActual } = opts;
  const [menciones, setMenciones] = useState<MencionSeleccionada[]>([]);
  const [consulta, setConsulta] = useState<{ inicio: number; consulta: string } | null>(null);
  const [activo, setActivo] = useState(0);
  const [descartada, setDescartada] = useState<number | null>(null);

  const vigente =
    consulta && consulta.inicio !== descartada && !menciones.some((m) => consulta.consulta.startsWith(m.etiqueta))
      ? consulta
      : null;

  const sugerencias = useMemo(() => {
    if (!vigente) return [];
    return participantes
      .filter((p) => p.idUsuario !== idUsuarioActual)
      .filter((p) => coincideMencionable(`${p.nombre} ${p.apellido}`, vigente.consulta))
      .slice(0, MAX_SUGERENCIAS);
  }, [vigente, participantes, idUsuarioActual]);

  const abierto = sugerencias.length > 0;
  const indiceActivo = Math.min(activo, Math.max(sugerencias.length - 1, 0));

  const actualizarConsulta = (valor: string, cursor: number | null) => {
    const nueva = cursor === null ? null : consultaMencionActiva(valor, cursor);
    if (nueva?.inicio !== consulta?.inicio) {
      setActivo(0);
      setDescartada(null);
    }
    setConsulta(nueva);
  };

  const onChange = (valor: string, cursor: number | null) => {
    setTexto(valor);
    const presentes = mencionesPresentes(valor, menciones);
    if (presentes.length !== menciones.length) setMenciones(presentes);
    actualizarConsulta(valor, cursor);
  };

  const seleccionar = (p: ChatUsuario) => {
    if (!vigente) return;
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? vigente.inicio + vigente.consulta.length + 1;
    const etiqueta = etiquetaMencion(p.nombre, p.apellido);
    const antes = texto.slice(0, vigente.inicio);
    const despues = texto.slice(cursor).replace(/^ /, '');
    const insertado = `@${etiqueta} `;
    setTexto(`${antes}${insertado}${despues}`);
    if (!menciones.some((m) => m.idUsuario === p.idUsuario)) setMenciones([...menciones, { idUsuario: p.idUsuario, etiqueta }]);
    setConsulta(null);
    const posicion = antes.length + insertado.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(posicion, posicion);
    });
  };

  /** Devuelve true si la tecla se uso para el autocompletado (el llamador no debe enviar). */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!abierto) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((indiceActivo + (e.key === 'ArrowDown' ? 1 : -1) + sugerencias.length) % sugerencias.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      seleccionar(sugerencias[indiceActivo]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDescartada(vigente?.inicio ?? null);
      return true;
    }
    return false;
  };

  return {
    sugerencias,
    abierto,
    indiceActivo,
    onChange,
    onKeyDown,
    seleccionar,
    cerrar: () => setConsulta(null),
    contenidoFinal: () => editableAContenido(texto.trim(), mencionesPresentes(texto, menciones)),
    reiniciar: () => {
      setMenciones([]);
      setConsulta(null);
    },
  };
}

interface MencionSugerenciasProps {
  id: string;
  sugerencias: ChatUsuario[];
  activo: number;
  onElegir: (p: ChatUsuario) => void;
}

/** Lista flotante sobre el compositor; las opciones usan `mousedown` para no perder el foco del input. */
export function MencionSugerencias({ id, sugerencias, activo, onElegir }: MencionSugerenciasProps) {
  return (
    <div className="absolute inset-x-2 bottom-full z-30 mb-1 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-raised">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
        <AtSign className="size-3" aria-hidden="true" />
        Mencionar
      </p>
      <ul id={id} role="listbox" aria-label="Participantes que puedes mencionar" className="pb-1">
        {sugerencias.map((p, i) => (
          <li
            key={p.idUsuario}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === activo}
            onMouseDown={(e) => {
              e.preventDefault();
              onElegir(p);
            }}
            className={cn('flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-on-surface', i === activo ? 'bg-primary/10' : 'hover:bg-on-surface/5')}
          >
            <Avatar className="size-6">
              {p.fotoUrl && <AvatarImage src={p.fotoUrl} alt="" />}
              <AvatarFallback className="text-[10px]">{`${p.nombre.charAt(0)}${p.apellido.charAt(0)}`.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate">{p.nombre} {p.apellido}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChatContenidoProps {
  contenido: string;
  participantes?: ChatUsuario[];
  idUsuarioActual?: number | null;
  className?: string;
}

/**
 * Texto del mensaje con las menciones resaltadas. El nombre sale del participante vigente
 * (no de la etiqueta guardada); todo es texto de React, nunca HTML.
 */
export function ChatContenido({ contenido, participantes = [], idUsuarioActual = null, className }: ChatContenidoProps) {
  return (
    <p className={className}>
      {segmentarComentario(contenido).map((s, i) => {
        if (s.tipo === 'texto') return <Fragment key={i}>{s.texto}</Fragment>;
        const p = participantes.find((x) => x.idUsuario === s.idUsuario);
        const nombre = p ? `${p.nombre} ${p.apellido}`.trim() : s.etiqueta;
        const esYo = idUsuarioActual === s.idUsuario;
        return (
          <span
            key={i}
            data-mention-id={s.idUsuario}
            title={esYo ? 'Te mencionaron' : undefined}
            className={cn('rounded px-1 font-semibold', esYo ? 'bg-current/25 underline decoration-2' : 'bg-current/15')}
          >
            @{nombre}
          </span>
        );
      })}
    </p>
  );
}
