'use client';

import Link from 'next/link';
import { Blend, Bookmark, Check, Clock, Eye, Lock, MapPin, Monitor, Pencil, Pin, Trash2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePinnedProjects } from '@/hooks/use-pinned-projects';
import { useSaveProject } from '@/hooks/use-save-project';
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

// Los badges se pintan por clase, nunca por `style` inline: cada tono
// `pill-*` toma su par fondo/texto de `--color-tag-*` (app/global.css), que
// `.dark` redefine. La forma (radio, alto, tipografía) la da `.pill`.
export const NEUTRAL_BADGE = 'pill-neutral';
const BLUE_BADGE = 'pill-blue';
const PURPLE_BADGE = 'pill-violet';
/** Horas Beca: verde salvia claro. */
const YELLOW_BADGE = 'pill-sage';
export const GREEN_BADGE = 'pill-green';
// Observado / requiere corrección: verde salvia.
const SAGE_BADGE = 'pill-sage';
/**
 * Cierre solicitado: verde bosque sólido (acción). El nombre es histórico —fue
 * dorado— y se mantiene para no tocar a quien lo importa.
 */
export const GOLD_BADGE = 'pill-forest';
/** Cerrado: verde grisáceo apagado, que resta protagonismo a lo ya concluido. */
export const CLOSED_BADGE = 'pill-closed';
/** Tono de texto de `GOLD_BADGE`, para iconos sin fondo. */
export const GOLD_ICON = 'text-tag-forest dark:text-on-tag-forest';
export const SLATE_BADGE = 'pill-slate';

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
  EN_REVISION: NEUTRAL_BADGE,
  OBSERVADO: SAGE_BADGE,
  // Estado informativo (fuera de «Mis Proyectos»): gris sutil, sin parpadeo.
  EN_SOLICITUD_CIERRE: 'pill-subtle',
  CERRADO: CLOSED_BADGE,
  CANCELADO: NEUTRAL_BADGE,
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

/**
 * Mapeo central estado → estilo de etiqueta, único para tarjetas, tablas y
 * «Mis Proyectos». Un estado no contemplado (p. ej. Cancelado) usa el fallback
 * neutral y muestra su valor real.
 */
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

/**
 * «Ver proyecto» de un proyecto cerrado: verde grisáceo desaturado. Lo comparte
 * «Revisar cierre» de la bandeja de solicitudes de cierre del administrador.
 */
export const BOTON_CERRADO =
  'bg-[#64756C] text-white hover:bg-[#57675F] dark:bg-[#453405] dark:text-[#ffd873] dark:hover:bg-[#5a4408]';

/**
 * «Ver mi solicitud» de un proyecto en revisión: neutro claro con borde. Lo
 * comparte «Solicitud enviada» de las tarjetas de Personas (misma espera).
 */
export const BOTON_EN_REVISION =
  'bg-[#F4F5F6] text-[#414850] border border-[#CBD1D6] hover:bg-[#E9EBEC] dark:bg-surface-container-high dark:text-on-surface-variant dark:border-outline-variant dark:hover:bg-surface-container-highest';

