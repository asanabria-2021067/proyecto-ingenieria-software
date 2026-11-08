'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AtSign,
  Bell,
  ClipboardList,
  Clock3,
  FolderKanban,
  Landmark,
  MessageCircle,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { identidadDeAviso, inicialesDe } from '@/lib/notifications/inbox-model';
import { cn } from '@/lib/utils';

export const DURACION_AVISO_MS = 8_000;

export type CategoriaAviso =
  | 'tarea'
  | 'mencion'
  | 'postulacion'
  | 'cierre'
  | 'chat'
  | 'organizacion'
  | 'horas'
  | 'sistema';

/** Un tono por categoría, todos de components/ui/tag.tsx (`bg-tag-*` / `text-on-tag-*`, AA en claro y oscuro). */
const CATEGORIAS: Record<CategoriaAviso, { icon: LucideIcon; insignia: string; barra: string; accion: string }> = {
  tarea: { icon: ClipboardList, insignia: 'bg-tag-blue text-on-tag-blue', barra: 'bg-on-tag-blue', accion: 'Ver tarea' },
  mencion: { icon: AtSign, insignia: 'bg-tag-violet text-on-tag-violet', barra: 'bg-on-tag-violet', accion: 'Ver comentario' },
  postulacion: { icon: UserCheck, insignia: 'bg-tag-turquoise text-on-tag-turquoise', barra: 'bg-on-tag-turquoise', accion: 'Ver postulación' },
  cierre: { icon: FolderKanban, insignia: 'bg-tag-closed text-on-tag-closed', barra: 'bg-on-tag-closed', accion: 'Ver' },
  chat: { icon: MessageCircle, insignia: 'bg-tag-green text-on-tag-green', barra: 'bg-on-tag-green', accion: 'Abrir chat' },
  organizacion: { icon: Landmark, insignia: 'bg-tag-forest text-on-tag-forest', barra: 'bg-on-tag-forest', accion: 'Ver' },
  horas: { icon: Clock3, insignia: 'bg-tag-amber text-on-tag-amber', barra: 'bg-on-tag-amber', accion: 'Ver mis horas' },
  sistema: { icon: Bell, insignia: 'bg-tag-slate text-on-tag-slate', barra: 'bg-on-tag-slate', accion: 'Ver' },
};

/** Categoría por palabra clave del tipo (mismo criterio que `iconoDeTipo`); lo desconocido cae en `sistema`. */
export function categoriaDeAviso(tipo: string): CategoriaAviso {
  // Antes que MENCION/COMENTARIO: MENCION_CHAT es del chat.
  if (/CHAT|MENSAJE/.test(tipo)) return 'chat';
  if (/MENCION|COMENTARIO/.test(tipo)) return 'mencion';
  if (/CIERRE/.test(tipo)) return 'cierre';
  if (/POSTULACION|INVITACION_ROL|^ROL_/.test(tipo)) return 'postulacion';
  if (/ORGANIZACION|ASOCIACION|JUNTA/.test(tipo)) return 'organizacion';
  if (/HORAS/.test(tipo)) return 'horas';
  if (/TAREA|HITO/.test(tipo)) return 'tarea';
  return 'sistema';
}

export type Severidad = 'info' | 'exito' | 'alerta' | 'urgente' | 'neutral';

/**
 * Inventario de avisos en vivo: el backend solo empuja `notification` por socket (los demás eventos
 * SPRINT_*, TASK_HOURS_LOGGED… invalidan queries y no muestran aviso). Severidad por tipo:
 *  urgente: lo atrasado o de seguridad. alerta: vence pronto, riesgo, rechazo o cambio de acceso.
 *  exito: aprobado, aceptado o acreditado. neutral: resúmenes y tipos que el catálogo aún no conoce. info: el resto.
 */
const URGENTES: Record<string, string> = { HITO_ATRASADO: 'Atrasado', ALERTA_SEGURIDAD: 'Urgente' };
const ALERTAS: Record<string, string> = {
  TAREA_POR_VENCER: 'Por vencer',
  RECORDATORIO_EVENTO: 'Próximo',
  RECORDATORIO_HORAS: 'Recordatorio',
  RECORDATORIO_MENSAJE: 'Recordatorio',
  HORAS_EN_RIESGO: 'En riesgo',
  PROYECTO_ADVERTENCIA_INACTIVIDAD: 'Atención',
  NUEVO_INICIO_SESION: 'Seguridad',
  SOLICITUD_DESACTIVACION: 'Seguridad',
  SOLICITUD_RECUPERACION_CONTRASENA: 'Seguridad',
  CUENTA_PENDIENTE_VERIFICACION: 'Atención',
  CIERRE_RECHAZADO: 'Rechazado',
  PROYECTO_OBSERVADO: 'Observado',
  POSTULACION_RECHAZADA_POR_CIERRE: 'Atención',
  CIERRE_CORRECCION_DOCUMENTAL: 'Atención',
  CIERRE_DEVUELTO_A_EJECUCION: 'Atención',
  ROL_ABANDONADO: 'Atención',
  APELACION_LIDERAZGO_RECIBIDA: 'Atención',
  REPORTE_PERFIL: 'Atención',
};
const EXITOS = new Set([
  'PROYECTO_APROBADO',
  'CIERRE_APROBADO',
  'HORAS_VALIDADAS',
  'HORAS_ACREDITADAS',
  'HORAS_CONSOLIDADAS',
  'CERTIFICADO_EMITIDO',
  'INSIGNIA_OBTENIDA',
  'CUENTA_VERIFICADA',
  'AMISTAD_ACEPTADA',
  'RECONOCIMIENTO_RECIBIDO',
]);
const NEUTRALES = new Set(['TU_SEMANA']);

