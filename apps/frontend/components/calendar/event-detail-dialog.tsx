'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlignLeft, Bell, CalendarDays, Eye, ExternalLink, Link2, Loader2, MapPin, Pencil, Trash2, Users } from 'lucide-react';
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
import { useProjectMembers } from '@/hooks/use-project-members';
import { MODALIDAD_ESTILO } from '@/lib/calendar/modalidad';
import { TIPO_EVENTO_ESTILO, TONO_CLASES } from '@/lib/calendar/paleta';
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
  if (minutos === 0) return 'Sin recordatorio';
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
 * proyecto tiene "Editar" y "Eliminar evento". Un evento de un calendario
 * compartido se ve en solo lectura y sin enlace al proyecto (quien lo ve
 * puede no ser integrante).
 */
export function EventDetailDialog({
  evento,
  open,
  onOpenChange,
  editable,
  onEditar,
  compartidoPor = null,
}: {
  evento: MiEventoDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El usuario lidera el proyecto del evento. */
  editable: boolean;
  onEditar: (evento: MiEventoDTO) => void;
  /** HU-184: el evento viene del calendario que esta persona me compartió. */
  compartidoPor?: { nombre: string } | null;
}) {
  const { cancelarEvento, isPending } = useCancelEvent();
  // Nombres de los invitados: solo si soy del proyecto (en uno compartido no tengo acceso al equipo).
  const idProyectoEquipo = evento && !compartidoPor && evento.invitados.length > 0 ? evento.idProyecto : 0;
  const { members } = useProjectMembers(idProyectoEquipo);

  if (!evento) return null;

  const estilo = MODALIDAD_ESTILO[evento.modalidad];
  const tipo = TIPO_EVENTO_ESTILO[evento.tipoEvento];
  const puedeEditar = editable && !compartidoPor;
  const nombresInvitados = idProyectoEquipo === 0 ? [] : [
    ...new Map(members.filter((m) => evento.invitados.includes(m.idUsuario)).map((m) => [m.idUsuario, `${m.nombre} ${m.apellido}`])).values(),
  ];
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
          <div className="flex flex-wrap gap-tight">
            <span className={`pill inline-flex w-fit items-center gap-1 ${TONO_CLASES[tipo.tono].bloque}`}>
              <tipo.icon className="size-3" aria-hidden="true" />
              {tipo.label}
            </span>
            <span className="pill pill-neutral inline-flex w-fit items-center gap-1">
              <estilo.icon className="size-3" aria-hidden="true" />
              {estilo.label}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold break-words text-on-surface">{evento.tituloEvento}</DialogTitle>
          <DialogDescription className="text-sm text-on-surface-variant">{evento.proyecto.tituloProyecto}</DialogDescription>
          {compartidoPor && (
            <p className="type-meta inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden="true" />
              Calendario de {compartidoPor.nombre} · solo lectura
            </p>
          )}
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

          <Fila icon={<Users className="size-4" />} label="Para quién">
            {evento.invitados.length === 0
              ? 'Todo el proyecto'
              : nombresInvitados.length > 0
                ? nombresInvitados.join(', ')
                : `${evento.invitados.length} ${evento.invitados.length === 1 ? 'invitado' : 'invitados'}`}
          </Fila>

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
          {compartidoPor ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold sm:ml-auto"
            >
              Cerrar
            </Button>
          ) : puedeEditar ? (
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
                Eliminar evento
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