/** «Ver proyecto» de un proyecto con cierre solicitado: verde oscuro de marca. */
const BOTON_CIERRE_SOLICITADO = 'text-[13px] font-semibold motion-glow-primary bg-[#0A4232] text-white hover:bg-[#08352A] dark:bg-primary dark:text-on-primary dark:hover:bg-primary/90';

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
        estadoLabel: 'Borrador',
        buttonLabel: 'Seguir editando proyecto',
        buttonHref: `/dashboard/projects/mine/form?id=${idProyecto}`,
        buttonClassName: 'bg-[#E6E9ED] text-[#414850] border border-[#CCD2D8] hover:bg-[#D9DDE2] dark:bg-surface-container-high dark:text-on-surface-variant dark:border-outline-variant dark:hover:bg-surface-container-highest',
        buttonAnimated: false,
        showDelete: true,
      };
    case 'EN_REVISION':
      return {
        estadoLabel: 'En revisión',
        buttonLabel: 'Ver mi solicitud',
        buttonHref: `/dashboard/projects/mine/${idProyecto}`,
        buttonClassName: BOTON_EN_REVISION,
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Clock,
        secondaryIconClassName: 'text-[#414850] dark:text-on-surface-variant',
      };
    case 'OBSERVADO':
      return {
        estadoLabel: 'Observado',
        buttonLabel: 'Editar',
        buttonHref: `/dashboard/projects/mine/${idProyecto}?edit=true`,
        buttonClassName: 'bg-review text-on-review hover:bg-review-strong',
        buttonAnimated: false,
        buttonIcon: Pencil,
        showDelete: true,
      };
    case 'PUBLICADO':
      return {
        estadoLabel: 'Publicado',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/proyectos/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Check,
        secondaryIconClassName: 'text-primary',
      };
    case 'EN_PROGRESO':
      // Mismo tratamiento visual que "Publicado": es un proyecto activo/visible.
      return {
        estadoLabel: 'En progreso',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/proyectos/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Check,
        secondaryIconClassName: 'text-primary',
      };
    case 'CERRADO':
      // Botón desaturado: el acceso sigue disponible como consulta histórica,
      // pero retrocede frente a los proyectos que piden atención.
      return {
        estadoLabel: 'Cerrado',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/proyectos/${idProyecto}`,
        buttonClassName: BOTON_CERRADO,
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Lock,
        secondaryIconClassName: 'text-[#4A6B5D] dark:text-[#ffd873]',
      };
    case 'EN_SOLICITUD_CIERRE':
      return {
        estadoLabel: 'En solicitud de cierre',
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/proyectos/${idProyecto}`,
        // Botón principal sólido: invita a revisar; solo la etiqueta y el reloj parpadean.
        buttonClassName: BOTON_CIERRE_SOLICITADO,
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Clock,
        // El reloj también parpadea entre gris y dorado, sincronizado con el badge/botón.
        secondaryIconClassName: 'blink-gold-gray',
      };
    default:
      // Estados fuera de este flujo (p. ej. Cancelado): acción neutral de
      // solo lectura, sin inventar un texto de estado distinto.
      return {
        estadoLabel: ESTADO_LABEL[estadoProyecto] ?? estadoProyecto,
        buttonLabel: 'Ver proyecto',
        buttonHref: `/dashboard/proyectos/${idProyecto}`,
        buttonClassName: 'bg-primary text-on-primary hover:bg-primary/90',
        buttonAnimated: false,
        showDelete: false,
        secondaryIcon: Eye,
        secondaryIconClassName: 'text-primary',
      };
  }
}

/**
 * Carcasa compartida de las tarjetas de "Explorar Proyectos" y "Mis
 * Proyectos": parte de `.card-base` (radio `card`, sombra `card`, borde
 * tenue y relleno `card` del sistema de diseño) y solo le añade la altura
 * mínima y el realce al pasar el cursor. Tarjeta y skeleton la reutilizan.
 */
const PROJECT_CARD_SHELL = 'card-base flex min-h-56 flex-col';

/**
 * Grilla de ambas vistas. Dos columnas desde `lg`: con la sidebar visible,
 * a 768 px cada columna quedaba más angosta que el footer de la tarjeta.
 */