export function severidadDeAviso(n: AvisoEnVivo): { nivel: Severidad; etiqueta: string | null } {
  const t = n.tipoNotificacion;
  if (URGENTES[t]) return { nivel: 'urgente', etiqueta: URGENTES[t] };
  if (ALERTAS[t]) return { nivel: 'alerta', etiqueta: ALERTAS[t] };
  if (t === 'POSTULACION_RESUELTA') {
    return n.datosJson?.accepted === false ? { nivel: 'alerta', etiqueta: 'Rechazada' } : { nivel: 'exito', etiqueta: 'Aceptada' };
  }
  if (EXITOS.has(t)) return { nivel: 'exito', etiqueta: 'Listo' };
  if (NEUTRALES.has(t) || categoriaDeAviso(t) === 'sistema') return { nivel: 'neutral', etiqueta: null };
  return { nivel: 'info', etiqueta: null };
}

/** Informativos y de éxito 8 s; las alertas 12 s; lo urgente se queda hasta cerrarlo. */
export const DURACION_POR_SEVERIDAD: Record<Severidad, number> = {
  info: DURACION_AVISO_MS,
  neutral: DURACION_AVISO_MS,
  exito: DURACION_AVISO_MS,
  alerta: 12_000,
  urgente: Infinity,
};

// Solo tonos de tag.tsx: borde izquierdo y chip de la severidad.
const SEVERIDAD_UI: Record<Severidad, { borde: string; chip: string } | null> = {
  info: null,
  neutral: null,
  exito: { borde: 'border-l-4 border-l-on-tag-success', chip: 'bg-tag-success text-on-tag-success' },
  alerta: { borde: 'border-l-4 border-l-on-tag-amber', chip: 'bg-tag-amber text-on-tag-amber' },
  urgente: { borde: 'border-l-4 border-l-on-tag-red', chip: 'bg-tag-red text-on-tag-red' },
};

