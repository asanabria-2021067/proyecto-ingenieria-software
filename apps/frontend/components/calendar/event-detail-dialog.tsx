'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlignLeft, Bell, CalendarDays, ExternalLink, Link2, Loader2, MapPin, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SafeExternalLink } from '@/components/profile/safe-external-link';
import { useCancelEvent } from '@/hooks/use-cancel-event';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { formatTime, toDateKey } from '@/lib/calendar/utils';
import type { MiEventoDTO } from '@/lib/services/events';
import { RECORDATORIO_OPTIONS, requiereLink, requiereUbicacion } from './event-form.schema';

function formatDia(date: Date): string {
  return date.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "lunes, 6 de octubre de 2026 · 09:00–10:00", o inicio y fin completos si cambia de día. */
export function formatRangoEvento(inicio: Date, fin: Date): string {
  if (toDateKey(inicio) === toDateKey(fin)) {
    return `${formatDia(inicio)} · ${formatTime(inicio)}–${formatTime(fin)}`;
  }
  return `${formatDia(inicio)} ${formatTime(inicio)} – ${formatDia(fin)} ${formatTime(fin)}`;
}

function textoRecordatorio(minutos: number): string {
  return RECORDATORIO_OPTIONS.find((opt) => opt.value === minutos)?.label ?? `${minutos} minutos antes`;
}

function Fila({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-meta">{label}</p>
        <div className="type-body break-words text-text-primary">{children}</div>
      </div>
    </div>
  );
}

/**
 * HU-184 (T-324): detalle de un evento al hacer clic en el calendario. Antes
 * el clic abría directo el formulario (líder) o navegaba al proyecto (resto);
 * ahora todos ven primero qué, cuándo, dónde y cómo, y solo quien lidera el
 * proyecto tiene "Editar" y "Cancelar evento".
 */
export function EventDetailDialog({
  evento,
  open,
  onOpenChange,
  editable,
  onEditar,
}: {
  evento: MiEventoDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El usuario lidera el proyecto del evento. */
  editable: boolean;
  onEditar: (evento: MiEventoDTO) => void;
}) {
  const { cancelarEvento, isPending } = useCancelEvent();

  if (!evento) return null;

  const estilo = MODALIDAD_ESTILO[evento.modalidad];
  const inicio = new Date(evento.fechaInicio);
  const fin = new Date(evento.fechaFin);
  const tieneUbicacion = requiereUbicacion(evento.modalidad) && evento.ubicacionLat !== null && evento.ubicacionLng !== null;
  const mapaHref = tieneUbicacion
    ? `https://www.openstreetmap.org/?mlat=${evento.ubicacionLat}&mlon=${evento.ubicacionLng}#map=17/${evento.ubicacionLat}/${evento.ubicacionLng}`
    : null;

  const handleCancelar = async () => {
    if (await cancelarEvento(evento)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-outline-variant bg-surface-container-lowest p-0 sm:max-w-[520px]">
        <DialogHeader className="shrink-0 gap-2 border-b border-outline-variant/35 px-4 pb-4 pt-5 pr-12 text-left sm:px-6">
          <span className={`pill inline-flex w-fit items-center gap-1 ${estilo.relleno}`}>
            <estilo.icon className="size-3" aria-hidden="true" />
            {estilo.label}
          </span>
          <DialogTitle className="text-xl font-bold break-words text-on-surface">{evento.tituloEvento}</DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">{evento.proyecto.tituloProyecto}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <Fila icon={<CalendarDays className="size-4" />} label="Cuándo">
            <span className="first-letter:uppercase">{formatRangoEvento(inicio, fin)}</span>
          </Fila>

          {requiereUbicacion(evento.modalidad) && (
            <Fila icon={<MapPin className="size-4" />} label="Dónde">
              <p>{evento.ubicacionNombre || (tieneUbicacion ? 'Ubicación marcada en el mapa' : 'Sin ubicación')}</p>
              {mapaHref && (
                <a
                  href={mapaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Abrir en el mapa
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </Fila>
          )}

          {requiereLink(evento.modalidad) && (
            <Fila icon={<Link2 className="size-4" />} label="Link de la sesión">
              {evento.linkSesion ? (
                <SafeExternalLink url={evento.linkSesion} className="break-all font-medium text-primary hover:underline">
                  {evento.linkSesion}
                </SafeExternalLink>
              ) : (
                'Sin link'
              )}
            </Fila>
          )}

          <Fila icon={<Bell className="size-4" />} label="Recordatorio">
            {textoRecordatorio(evento.antelacionMinutos)}
          </Fila>

          {evento.descripcionEvento && (
            <Fila icon={<AlignLeft className="size-4" />} label="Descripción">
              <p className="whitespace-pre-line">{evento.descripcionEvento}</p>
            </Fila>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-outline-variant/35 px-4 py-4 sm:justify-between sm:px-6">
          {editable ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => void handleCancelar()}
                className="h-10 gap-1.5 rounded-md border-outline-variant text-xs font-bold text-status-error"
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
                Cancelar evento
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => onEditar(evento)}
                className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar evento
              </Button>
            </>
          ) : (
            <Button asChild className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-on-primary hover:bg-primary/90 sm:ml-auto">
              <Link href={`/dashboard/projects/${evento.proyecto.idProyecto}`}>Ver proyecto</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
