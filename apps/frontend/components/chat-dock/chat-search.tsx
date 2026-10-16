'use client';

import { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLoadMessagesUntil, useSearchMessages } from '@/hooks/use-chat';
import { resaltarTexto } from '@/lib/chat-highlight';
import type { ChatUsuario } from '@/lib/types/chat';

export function TextoResaltado({ texto, termino }: { texto: string; termino?: string | null }) {
  return (
    <>
      {resaltarTexto(texto, termino).map((s, i) =>
        s.coincide ? (
          <mark key={i} className="rounded-sm bg-secondary-container px-0.5 font-bold text-on-surface underline decoration-2 underline-offset-2">
            {s.texto}
          </mark>
        ) : (
          <span key={i}>{s.texto}</span>
        ),
      )}
    </>
  );
}

interface Filtros {
  q?: string;
  idAutor?: number;
  desde?: string;
  hasta?: string;
}

const CAMPO = 'h-8 rounded-md border border-outline-variant bg-transparent px-2 text-xs text-on-surface focus-visible:border-primary focus-visible:outline-none';

interface ChatSearchPanelProps {
  idProyecto: number;
  idConversacion: number;
  participantes: ChatUsuario[];
  onJump: (idMensaje: number) => void;
  onClose: () => void;
}

export function ChatSearchPanel({ idProyecto, idConversacion, participantes, onJump, onClose }: ChatSearchPanelProps) {
  const [q, setQ] = useState('');
  const [autor, setAutor] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [aplicados, setAplicados] = useState<Filtros | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [errorSalto, setErrorSalto] = useState(false);
  const busqueda = useSearchMessages(idProyecto, idConversacion, aplicados ?? {}, aplicados !== null);
  const cargarHasta = useLoadMessagesUntil(idProyecto, idConversacion);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const texto = q.trim();
    if (!texto && !autor && !desde && !hasta) {
      setErrorForm('Escribe un texto o elige un autor o fechas.');
    } else if (texto && texto.length < 2) {
      setErrorForm('El texto debe tener al menos 2 caracteres.');
    } else if (desde && hasta && desde > hasta) {
      setErrorForm('La fecha "Desde" no puede ser posterior a "Hasta".');
    } else {
      setErrorForm(null);
      setAplicados({
        q: texto || undefined,
        idAutor: autor ? Number(autor) : undefined,
        // Los <input type="date"> dan YYYY-MM-DD en hora local: se cubre el día completo.
        desde: desde ? new Date(`${desde}T00:00:00`).toISOString() : undefined,
        hasta: hasta ? new Date(`${hasta}T23:59:59.999`).toISOString() : undefined,
      });
    }
  };

  const handleJump = async (idMensaje: number) => {
    setErrorSalto(false);
    try {
      await cargarHasta(idMensaje);
      onJump(idMensaje);
    } catch {
      setErrorSalto(true);
    }
  };

  const { resultados, hasMore, isLoading, isError, cargarMas, cargandoMas } = busqueda;

  return (
    <section aria-label="Buscar en la conversación" className="shrink-0 border-b border-outline-variant bg-surface-container-low p-2">
      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor={`chat-buscar-q-${idConversacion}`} className="sr-only">
            Buscar texto en la conversación
          </label>
          <Input
            id={`chat-buscar-q-${idConversacion}`}
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar en esta conversación…"
            maxLength={100}
            autoFocus
            className="h-8 flex-1 rounded-md border-outline-variant text-xs"
          />
          <Button type="submit" size="sm" className="h-8 gap-1 text-xs">
            <Search className="size-3.5" aria-hidden="true" />
            Buscar
          </Button>
          <button type="button" onClick={onClose} aria-label="Cerrar búsqueda" className="rounded-control p-1 text-text-secondary hover:bg-on-surface/10 hover:text-text-primary">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2 text-xs text-on-surface">
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`chat-buscar-autor-${idConversacion}`} className="font-semibold">Autor</label>
            <select id={`chat-buscar-autor-${idConversacion}`} value={autor} onChange={(event) => setAutor(event.target.value)} className={CAMPO}>
              <option value="">Cualquiera</option>
              {participantes.map((p) => (
                <option key={p.idUsuario} value={p.idUsuario}>
                  {p.nombre} {p.apellido}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`chat-buscar-desde-${idConversacion}`} className="font-semibold">Desde</label>
            <input id={`chat-buscar-desde-${idConversacion}`} type="date" value={desde} max={hasta || undefined} onChange={(event) => setDesde(event.target.value)} className={CAMPO} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`chat-buscar-hasta-${idConversacion}`} className="font-semibold">Hasta</label>
            <input id={`chat-buscar-hasta-${idConversacion}`} type="date" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} className={CAMPO} />
          </div>
        </div>
        {errorForm && (
          <p role="alert" className="text-xs font-semibold text-error">
            {errorForm}
          </p>
        )}
      </form>

      {aplicados && (
        <div className="mt-2 max-h-56 overflow-y-auto" aria-busy={isLoading}>
          {isLoading && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Buscando…
            </p>
          )}
          {isError && (
            <p role="alert" className="text-xs font-semibold text-error">
              No se pudo realizar la búsqueda. Inténtalo de nuevo.
            </p>
          )}
          {!isLoading && !isError && resultados.length === 0 && (
            <p role="status" className="text-xs text-tertiary">
              No hay mensajes que coincidan con la búsqueda.
            </p>
          )}
          {resultados.length > 0 && (
            <>
              <p role="status" className="mb-1 text-[11px] font-semibold text-on-surface-variant">
                {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
                {hasMore ? ' o más' : ''}
              </p>
              <ul aria-label="Resultados de la búsqueda" className="space-y-1">
                {resultados.map((m) => (
                  <li key={m.idMensaje}>
                    <button
                      type="button"
                      onClick={() => handleJump(m.idMensaje)}
                      className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-left text-xs text-on-surface hover:bg-on-surface/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                        <span className="truncate font-semibold">{m.remitente.nombre} {m.remitente.apellido}</span>
                        <time dateTime={m.enviadoEn}>{new Date(m.enviadoEn).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}</time>
                      </span>
                      <span className="line-clamp-2 whitespace-pre-wrap break-words">
                        <TextoResaltado texto={m.contenido} termino={aplicados.q} />
                      </span>
                      <span className="sr-only">Ir al mensaje</span>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMore && (
                <Button type="button" variant="outline" size="sm" disabled={cargandoMas} onClick={cargarMas} className="mt-1 h-7 w-full text-xs">
                  {cargandoMas && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  Cargar más resultados
                </Button>
              )}
            </>
          )}
          {errorSalto && (
            <p role="alert" className="mt-1 text-xs font-semibold text-error">
              No se pudo cargar ese mensaje del historial.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
