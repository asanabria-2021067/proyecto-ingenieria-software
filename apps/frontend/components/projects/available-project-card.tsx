import Link from 'next/link';
import { Blend, Check, Clock, Eye, Lock, MapPin, Monitor, Pencil, Trash2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MODALIDAD_LABEL, TIPO_LABEL } from '@/types';
import type { ModalidadProyecto, ProyectoResumen, TipoProyecto } from '@/types';
import type { MiProyectoListItemDTO } from '@/lib/dto/project.dto';

export type CreadorProyectoResumen = {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
};

/** Item de la lista de "Proyectos Disponibles": ProyectoResumen + creador + cupos por rol. */
export type ProyectoDisponibleResumen = Omit<ProyectoResumen, 'roles'> & {
  creador?: CreadorProyectoResumen | null;
  roles?: { cupos: number }[];
};

// Los badges se pintan por clase (no por `style` inline) precisamente para
// poder declarar su variante `dark:` — un color de fondo/texto inline no
// puede reaccionar al tema.
export const NEUTRAL_BADGE = 'bg-surface-container-high text-on-surface-variant';
const BLUE_BADGE = 'bg-[#DFEBFF] text-[#1659C7] dark:bg-[#13294d] dark:text-[#7fc4ff]';
const PURPLE_BADGE = 'bg-[#EEE8FF] text-[#6448AE] dark:bg-[#2a1f4d] dark:text-[#c9a6ff]';
const YELLOW_BADGE = 'bg-[#FFF1C4] text-[#956500] dark:bg-[#453405] dark:text-[#ffd873]';
const GREEN_BADGE = 'bg-[#E2F1DD] text-[#286327] dark:bg-[#123a1a] dark:text-[#6fe08a]';
const ORANGE_BADGE = 'bg-[#FBE8D5] text-[#A85A00] dark:bg-[#3a2308] dark:text-[#ffab5c]';
const GOLD_BADGE = 'bg-[#F6E7B0] text-[#775700] dark:bg-[#453405] dark:text-[#ffd873]';
const SLATE_BADGE = 'bg-[#E2E9F7] text-[#486386] dark:bg-[#182740] dark:text-[#9dc1ea]';

const TIPO_BADGE_STYLE: Partial<Record<TipoProyecto, string>> = {
  ACADEMICO_EXPERIENCIA: BLUE_BADGE,
  EXTRACURRICULAR_EXTENSION: PURPLE_BADGE,
  ACADEMICO_HORAS_BECA: YELLOW_BADGE,
};

/** Mapeo central tipo → clase de etiqueta. Un tipo no contemplado usa el fallback neutral y muestra su valor real. */
export function tipoBadgeStyle(tipo: string): string {
  return TIPO_BADGE_STYLE[tipo as TipoProyecto] ?? NEUTRAL_BADGE;
}
export function tipoBadgeLabel(tipo: string): string {
  return TIPO_LABEL[tipo as TipoProyecto] ?? tipo;
}

const ESTADO_BADGE_STYLE: Record<string, string> = {
  // "En progreso" usa el mismo color que "Publicado": ambos representan un
  // proyecto activo/visible, solo cambia el texto de la etiqueta.
  PUBLICADO: GREEN_BADGE,
  EN_PROGRESO: GREEN_BADGE,
  BORRADOR: NEUTRAL_BADGE,
  EN_REVISION: SLATE_BADGE,
  OBSERVADO: ORANGE_BADGE,
  CERRADO: NEUTRAL_BADGE,
};
const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  OBSERVADO: 'Observado',
  PUBLICADO: 'Publicado',
  EN_PROGRESO: 'En progreso',
  EN_SOLICITUD_CIERRE: 'En solicitud de cierre',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};

/** Mapeo central estado → estilo de etiqueta. Un estado no contemplado usa el fallback y muestra su valor real. */
export function estadoBadgeStyle(estado: string): string {
  return ESTADO_BADGE_STYLE[estado] ?? NEUTRAL_BADGE;
}
export function estadoBadgeLabel(estado: string): string {
  return ESTADO_LABEL[estado] ?? estado;
}

export const MODALIDAD_ICON: Record<ModalidadProyecto, typeof MapPin> = {
  PRESENCIAL: MapPin,
  VIRTUAL: Monitor,
  MIXTA: Blend,
};

export function getIniciales(nombre: string, apellido: string): string {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
}

export function formatCantidadRoles(n: number): string {
  return n === 1 ? '1 rol' : `${n} roles`;
}

function formatDisponibilidad(n: number): string {
  if (n === 0) return 'Sin roles disponibles';
  return n === 1 ? '1 rol disponible' : `${n} roles disponibles`;
}

const ESTADO_REVISION_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  OBSERVADA: 'Observada',
};

