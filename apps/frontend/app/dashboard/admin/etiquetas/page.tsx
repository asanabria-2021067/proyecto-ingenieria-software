'use client';

import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, CheckCircle, Clock, Minus, XCircle } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import {
  CLOSED_BADGE,
  GOLD_BADGE,
  GREEN_BADGE,
  NEUTRAL_BADGE,
  SLATE_BADGE,
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { ExitRequestBadge } from '@/components/projects/member-exit-request-actions';
import { ESTADO_PARTICIPACION_STYLE } from '@/components/projects/member-status.utils';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { Badge } from '@/components/ui/badge';
import { SITUACION_SPRINT_LABEL, SITUACION_SPRINT_TONE } from '@/lib/admin/sprint-calendar';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';

/**
 * VISTA TEMPORAL — inventario de las etiquetas (pills, badges y chips) que usa
 * la aplicación, en vistas de estudiante y de administrador, para revisarlas
 * juntas. No forma parte del producto: se elimina al terminar la revisión.
 *
 * «En vivo» = la etiqueta se pinta con el componente o la constante real, así
 * que refleja cualquier cambio. «Copia» = el mapa de estilos es privado de su
 * página (un `page.tsx` no puede exportarlo) y aquí se replican sus clases; si
 * la página cambia, esta copia no se entera.
 */

// Formas reales de etiqueta, tal como las escribe cada vista.
const PILL = 'pill';
const TARJETA = 'inline-flex h-6.25 items-center rounded-[7px] px-3 text-[12px] font-semibold whitespace-nowrap';
const REDONDA = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap';
const REDONDA_GRANDE = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold';
const REDONDA_11 = 'w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold';
const MODALIDAD = 'inline-flex h-6.5 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap';

type Vista = 'Estudiante' | 'Admin' | 'Ambas';
type Origen = 'En vivo' | 'Copia';

function Grupo({
  titulo,
  vista,
  origen,
  fuente,
  children,
}: {
  titulo: string;
  vista: Vista;
  origen: Origen;
  fuente: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-base">
      <div className="flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro">
        <h2 className="type-subtitle font-semibold">{titulo}</h2>
        <p className="type-meta">
          {vista} · {origen}
        </p>
      </div>
      <p className="type-meta mt-micro break-all font-mono">{fuente}</p>
      <div className="mt-stack flex flex-wrap items-center gap-tight">{children}</div>
    </section>
  );
}

const chip = (forma: string, clase: string, texto: string) => (
  <span key={`${texto}-${clase}`} className={`${forma} ${clase}`}>
    {texto}
  </span>
);

const TIPOS = ['ACADEMICO_HORAS_BECA', 'EXTRACURRICULAR_EXTENSION', 'ACADEMICO_EXPERIENCIA'];
const ESTADOS_PROYECTO = ['BORRADOR', 'EN_REVISION', 'OBSERVADO', 'PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO', 'CANCELADO'];

export default function AdminEtiquetasPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb seccion="Administración" pagina="Etiquetas (temporal)" />
      <header className="mb-6">
        <h1 className="type-display text-balance">Etiquetas</h1>
        <p className="mt-tight max-w-3xl text-base text-tertiary">
          Vista temporal de revisión: reúne las etiquetas de estado, categoría y prioridad que usa UVGenius en las
          vistas de estudiante y de administrador. «En vivo» usa el componente real; «Copia» replica las clases de un
          mapa privado de su página.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
        <Grupo titulo="Clases base «pill»" vista="Ambas" origen="En vivo" fuente="app/global.css (.pill, .pill-*)">
          {['pill-neutral', 'pill-accent', 'pill-success', 'pill-warning', 'pill-error'].map((c) => chip(PILL, c, c))}
        </Grupo>

        <Grupo titulo="Categoría del proyecto" vista="Ambas" origen="En vivo" fuente="components/projects/available-project-card.tsx · tipoBadgeStyle">
          {TIPOS.map((t) => chip(TARJETA, tipoBadgeStyle(t), tipoBadgeLabel(t)))}
        </Grupo>

        <Grupo titulo="Estado del proyecto" vista="Ambas" origen="En vivo" fuente="components/projects/available-project-card.tsx · estadoBadgeStyle">
          {ESTADOS_PROYECTO.map((e) => chip(TARJETA, estadoBadgeStyle(e), estadoBadgeLabel(e)))}
          {chip(TARJETA, 'blink-gold-gray', 'En solicitud de cierre (Mis Proyectos)')}
          <span className="inline-flex h-8 items-center rounded-md bg-[#0A4232] px-3 text-xs font-semibold text-white dark:bg-primary dark:text-on-primary">
            Ver proyecto (cierre solicitado)
          </span>
          <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-on-primary">
            Ver proyecto (publicado / en progreso)
          </span>
          <span className="inline-flex h-8 items-center rounded-md bg-[#64756C] px-3 text-xs font-semibold text-white dark:bg-[#453405] dark:text-[#ffd873]">
            Ver proyecto (cerrado)
          </span>
        </Grupo>

        <Grupo titulo="Paleta compartida de etiquetas" vista="Ambas" origen="En vivo" fuente="components/projects/available-project-card.tsx · *_BADGE">
          {chip(TARJETA, NEUTRAL_BADGE, 'Neutral')}
          {chip(TARJETA, GREEN_BADGE, 'Verde')}
          {chip(TARJETA, GOLD_BADGE, 'Cierre solicitado')}
          {chip(TARJETA, CLOSED_BADGE, 'Cerrado')}
          {chip(TARJETA, SLATE_BADGE, 'Pizarra')}
          {chip(PILL, SLATE_BADGE, 'Líder')}
          {chip(PILL, 'pill-neutral', 'Participación finalizada')}
        </Grupo>

        <Grupo titulo="Modalidad del proyecto" vista="Estudiante" origen="Copia" fuente="app/dashboard/proyectos/[id]/page.tsx · MODALIDAD_BADGE">
          {['Presencial', 'Virtual', 'Mixta'].map((m) => chip(MODALIDAD, 'bg-surface-container-high text-on-surface-variant', m))}
        </Grupo>

        <Grupo titulo="Estado de tarea" vista="Estudiante" origen="Copia" fuente="mis-tareas/page.tsx · tareas-explorer-client.tsx · my-hours-project-list.tsx">
          {chip(PILL, 'pill-neutral', 'Por hacer')}
          {chip(PILL, 'pill-warning', 'En progreso')}
          {chip(PILL, 'pill-neutral', 'En revisión')}
          {chip(PILL, 'pill-success', 'Hecho')}
          {chip(PILL, 'pill-neutral', 'Eliminada')}
        </Grupo>

        <Grupo titulo="Estado de tarea (calendario)" vista="Estudiante" origen="Copia" fuente="components/calendar/agenda-item-row.tsx · TAREA_ESTADO_PILL">
          {chip(PILL, 'pill-neutral', 'Por hacer')}
          {chip(PILL, 'pill-accent', 'En progreso')}
          {chip(PILL, 'pill-warning', 'En revisión')}
          {chip(PILL, 'pill-success', 'Hecho')}
        </Grupo>

        <Grupo titulo="Prioridad de tarea" vista="Estudiante" origen="Copia" fuente="mis-tareas/page.tsx · tareas-explorer-client.tsx · PRIORIDAD_TONE">
          <span className="pill pill-neutral">
            <ArrowDown className="size-3.5" aria-hidden="true" />
            Baja
          </span>
          <span className="pill pill-warning">
            <Minus className="size-3.5" aria-hidden="true" />
            Media
          </span>
          <span className="pill pill-error">
            <ArrowUp className="size-3.5" aria-hidden="true" />
            Alta
          </span>
        </Grupo>

        <Grupo titulo="Vencimiento de tarea" vista="Estudiante" origen="Copia" fuente="app/dashboard/mis-tareas/page.tsx · VENCIMIENTO_CONFIG">
          <span className="pill pill-error">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            Vencida
          </span>
          <span className="pill pill-warning">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Vence pronto
          </span>
        </Grupo>

        <Grupo titulo="Etiqueta de tarea (color libre)" vista="Estudiante" origen="En vivo" fuente="components/projects/task-label-chip.tsx · TaskLabelChip">
          {[
            ['Frontend', '#006735'],
            ['Urgente', '#ba1a1a'],
            ['Documentación', '#1659C7'],
          ].map(([nombreEtiqueta, color], i) => (
            <TaskLabelChip key={nombreEtiqueta} etiqueta={{ idEtiqueta: i + 1, nombreEtiqueta, color } as never} />
          ))}
        </Grupo>

        <Grupo titulo="Estado de Sprint" vista="Estudiante" origen="Copia" fuente="proyectos/[id]/sprints/** · equipo/[idUsuario] · ESTADO_SPRINT_STYLE">
          {chip(REDONDA, 'bg-primary-container text-on-primary-container', 'Activo')}
          {chip(REDONDA, 'bg-status-warning text-on-status-warning', 'En finalización')}
          {chip(REDONDA, 'bg-surface-container-high text-tertiary', 'Cerrado')}
          {chip(REDONDA, 'bg-primary-container text-on-primary-container', 'ACTIVO')}
          {chip(REDONDA, 'bg-status-warning text-on-status-warning', 'EN FINALIZACIÓN')}
          {chip(REDONDA, 'bg-surface-container-high text-tertiary', 'CERRADO')}
        </Grupo>

        <Grupo titulo="Estado de hito" vista="Estudiante" origen="Copia" fuente="proyectos/[id]/sprints/[sprintId]/** · ESTADO_HITO_STYLE">
          {chip(REDONDA, 'bg-surface-container-high text-tertiary', 'Pendiente')}
          {chip(REDONDA, 'bg-status-warning text-on-status-warning', 'En progreso')}
          {chip(REDONDA, 'bg-primary-container text-on-primary-container', 'Completado')}
        </Grupo>

        <Grupo titulo="Situación de Sprint (calendario admin)" vista="Admin" origen="En vivo" fuente="lib/admin/sprint-calendar.ts · SITUACION_SPRINT_TONE">
          {(Object.keys(SITUACION_SPRINT_TONE) as Array<keyof typeof SITUACION_SPRINT_TONE>).map((s) =>
            chip(PILL, SITUACION_SPRINT_TONE[s], SITUACION_SPRINT_LABEL[s]),
          )}
        </Grupo>

        <Grupo titulo="Estado de participación" vista="Ambas" origen="En vivo" fuente="components/projects/member-status.utils.ts · ESTADO_PARTICIPACION_STYLE">
          {Object.values(ESTADO_PARTICIPACION_STYLE).map((e) => chip(REDONDA, e.className, e.label))}
          <ExitRequestBadge request={{} as never} />
        </Grupo>

        <Grupo titulo="Estado de postulación" vista="Estudiante" origen="Copia" fuente="mis-postulaciones/page.tsx · proyectos/[id]/postulaciones/page.tsx · ESTADO_CONFIG">
          <span className={`${REDONDA_GRANDE} bg-surface-container text-tertiary`}>
            <Clock className="size-3.5" aria-hidden="true" />
            Pendiente
          </span>
          <span className={`${REDONDA_GRANDE} bg-secondary-container text-on-secondary-container`}>
            <CheckCircle className="size-3.5" aria-hidden="true" />
            Aceptada
          </span>
          <span className={`${REDONDA_GRANDE} bg-error-container text-error`}>
            <XCircle className="size-3.5" aria-hidden="true" />
            Rechazada
          </span>
        </Grupo>

        <Grupo titulo="Estado de postulación (dashboard)" vista="Estudiante" origen="Copia" fuente="app/dashboard/page.tsx · estadoColors">
          {chip(PILL, 'pill-warning', 'Pendiente')}
          {chip(PILL, 'pill-success', 'Aceptada')}
          {chip(PILL, 'pill-error', 'Rechazada')}
        </Grupo>

        <Grupo titulo="Revisión de cierre" vista="Estudiante" origen="Copia" fuente="app/dashboard/proyectos/[id]/page.tsx · ESTADO_REVISION_LABEL">
          {chip(REDONDA_11, 'bg-surface-container-high text-on-surface-variant', 'Borrador')}
          {chip(REDONDA_11, 'bg-surface-container-high text-on-surface-variant', 'Enviada')}
          {chip(REDONDA_11, 'bg-status-warning text-on-status-warning', 'Corrección documental')}
          {chip(REDONDA_11, 'bg-error/10 text-error', 'Devuelta a ejecución')}
          {chip(REDONDA_11, 'bg-primary/10 text-primary', 'Aprobado')}
        </Grupo>

        <Grupo titulo="Entidad en la bitácora" vista="Estudiante" origen="Copia" fuente="app/dashboard/proyectos/[id]/bitacora/page.tsx · ENTIDAD_TONE">
          {chip(PILL, 'pill-accent', 'Tarea')}
          {chip(PILL, 'pill-success', 'Sprint')}
          {chip(PILL, 'pill-warning', 'Proyecto')}
          {chip(PILL, 'pill-error', 'Apelación de liderazgo')}
          {chip(PILL, 'pill-neutral', 'Revisión de cierre')}
          {chip(PILL, 'pill-neutral', 'Documento de cierre')}
        </Grupo>

        <Grupo titulo="Semestre y habilidades (Comunidad)" vista="Estudiante" origen="En vivo" fuente="lib/social/badge-colors.ts">
          {[1, 2, 3, 4].map((s) => chip(`${PILL} font-semibold`, getSemestreBadgeStyle(s), `Semestre ${s}`))}
          {['React', 'Python', 'Diseño UX', 'SQL', 'Liderazgo', 'Docker', 'Figma', 'Estadística', 'Java', 'Redacción'].map((h) =>
            chip(`${PILL} font-semibold`, getHabilidadBadgeStyle(h), h),
          )}
        </Grupo>

        <Grupo titulo="Estado de usuario" vista="Admin" origen="En vivo" fuente="components/admin/UserStatusBadge.tsx">
          <UserStatusBadge estado="ACTIVO" />
          <UserStatusBadge estado="INACTIVO" />
          <UserStatusBadge estado="BLOQUEADO" />
        </Grupo>

        <Grupo titulo="Estado de apelación" vista="Admin" origen="Copia" fuente="app/dashboard/admin/apelaciones/appeals-inbox-client.tsx · ESTADO_BADGE">
          {chip('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', 'bg-amber-400/15 text-amber-800 dark:text-amber-200', 'Pendiente')}
          {chip('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', 'bg-primary/10 text-primary', 'Aceptada')}
          {chip('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', 'bg-error/10 text-error', 'Denegada')}
          {chip('inline-flex items-center rounded-full px-3 py-1 text-xs font-bold', 'bg-surface-container-high text-on-surface-variant', 'Cancelada')}
        </Grupo>

        <Grupo titulo="Panel admin: cola de atención y actividad" vista="Admin" origen="En vivo" fuente="components/admin/dashboard/attention-queue.tsx · app/dashboard/admin/page.tsx">
          {chip(TARJETA, GREEN_BADGE, 'Pendiente')}
          {chip(TARJETA, GOLD_BADGE, 'Acción requerida')}
          {chip(TARJETA, 'bg-status-error text-on-status-error', 'Revisar')}
          {chip(TARJETA, GOLD_BADGE, 'En solicitud de cierre')}
        </Grupo>

        <Grupo titulo="Componente Badge (shadcn)" vista="Ambas" origen="En vivo" fuente="components/ui/badge.tsx">
          <Badge>default</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="destructive">destructive</Badge>
          <Badge variant="outline">outline</Badge>
        </Grupo>
      </div>
    </div>
  );
}
