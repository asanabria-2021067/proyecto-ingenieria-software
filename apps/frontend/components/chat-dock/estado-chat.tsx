'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, GraduationCap, Loader2, MessageSquareText, MinusCircle, Smile } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClearMiEstado, useMiEstado, useSetMiEstado } from '@/hooks/use-chat';
import type { ChatEstado, TipoEstadoChat } from '@/lib/types/chat';

const OPCIONES: { tipo: TipoEstadoChat; etiqueta: string; Icono: typeof Smile }[] = [
  { tipo: 'EN_CLASE', etiqueta: 'En clase', Icono: GraduationCap },
  { tipo: 'OCUPADO', etiqueta: 'Ocupado', Icono: MinusCircle },
  { tipo: 'DISPONIBLE', etiqueta: 'Disponible', Icono: CheckCircle2 },
  { tipo: 'PERSONALIZADO', etiqueta: 'Personalizado', Icono: MessageSquareText },
];

export type Caducidad = '30m' | '1h' | '4h' | 'hoy' | 'nunca';

const CADUCIDADES: { valor: Caducidad; etiqueta: string }[] = [
  { valor: '30m', etiqueta: '30 minutos' },
  { valor: '1h', etiqueta: '1 hora' },
  { valor: '4h', etiqueta: '4 horas' },
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'nunca', etiqueta: 'Sin caducidad' },
];

/** ISO de vencimiento para la opción elegida; null = sin caducidad. "Hoy" vence a la medianoche local. */
export function calcularVenceEn(caducidad: Caducidad, ahora: Date = new Date()): string | null {
  const minutos = { '30m': 30, '1h': 60, '4h': 240 }[caducidad as '30m' | '1h' | '4h'];
  if (minutos) return new Date(ahora.getTime() + minutos * 60_000).toISOString();
  if (caducidad === 'hoy') {
    return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1).toISOString();
  }
  return null;
}

function IconoEstado({ tipo, className }: { tipo?: TipoEstadoChat; className: string }) {
  const Icono = OPCIONES.find((o) => o.tipo === tipo)?.Icono ?? Smile;
  return <Icono className={className} aria-hidden="true" />;
}

function textoDe(estado: ChatEstado): string {
  if (estado.tipo === 'PERSONALIZADO') return estado.texto ?? '';
  return OPCIONES.find((o) => o.tipo === estado.tipo)?.etiqueta ?? '';
}

/**
 * Devuelve el estado solo mientras sigue vigente: programa un re-render justo
 * al vencer para ocultarlo sin esperar al siguiente refetch. El servidor ya
 * filtra los vencidos; esto cubre el tiempo entre cargas.
 */
export function useEstadoVigente(estado: ChatEstado | null | undefined): ChatEstado | null {
  const [ahora, setAhora] = useState(() => Date.now());
  const venceMs = estado?.venceEn ? Date.parse(estado.venceEn) : null;

  useEffect(() => {
    if (venceMs === null || venceMs <= ahora) return;
    // setTimeout no admite más de 2^31-1 ms; con 0 se re-evalúa enseguida un estado ya vencido.
    const falta = Math.min(Math.max(venceMs - Date.now(), 0), 2 ** 31 - 1);
    const timer = setTimeout(() => setAhora(Date.now()), falta);
    return () => clearTimeout(timer);
  }, [venceMs, ahora]);

  if (!estado) return null;
  if (venceMs !== null && venceMs <= ahora) return null;
  return estado;
}

/** Icono + texto (no solo color) con el estado de otro participante. */
export function EstadoIndicador({ estado }: { estado: ChatEstado | null | undefined }) {
  const vigente = useEstadoVigente(estado);
  if (!vigente) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-[11px] text-text-secondary">
      <IconoEstado tipo={vigente.tipo} className="size-3 shrink-0" />
      <span className="truncate">{textoDe(vigente)}</span>
    </span>
  );
}

/** Botón de la cabecera de la lista de chats que abre el selector del estado propio. */
export function MiEstadoBoton() {
  const { estado } = useMiEstado();
  const vigente = useEstadoVigente(estado);
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={vigente ? `Mi estado: ${textoDe(vigente)}. Cambiar` : 'Definir mi estado'}
        title={vigente ? `Mi estado: ${textoDe(vigente)}` : 'Definir mi estado'}
        className="flex size-7 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-on-surface/10 hover:text-text-primary"
      >
        <IconoEstado tipo={vigente?.tipo} className="size-4" />
      </button>
      {abierto && <EstadoDialog onOpenChange={setAbierto} actual={vigente} />}
    </>
  );
}

function EstadoDialog({ onOpenChange, actual }: { onOpenChange: (open: boolean) => void; actual: ChatEstado | null }) {
  const definir = useSetMiEstado();
  const limpiar = useClearMiEstado();
  const [tipo, setTipo] = useState<TipoEstadoChat>(actual?.tipo ?? 'DISPONIBLE');
  const [texto, setTexto] = useState(actual?.texto ?? '');
  const [caducidad, setCaducidad] = useState<Caducidad>('nunca');
  const pendiente = definir.isPending || limpiar.isPending;
  const textoLimpio = texto.trim();
  const invalido = tipo === 'PERSONALIZADO' && !textoLimpio;

  const guardar = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalido) return;
    definir.mutate(
      {
        tipo,
        ...(tipo === 'PERSONALIZADO' ? { texto: textoLimpio } : {}),
        venceEn: calcularVenceEn(caducidad),
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: () => toast.error('No se pudo guardar tu estado'),
      },
    );
  };

  const quitar = () =>
    limpiar.mutate(undefined, {
      onSuccess: () => onOpenChange(false),
      onError: () => toast.error('No se pudo limpiar tu estado'),
    });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[380px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={guardar}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Mi estado</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Lo ven las personas con las que tienes un chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoEstadoChat)} aria-label="Estado">
              {OPCIONES.map(({ tipo: valor, etiqueta }) => (
                <label key={valor} htmlFor={`estado-${valor}`} className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
                  <RadioGroupItem id={`estado-${valor}`} value={valor} />
                  <IconoEstado tipo={valor} className="size-4 text-text-secondary" />
                  {etiqueta}
                </label>
              ))}
            </RadioGroup>

            {tipo === 'PERSONALIZADO' && (
              <div>
                <label htmlFor="estado-texto" className="text-xs font-semibold text-on-surface">
                  Texto del estado
                </label>
                <Input
                  id="estado-texto"
                  value={texto}
                  maxLength={60}
                  onChange={(event) => setTexto(event.target.value)}
                  placeholder="Ej. Estudiando para el parcial"
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                  autoFocus
                />
              </div>
            )}

            <div>
              <label htmlFor="estado-caducidad" className="text-xs font-semibold text-on-surface">
                Borrar estado después de
              </label>
              <select
                id="estado-caducidad"
                value={caducidad}
                onChange={(event) => setCaducidad(event.target.value as Caducidad)}
                className="mt-1 h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
              >
                {CADUCIDADES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            {actual && (
              <Button type="button" variant="outline" disabled={pendiente} onClick={quitar} className="h-10 rounded-md border-outline-variant text-xs font-bold sm:mr-auto">
                Limpiar estado
              </Button>
            )}
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => onOpenChange(false)} className="h-10 rounded-md border-outline-variant text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente || invalido} className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
              {definir.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