export function formatFechaCorta(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

interface MineEstadoConfig {
  badgeStyle: string;
  badgeAnimated: boolean;
  estadoLabel: string;
  buttonLabel: string;
  buttonHref: string;
  buttonClassName: string;
  buttonAnimated: boolean;
  buttonIcon?: typeof Pencil;
  showDelete: boolean;
  /** Icono decorativo que ocupa el lugar del botón de eliminar cuando este no aplica. */
  secondaryIcon?: typeof Pencil;
  /** Clase de color del icono decorativo — mismo color que el botón, sin fondo. */
  secondaryIconClassName?: string;
}

const MINE_GRAY = NEUTRAL_BADGE;
const MINE_ORANGE = ORANGE_BADGE;
const MINE_GREEN = GREEN_BADGE;
const MINE_GOLD = GOLD_BADGE;

/**
 * Función central para "Mis Proyectos": a partir del estado real determina
 * texto del badge, clases del badge, texto del botón, clases del botón,
 * ruta/acción y si corresponde mostrar el botón de eliminar. Único lugar
 * donde vive esta lógica — evita condicionales repetidos por tarjeta.
 */
function mineEstadoConfig(estadoProyecto: string, idProyecto: number): MineEstadoConfig {
  switch (estadoProyecto) {
    case 'BORRADOR':
      return {
        badgeStyle: MINE_GRAY,
        badgeAnimated: false,
        estadoLabel: 'Borrador',
        buttonLabel: 'Seguir editando proyecto',
        buttonHref: `/dashboard/projects/mine/form?id=${idProyecto}`,
        buttonClassName: 'bg-[#E6E9ED] text-[#414850] border border-[#CCD2D8] hover:bg-[#D9DDE2] dark:bg-surface-container-high dark:text-on-surface-variant dark:border-outline-variant dark:hover:bg-surface-container-highest',
        buttonAnimated: false,
        showDelete: true,
      };
    case 'EN_REVISION':
      return {
        badgeStyle: MINE_GRAY,
        badgeAnimated: false,
        estadoLabel: 'En revisión',
        buttonLabel: 'Ver mi solicitud',
        buttonHref: `/dashboard/projects/mine/${idProyecto}`,
        buttonClassName: 'bg-[#F4F5F6] text-[#414850] border border-[#CBD1D6] hover:bg-[#E9EBEC] dark:bg-surface-container-high dark:text-on-surface-variant dark:border-outline-variant dark:hover:bg-surface-container-highest',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Clock,
        secondaryIconClassName: 'text-[#414850] dark:text-on-surface-variant',
      };
    case 'OBSERVADO':
      return {
        badgeStyle: MINE_ORANGE,
        badgeAnimated: false,
        estadoLabel: 'Observado',
        buttonLabel: 'Editar',
        buttonHref: `/dashboard/projects/mine/${idProyecto}?edit=true`,
        buttonClassName: 'bg-amber-600 text-white hover:bg-amber-700',
        buttonAnimated: false,
        buttonIcon: Pencil,
        showDelete: true,
      };
    case 'PUBLICADO':
      return {
        badgeStyle: MINE_GREEN,
        badgeAnimated: false,
        estadoLabel: 'Publicado',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/projects/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Check,
        secondaryIconClassName: 'text-primary',
      };
    case 'EN_PROGRESO':
      // Mismo tratamiento visual que "Publicado": es un proyecto activo/visible.
      return {
        badgeStyle: MINE_GREEN,
        badgeAnimated: false,
        estadoLabel: 'En progreso',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/projects/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Check,
        secondaryIconClassName: 'text-primary',
      };
    case 'CERRADO':
      // El botón usa exactamente el mismo dorado que la etiqueta de estado.
      return {
        badgeStyle: MINE_GOLD,
        badgeAnimated: false,
        estadoLabel: 'Cerrado',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/projects/${idProyecto}`,
        buttonClassName: 'bg-[#F6E7B0] text-[#775700] hover:bg-[#F0DA95] dark:bg-[#453405] dark:text-[#ffd873] dark:hover:bg-[#5a4408]',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Lock,
        secondaryIconClassName: 'text-[#775700] dark:text-[#ffd873]',
      };
    case 'EN_SOLICITUD_CIERRE':
      return {
        badgeStyle: MINE_GRAY,
        badgeAnimated: true,
        estadoLabel: 'En solicitud de cierre',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/projects/${idProyecto}`,
        buttonClassName: '',
        buttonAnimated: true,
        showDelete: false,
        secondaryIcon: Clock,
        // El reloj también parpadea entre gris y dorado, sincronizado con el badge/botón.
        secondaryIconClassName: 'blink-gold-gray',
      };
    default:
      // Estados fuera de este flujo (p. ej. Cancelado): acción neutral de
      // solo lectura, sin inventar un texto de estado distinto.
      return {
        badgeStyle: NEUTRAL_BADGE,
        badgeAnimated: false,
        estadoLabel: ESTADO_LABEL[estadoProyecto] ?? estadoProyecto,
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/projects/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Eye,
        secondaryIconClassName: 'text-primary',
      };
  }
}

export type AvailableProjectCardProps =
  | { context?: 'explore'; proyecto: ProyectoDisponibleResumen }
  | { context: 'mine'; proyecto: MiProyectoListItemDTO; onDelete?: () => void };

/**
 * Tarjeta compartida entre "Explorar Proyectos" y "Mis Proyectos". La
 * estructura visual (carcasa, encabezado, descripción, línea divisoria) es
 * una sola implementación; solo los metadatos y el footer cambian según
 * `context`, ya que las dos vistas consumen formas de datos distintas
 * (roles/creador/intereses en "explore"; historial de revisión en "mine").
 */
export function AvailableProjectCard(props: AvailableProjectCardProps) {
  const { proyecto } = props;
  const { idProyecto, tituloProyecto, descripcionProyecto, tipoProyecto, modalidadProyecto, estadoProyecto } =
    proyecto;

  const tipoStyle = tipoBadgeStyle(tipoProyecto);
  const ModalidadIcon = MODALIDAD_ICON[modalidadProyecto as ModalidadProyecto] ?? MapPin;

  let estadoStyle: string;
  let estadoLabelText: string;
  let estadoAnimated = false;
  let metadataExtra: React.ReactNode = null;
  let footerLeft: React.ReactNode = null;
  let footerAction: React.ReactNode;

  if (props.context === 'mine') {
    const cfg = mineEstadoConfig(estadoProyecto, idProyecto);
    estadoStyle = cfg.badgeStyle;
    estadoLabelText = cfg.estadoLabel;
    estadoAnimated = cfg.badgeAnimated;

    const revision = props.proyecto.revisiones?.[0] ?? null;
    metadataExtra =
      estadoProyecto === 'BORRADOR' ? (
        <span className="text-on-surface-variant">Proyecto aún no enviado</span>
      ) : revision ? (
        <>
          <span className="text-on-surface-variant">
            Última revisión: {ESTADO_REVISION_LABEL[revision.estadoRevision] ?? revision.estadoRevision}
          </span>
          <span className="text-on-surface-variant">Envío #{revision.numeroEnvio}</span>
        </>
      ) : props.proyecto.fechaActualizacion ? (
        <span className="text-on-surface-variant">Actualizado: {formatFechaCorta(props.proyecto.fechaActualizacion)}</span>
      ) : null;

    const Icon = cfg.buttonIcon;
    const SecondaryIcon = cfg.secondaryIcon;
    const onDelete = props.onDelete;
    footerAction = (
      <>
        <Button
          asChild
          className={`h-9.5 w-56 shrink-0 gap-1.5 rounded-md px-4.5 text-[13px] font-semibold shadow-none ${
            cfg.buttonAnimated ? 'blink-gold-gray' : cfg.buttonClassName
          }`}
        >
          <Link href={cfg.buttonHref}>
            {Icon && <Icon className="h-4 w-4" />}
            {cfg.buttonLabel}
          </Link>
        </Button>
        {cfg.showDelete ? (
          <button
            type="button"
            onClick={() => onDelete?.()}
            aria-label={`Eliminar proyecto ${tituloProyecto}`}
            className="inline-flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-md bg-error text-on-error transition-colors hover:bg-error/90"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          SecondaryIcon && (
            <div
              aria-hidden="true"
              className={`inline-flex h-9.5 w-9.5 shrink-0 items-center justify-center ${cfg.secondaryIconClassName ?? ''}`}
            >
              <SecondaryIcon className="h-4 w-4" />
            </div>
          )
        )}
      </>
    );
  } else {
    estadoStyle = estadoBadgeStyle(estadoProyecto);
    estadoLabelText = estadoBadgeLabel(estadoProyecto);

    const roles = props.proyecto.roles ?? [];
    const totalRoles = props.proyecto._count?.roles ?? roles.length;
    const rolesDisponibles = roles.filter((r) => r.cupos > 0).length;
    const chip =
      props.proyecto.intereses?.[0]?.interes.nombreInteres ??
      props.proyecto.organizaciones?.[0]?.organizacion.nombreOrganizacion ??
      null;
    const creador = props.proyecto.creador ?? null;

    metadataExtra = (
      <>
        <span className="flex items-center gap-1">
          <Users size={17} className="shrink-0 text-on-surface-variant" />
          <span className="text-on-surface-variant">{formatCantidadRoles(totalRoles)}</span>
        </span>

        {creador ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar className="h-[26px] w-[26px] shrink-0">
              {creador.fotoUrl && <AvatarImage src={creador.fotoUrl} alt="" />}
              <AvatarFallback
                className="text-[10px] font-bold text-white"
                style={{ backgroundColor: '#075B5A' }}
              >
                {getIniciales(creador.nombre, creador.apellido)}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[160px] truncate text-on-surface-variant">
              Responsable: {creador.nombre.charAt(0)}. {creador.apellido}
            </span>
          </span>
        ) : (
          <span className="text-on-surface-variant">Responsable no disponible</span>
        )}

        {chip && (
          <span className="rounded-md bg-surface-container-high px-3 py-1.5 text-[11px] text-on-surface-variant">{chip}</span>
        )}
      </>
    );

    footerLeft = (
      <span className="text-[13px] font-semibold text-on-surface">{formatDisponibilidad(rolesDisponibles)}</span>
    );
    footerAction = (
      <Button
        asChild
        className="h-9.5 w-30 shrink-0 rounded-md bg-primary px-4.5 text-[13px] font-semibold text-on-primary shadow-none hover:bg-primary/90"
      >
        <Link href={`/dashboard/proyectos/${idProyecto}`}>Ver proyecto</Link>
      </Button>
    );
  }

  return (
    <div className="@container flex flex-col bg-surface-container-lowest border border-[#D3DDD3] dark:border-outline-variant hover:border-[#A9BFAE] dark:hover:border-primary/50 rounded-[10px] p-4.5 min-h-47 shadow-[0_1px_3px_rgba(24,28,32,0.05)] hover:shadow-[0_2px_5px_rgba(24,28,32,0.08)] transition-[border-color,box-shadow] duration-180 ease-out">
      {/* Encabezado: nombre + etiquetas */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-[17px] font-bold leading-5.5 text-on-surface line-clamp-2">
          {tituloProyecto}
        </h3>
        {/* La tarjeta se angosta en una grilla de 2 columnas aunque el
            viewport sea ancho, por eso el quiebre usa container queries
            (@sm, ligado al ancho real de la tarjeta) y no el breakpoint de
            viewport (sm:), que nunca se activaba dentro del grid. */}
        <div className="flex shrink-0 flex-col items-end gap-1 @sm:flex-row @sm:items-center @sm:gap-2">
          <span
            className={`inline-flex h-6.25 items-center rounded-[7px] px-3 text-[12px] font-semibold whitespace-nowrap ${tipoStyle}`}
          >
            {tipoBadgeLabel(tipoProyecto)}
          </span>
          <span
            className={`inline-flex h-6.25 items-center rounded-[7px] px-3 text-[12px] font-semibold whitespace-nowrap ${
              estadoAnimated ? 'blink-gold-gray' : estadoStyle
            }`}
          >
            {estadoLabelText}
          </span>
        </div>
      </div>

      {/* Descripción */}
      <p className="mt-2 text-[13px] leading-4.5 font-normal text-on-surface-variant line-clamp-3">
        {descripcionProyecto || 'Sin descripción disponible.'}
      </p>

      {/* Metadatos */}
      <div className="mt-[14px] flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="flex items-center gap-1">
          <ModalidadIcon size={17} className="shrink-0 text-on-surface-variant" />
          <span className="text-on-surface-variant">
            {MODALIDAD_LABEL[modalidadProyecto as ModalidadProyecto] ?? modalidadProyecto}
          </span>
        </span>
        {metadataExtra}
      </div>

      {/* Línea divisoria */}
      <div className="mt-[13px] mb-[10px] border-t border-outline-variant/40" />

      {/* Footer */}
      <div className={`mt-auto flex items-center gap-2.5 ${footerLeft ? 'justify-between' : 'justify-end'}`}>
        {footerLeft}
        <div className="flex items-center gap-2.5">{footerAction}</div>
      </div>
    </div>
  );
}

export function AvailableProjectCardSkeleton() {
  return (
    <div className="flex flex-col bg-surface-container-lowest border border-[#D3DDD3] dark:border-outline-variant rounded-[10px] p-4.5 min-h-47 shadow-[0_1px_3px_rgba(24,28,32,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-[22px] w-3/5" />
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-6.25 w-16 rounded-[7px]" />
          <Skeleton className="h-6.25 w-16 rounded-[7px]" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-[13px] w-full" />
        <Skeleton className="h-[13px] w-11/12" />
        <Skeleton className="h-[13px] w-2/3" />
      </div>
      <div className="mt-[14px] flex items-center gap-4">
        <Skeleton className="h-[14px] w-16" />
        <Skeleton className="h-[14px] w-14" />
        <Skeleton className="h-[26px] w-28 rounded-full" />
      </div>
      <div className="mt-[13px] mb-[10px] border-t border-outline-variant/40" />
      <div className="mt-auto flex items-center justify-between gap-3">
        <Skeleton className="h-[13px] w-28" />
        <Skeleton className="h-9.5 w-30 rounded-md" />
      </div>
    </div>
  );
}