export const PROJECT_CARD_GRID = 'grid grid-cols-1 gap-grid lg:grid-cols-2';

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

  const { data: currentUser } = useCurrentUser();
  const { isPinned, togglePin, maxAlcanzado } = usePinnedProjects(currentUser?.idUsuario ?? null);
  const anclado = isPinned(idProyecto);

  // "Guardar" (bookmark) solo aplica a "Explorar Proyectos": en "Mis
  // Proyectos" no tiene sentido guardar tu propio proyecto.
  const esExplorar = props.context !== 'mine';
  const guardado = esExplorar && Boolean((proyecto as ProyectoDisponibleResumen).guardado);
  const { guardar, desguardar } = useSaveProject();
  const guardadoPendiente = guardar.isPending || desguardar.isPending;
  const toggleGuardado = () => {
    if (guardadoPendiente) return;
    if (guardado) desguardar.mutate(idProyecto);
    else guardar.mutate(idProyecto);
  };

  const tipoStyle = tipoBadgeStyle(tipoProyecto);
  const ModalidadIcon = MODALIDAD_ICON[modalidadProyecto as ModalidadProyecto] ?? MapPin;

  // «En solicitud de cierre» parpadea solo en «Mis Proyectos»; en el resto es la etiqueta neutral fija.
  const estadoStyle =
    props.context === 'mine' && estadoProyecto === 'EN_SOLICITUD_CIERRE' ? 'pill-forest blink-gold-gray' : estadoBadgeStyle(estadoProyecto);
  let estadoLabelText: string;
  let metadataExtra: React.ReactNode = null;
  let footerLeft: React.ReactNode = null;
  let footerAction: React.ReactNode;

  if (props.context === 'mine') {
    const cfg = mineEstadoConfig(estadoProyecto, idProyecto);
    estadoLabelText = cfg.estadoLabel;

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
          className={`h-9.5 w-56 min-w-0 shrink gap-1.5 rounded-md px-4.5 text-[13px] font-semibold shadow-none ${
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
        className={`w-30 shrink-0 ${PROJECT_ACTION_BUTTON_CLASS}`}
      >
        <Link href={`/dashboard/proyectos/${idProyecto}`}>Ver proyecto</Link>
      </Button>
    );
  }

  return (
    <div
      data-testid={`project-card-${idProyecto}`}
      className={`@container ${PROJECT_CARD_SHELL} hover:border-outline-variant hover:shadow-raised transition-[border-color,box-shadow] duration-180 ease-out`}
    >
      {/* Encabezado: nombre + etiquetas */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-[17px] font-bold leading-5.5 text-on-surface line-clamp-2">
          {tituloProyecto}
        </h3>
        <div className="flex shrink-0 items-start gap-1.5">
          {esExplorar && (
            <button
              type="button"
              onClick={toggleGuardado}
              disabled={guardadoPendiente}
              aria-pressed={guardado}
              aria-label={guardado ? `Quitar ${tituloProyecto} de guardados` : `Guardar ${tituloProyecto}`}
              className={`flex h-6.25 w-6.25 shrink-0 items-center justify-center rounded-[7px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                guardado ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${guardado ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => togglePin({ idProyecto, tituloProyecto })}
            disabled={!anclado && maxAlcanzado}
            aria-pressed={anclado}
            aria-label={anclado ? `Desanclar ${tituloProyecto} del sidebar` : `Anclar ${tituloProyecto} al sidebar`}
            title={!anclado && maxAlcanzado ? 'Ya tienes 5 proyectos anclados' : undefined}
            className={`flex h-6.25 w-6.25 shrink-0 items-center justify-center rounded-[7px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              anclado ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Pin className={`h-3.5 w-3.5 ${anclado ? 'fill-current' : ''}`} />
          </button>
          {/* La tarjeta se angosta en una grilla de 2 columnas aunque el
              viewport sea ancho, por eso el quiebre usa container queries
              (@sm, ligado al ancho real de la tarjeta) y no el breakpoint de
              viewport (sm:), que nunca se activaba dentro del grid. */}
          <div className="flex flex-col items-end gap-1 @sm:flex-row @sm:items-center @sm:gap-2">
            <span
              className={`pill ${tipoStyle}`}
            >
              {tipoBadgeLabel(tipoProyecto)}
            </span>
            <span
              className={`pill ${estadoStyle}`}
            >
              {estadoLabelText}
            </span>
          </div>
        </div>
      </div>

      {/* Descripción */}
      <p className="mt-inline text-[13px] leading-4.5 font-normal text-on-surface-variant line-clamp-3">
        {descripcionProyecto || 'Sin descripción disponible.'}
      </p>

      {/* Metadatos */}
      <div className="mt-stack flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <span className="flex items-center gap-1">
          <ModalidadIcon size={17} className="shrink-0 text-on-surface-variant" />
          <span className="text-on-surface-variant">
            {MODALIDAD_LABEL[modalidadProyecto as ModalidadProyecto] ?? modalidadProyecto}
          </span>
        </span>
        {metadataExtra}
      </div>

      {/* Footer: línea divisoria + acciones, anclados al borde inferior. */}
      <div className="mt-auto pt-card">
        <div
          className={`flex flex-wrap items-center gap-x-inline gap-y-tight border-t border-outline-variant/40 pt-stack ${
            footerLeft ? 'justify-between' : 'justify-end'
          }`}
        >
          {footerLeft}
          <div className="flex min-w-0 items-center gap-2.5">{footerAction}</div>
        </div>
      </div>
    </div>
  );
}

export function AvailableProjectCardSkeleton() {
  return (
    <div className={PROJECT_CARD_SHELL}>
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-[22px] w-3/5" />
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-6.25 w-16 rounded-tag" />
          <Skeleton className="h-6.25 w-16 rounded-tag" />
        </div>
      </div>
      <div className="mt-inline space-y-1.5">
        <Skeleton className="h-[13px] w-full" />
        <Skeleton className="h-[13px] w-11/12" />
        <Skeleton className="h-[13px] w-2/3" />
      </div>
      <div className="mt-stack flex items-center gap-4">
        <Skeleton className="h-[14px] w-16" />
        <Skeleton className="h-[14px] w-14" />
        <Skeleton className="h-[26px] w-28 rounded-full" />
      </div>
      <div className="mt-auto pt-card">
        <div className="flex items-center justify-between gap-inline border-t border-outline-variant/40 pt-stack">
          <Skeleton className="h-[13px] w-28" />
          <Skeleton className="h-9.5 w-30 rounded-md" />
        </div>
      </div>
    </div>
  );
}