/** El socket no trae fecha: se cuenta desde que llegó el aviso. */
export function tiempoRelativo(desde: number, ahora: number): string {
  const seg = Math.max(0, Math.floor((ahora - desde) / 1000));
  if (seg < 60) return 'hace un momento';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

// Campos con el nombre de quien origina el aviso que el catálogo del buzón aún no cubre (p. ej. TAREA_ASIGNADA).
const CAMPOS_ACTOR = ['assignedBy', 'unassignedBy', 'autorNombre', 'userName'];

function actorDe(n: AvisoEnVivo): string | null {
  const identidad = identidadDeAviso({ tipoNotificacion: n.tipoNotificacion, datosJson: n.datosJson ?? null });
  if (identidad.tipo === 'persona') return identidad.nombre;
  for (const campo of CAMPOS_ACTOR) {
    const valor = n.datosJson?.[campo];
    if (typeof valor === 'string' && inicialesDe(valor)) return valor.trim();
  }
  return null;
}

export interface AvisoEnVivo {
  tipoNotificacion: string;
  tituloNotificacion: string;
  mensajeNotificacion?: string | null;
  datosJson?: Record<string, unknown> | null;
}

interface Props {
  id: string | number;
  aviso: AvisoEnVivo;
  /** Destino del botón principal; sin él no hay botón. */
  href?: string | null;
  /** Etiqueta del botón principal; por defecto la de la categoría. */
  accion?: string;
  recibidaEn?: number;
  /** Por defecto la de su severidad; `Infinity` = hasta cerrarlo. */
  duracion?: number;
}

export function NotificacionToast({ id, aviso, href, accion, recibidaEn, duracion: duracionProp }: Props) {
  const router = useRouter();
  const categoria = categoriaDeAviso(aviso.tipoNotificacion);
  const { icon: Icono, insignia, barra, accion: accionPorDefecto } = CATEGORIAS[categoria];
  const actor = actorDe(aviso);
  const { nivel, etiqueta } = severidadDeAviso(aviso);
  const urgenteUi = SEVERIDAD_UI[nivel];
  const duracion = duracionProp ?? DURACION_POR_SEVERIDAD[nivel];
  const fijo = !Number.isFinite(duracion);

  const [llegada] = useState(() => recibidaEn ?? Date.now());
  const [ahora, setAhora] = useState(llegada);
  const [pausado, setPausado] = useState(false);
  const [enFoco, setEnFoco] = useState(false);
  // Barra: 1 = tiempo completo, 0 = agotado. Corre con una transición lineal y, al pausar, se congela en lo restante.
  const [restante, setRestante] = useState(fijo ? 0 : duracion);
  const [montado, setMontado] = useState(false);
  const inicio = useRef(0);
  const restanteRef = useRef(fijo ? 0 : duracion);
  const detenido = pausado || enFoco;
  const corriendo = montado && !detenido;

  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Primer fotograma a barra llena; después arranca la transición.
  useEffect(() => {
    const t = window.setTimeout(() => setMontado(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Layout effect: al pausar, lo restante se fija antes de pintar y la barra no parpadea.
  useLayoutEffect(() => {
    if (detenido || fijo) return;
    inicio.current = Date.now();
    const fin = window.setTimeout(() => toast.dismiss(id), restanteRef.current);
    return () => {
      window.clearTimeout(fin);
      restanteRef.current = Math.max(0, restanteRef.current - (Date.now() - inicio.current));
      setRestante(restanteRef.current);
    };
  }, [detenido, fijo, id]);

  const ir = () => {
    toast.dismiss(id);
    if (href) router.push(href);
  };

  return (
    <div
      // Sonner ya envuelve el aviso en <section aria-live="polite">; solo lo urgente se eleva a assertive.
      role={nivel === 'urgente' ? 'alert' : undefined}
      data-slot="notificacion-toast"
      data-categoria={categoria}
      data-severidad={nivel}
      data-duracion={fijo ? 'fija' : duracion}
      data-tipo={aviso.tipoNotificacion}
      data-pausado={detenido || undefined}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setEnFoco(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEnFoco(false);
      }}
      className={cn('animate-in fade-in-0 slide-in-from-top-2 relative w-full overflow-hidden rounded-card border border-outline-variant bg-card text-text-primary shadow-raised duration-200 motion-reduce:animate-none', urgenteUi?.borde)}
    >
      <div className="flex gap-3 p-card pb-3">
        <div className="relative shrink-0 self-start">
          {actor ? (
            <Avatar data-slot="notificacion-toast-avatar" className="size-10 bg-tag-sage text-on-tag-sage" aria-hidden="true">
              <AvatarFallback className="bg-transparent text-sm font-semibold leading-none">{inicialesDe(actor)}</AvatarFallback>
            </Avatar>
          ) : (
            <span data-slot="notificacion-toast-icono" className={cn('flex size-10 items-center justify-center rounded-full', insignia)}>
              <Icono className="size-5" aria-hidden="true" />
            </span>
          )}
          {actor && (
            <span
              data-slot="notificacion-toast-icono"
              className={cn('absolute -right-2 -bottom-2 flex size-5 items-center justify-center rounded-full ring-2 ring-card', insignia)}
            >
              <Icono className="size-3" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pr-6">
          {etiqueta && urgenteUi && (
            <span data-slot="notificacion-toast-severidad" className={cn('pill pill-sm mb-1', urgenteUi.chip)}>
              {etiqueta}
            </span>
          )}
          <p className="type-body font-bold">{aviso.tituloNotificacion}</p>
          {aviso.mensajeNotificacion && (
            <p data-slot="notificacion-toast-mensaje" className="type-meta mt-0.5 line-clamp-2">
              {aviso.mensajeNotificacion}
            </p>
          )}
          <p className="type-micro mt-1 text-text-secondary">{tiempoRelativo(llegada, ahora)}</p>
        </div>
      </div>
      {href && (
        <div className="flex justify-end px-card pb-3">
          <Button type="button" size="sm" onClick={ir}>
            {accion ?? (aviso.tipoNotificacion.includes('HITO') ? 'Ver hito' : accionPorDefecto)}
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Cerrar aviso"
        className="absolute top-2 right-2 size-7"
        onClick={() => toast.dismiss(id)}
      >
        <X aria-hidden="true" />
      </Button>
      {!fijo && <div className="h-1 w-full bg-surface-container motion-reduce:hidden" aria-hidden="true">
        <div
          data-slot="notificacion-toast-progreso"
          className={cn('h-full w-full origin-left ease-linear', barra)}
          style={{
            transform: `scaleX(${corriendo ? 0 : restante / duracion})`,
            transitionProperty: 'transform',
            transitionDuration: corriendo ? `${restante}ms` : '0ms',
          }}
        />
      </div>}
    </div>
  );
}

/** Aviso en vivo personalizado. `duration: Infinity`: el temporizador (con pausa) vive en el componente. */
export function mostrarNotificacionToast(aviso: AvisoEnVivo, opciones: { href?: string | null; accion?: string } = {}) {
  return toast.custom((id) => <NotificacionToast id={id} aviso={aviso} href={opciones.href} accion={opciones.accion} />, {
    duration: Infinity,
  });
}
