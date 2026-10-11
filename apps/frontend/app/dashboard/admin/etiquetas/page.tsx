'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus, Tag as TagIcon } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ATTENTION_TONE } from '@/components/admin/dashboard/attention-queue';
import { UserStatusBadge } from '@/components/admin/UserStatusBadge';
import { ESTADO_POSTULACION_STYLE } from '@/components/projects/application-status.utils';
import {
  CLOSED_BADGE,
  GOLD_BADGE,
  GREEN_BADGE,
  MODALIDAD_ICON,
  NEUTRAL_BADGE,
  SLATE_BADGE,
  estadoBadgeLabel,
  estadoBadgeStyle,
} from '@/components/projects/available-project-card';
import { ENTIDAD_LABEL, ENTIDAD_TONE } from '@/components/projects/bitacora-entity.utils';
import { ESTADO_REVISION_LABEL } from '@/components/projects/closure-review-status.utils';
import { ExitRequestBadge } from '@/components/projects/member-exit-request-actions';
import { ESTADO_PARTICIPACION_STYLE } from '@/components/projects/member-status.utils';
import { ESTADO_HITO_STYLE, ESTADO_SPRINT_STYLE } from '@/components/projects/sprint-status.utils';
import {
  ESTADO_LABEL as ESTADO_TAREA_LABEL,
  ESTADO_TAREA_TONE,
  PRIORIDAD_ICON,
  PRIORIDAD_LABEL,
  PRIORIDAD_TONE,
  VENCIMIENTO_CONFIG,
} from '@/components/projects/task-board.utils';
import { TaskLabelChip } from '@/components/projects/task-label-chip';
import { TipoBadge } from '@/components/projects/tipo-badge';
import { Badge } from '@/components/ui/badge';
import { TAG_TONES, Tag, type TagSize } from '@/components/ui/tag';
import { ESTADO_APELACION_BADGE } from '@/lib/admin/appeals';
import { SITUACION_CIERRE, SITUACION_PUBLICACION } from '@/lib/admin/request-status';
import { SITUACION_SPRINT_LABEL, SITUACION_SPRINT_TONE } from '@/lib/admin/sprint-calendar';
import { getHabilidadBadgeStyle, getSemestreBadgeStyle } from '@/lib/social/badge-colors';
import { MODALIDAD_LABEL } from '@/types';
import type { ModalidadProyecto } from '@/types';

/**
 * VISTA TEMPORAL — catálogo de las 27 familias de etiquetas (pills, badges y
 * chips) de UVGenius, en vistas de estudiante y de administrador. No forma
 * parte del producto: se elimina al terminar la revisión.
 *
 * Todo lo que se pinta aquí sale de los componentes, mapas y tokens reales que
 * usan las demás páginas (nada se copia a mano): si una vista cambia su tono,
 * este catálogo lo refleja. Cada familia se muestra en claro y en oscuro
 * (el panel oscuro envuelve el contenido en `.dark`, la misma clase que
 * `next-themes` pone en <html>).
 */

type Vista = 'Estudiante' | 'Admin' | 'Ambas';
/** Compartida = reutiliza un tono/mapa común del sistema; Particular = tiene su propio mapa de dominio. */
type Origen = 'Compartida' | 'Particular';

function Familia({
  numero,
  titulo,
  vista,
  origen,
  fuente,
  nota,
  children,
}: {
  numero: number;
  titulo: string;
  vista: Vista;
  origen: Origen;
  fuente: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section className="@container/familia card-base flex flex-col gap-inline" aria-labelledby={`familia-${numero}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro">
        <h2 id={`familia-${numero}`} className="type-subtitle font-semibold">
          {String(numero).padStart(2, '0')} · {titulo}
        </h2>
        <p className="type-meta">
          {vista} · {origen}
        </p>
      </div>
      <p className="type-meta break-all font-mono">{fuente}</p>
      {nota && <p className="type-meta">{nota}</p>}
      {/* GPI01-C06 (H-04): claro y oscuro van lado a lado solo si la TARJETA tiene ancho
          para las dos muestras. Con `sm:` (ancho de ventana) cada columna quedaba en
          ~220 px dentro de la rejilla de familias y las etiquetas largas se recortaban. */}
      <div className="grid grid-cols-1 gap-tight @xl/familia:grid-cols-2">
        <div className="flex flex-wrap items-center gap-tight rounded-control bg-surface-container-low p-inline">{children}</div>
        <div className="dark flex flex-wrap items-center gap-tight rounded-control bg-surface p-inline text-on-surface">{children}</div>
      </div>
    </section>
  );
}

const ESTADOS_PROYECTO = ['BORRADOR', 'EN_REVISION', 'OBSERVADO', 'PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE', 'CERRADO', 'CANCELADO'];
const TIPOS_PROYECTO = ['ACADEMICO_HORAS_BECA', 'EXTRACURRICULAR_EXTENSION', 'ACADEMICO_EXPERIENCIA'];
const TAMANOS: TagSize[] = ['sm', 'md', 'lg'];
const HABILIDADES = ['React', 'Python', 'TypeScript', 'Java', 'NestJS', 'PostgreSQL', 'SQL', 'Estadística', 'Diseño UX', 'Figma', 'Docker', 'Liderazgo', 'Redacción'];
const ETIQUETAS_LIBRES = [
  ['Frontend', '#006735'],
  ['Urgente', '#ba1a1a'],
  ['Documentación', '#1659C7'],
  ['Backend', '#6448AE'],
  ['Diseño', '#0F6459'],
  ['Nombre de etiqueta demasiado largo para una celda compacta', '#f5c400'],
] as const;

export default function AdminEtiquetasPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <AdminBreadcrumb seccion="Diagnóstico" pagina="Etiquetas (temporal)" />
      <header className="mb-6">
        <h1 className="type-display text-balance">Etiquetas</h1>
        <p className="mt-tight max-w-3xl text-base text-tertiary">
          Catálogo temporal de las 27 familias de etiquetas de UVGenius. Cada familia importa el componente, el mapa o el
          token real que usan las vistas de estudiante y de administrador, y se muestra en modo claro (izquierda) y oscuro
          (derecha).
        </p>
      </header>

      <section className="card-base mb-grid flex flex-col gap-inline" aria-labelledby="sistema">
        <h2 id="sistema" className="type-subtitle font-semibold">
          Sistema: tonos y tamaños
        </h2>
        <p className="type-meta break-all font-mono">
          app/global.css (.pill, .pill-sm, .pill-lg, .pill-&lt;tono&gt;, --color-tag-* / --color-on-tag-*, --radius-tag) · components/ui/tag.tsx (Tag, tagClass)
        </p>
        <p className="type-meta">
          Forma única: radio «tag» (7 px), 25 px de alto, 12 px semibold. Los 15 tonos cumplen AA (≥ 4,5:1) en ambos temas.
          Nombres históricos: accent = lime, warning = amber, error = red.
        </p>
        {/* GPI01-C06 (H-04): claro y oscuro van lado a lado solo si la TARJETA tiene ancho
          para las dos muestras. Con `sm:` (ancho de ventana) cada columna quedaba en
          ~220 px dentro de la rejilla de familias y las etiquetas largas se recortaban. */}
      <div className="grid grid-cols-1 gap-tight @xl/familia:grid-cols-2">
          <div className="flex flex-wrap items-center gap-tight rounded-control bg-surface-container-low p-inline">
            {TAG_TONES.map((tone) => (
              <Tag key={tone} tone={tone}>
                {tone}
              </Tag>
            ))}
          </div>
          <div className="dark flex flex-wrap items-center gap-tight rounded-control bg-surface p-inline text-on-surface">
            {TAG_TONES.map((tone) => (
              <Tag key={tone} tone={tone}>
                {tone}
              </Tag>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-tight">
          {TAMANOS.map((size) => (
            <Tag key={size} tone="green" size={size}>
              Publicado · {size}
            </Tag>
          ))}
          <Tag tone="green">
            <TagIcon aria-hidden="true" />
            Con icono
          </Tag>
          <span className="max-w-40">
            <Tag tone="neutral" className="w-full">
              <span className="truncate">Etiqueta larga que se trunca con `truncate` en celdas estrechas</span>
            </Tag>
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
        <Familia numero={1} titulo="Clases base «pill»" vista="Ambas" origen="Compartida" fuente="app/global.css · .pill-neutral/.pill-accent/.pill-success/.pill-warning/.pill-error">
          {(['neutral', 'accent', 'success', 'warning', 'error'] as const).map((tone) => (
            <Tag key={tone} tone={tone}>
              {tone[0].toUpperCase() + tone.slice(1)}
            </Tag>
          ))}
        </Familia>

        <Familia numero={2} titulo="Categoría del proyecto" vista="Ambas" origen="Particular" fuente="components/projects/tipo-badge.tsx · TipoBadge → tipoBadgeStyle (available-project-card.tsx)">
          {TIPOS_PROYECTO.map((t) => (
            <TipoBadge key={t} tipo={t} />
          ))}
          <TipoBadge tipo="ACADEMICO_HORAS_BECA" size="sm" />
        </Familia>

        <Familia numero={3} titulo="Estado del proyecto" vista="Ambas" origen="Particular" fuente="components/projects/available-project-card.tsx · estadoBadgeStyle / estadoBadgeLabel" nota="Referencia visual principal del sistema (forma aprobada).">
          {ESTADOS_PROYECTO.map((e) => (
            <span key={e} className={`pill ${estadoBadgeStyle(e)}`}>
              {estadoBadgeLabel(e)}
            </span>
          ))}
        </Familia>

        <Familia numero={4} titulo="Variantes en Mis Proyectos" vista="Estudiante" origen="Particular" fuente="available-project-card.tsx · context='mine' (pill-forest + blink-gold-gray) · estadoBadgeStyle" nota="Accionable (cierre solicitado, parpadea) vs. informativo (sutil); el acceso al proyecto cerrado queda en «closed».">
          <span className="pill pill-forest blink-gold-gray">En solicitud de cierre</span>
          <span className={`pill ${estadoBadgeStyle('EN_SOLICITUD_CIERRE')}`}>En solicitud de cierre</span>
          <span className={`pill ${estadoBadgeStyle('CERRADO')}`}>Cerrado</span>
          <span className={`pill ${estadoBadgeStyle('PUBLICADO')}`}>Publicado</span>
          <span className={`pill ${estadoBadgeStyle('EN_PROGRESO')}`}>En progreso</span>
        </Familia>

        <Familia numero={5} titulo="Paleta compartida" vista="Ambas" origen="Compartida" fuente="available-project-card.tsx · NEUTRAL_BADGE, GREEN_BADGE, GOLD_BADGE, CLOSED_BADGE, SLATE_BADGE · my-hours-project-list.tsx (Líder, Participación finalizada)">
          <span className={`pill ${NEUTRAL_BADGE}`}>Neutral</span>
          <span className={`pill ${GREEN_BADGE}`}>Verde</span>
          <span className={`pill ${GOLD_BADGE}`}>Cierre solicitado</span>
          <span className={`pill ${CLOSED_BADGE}`}>Cerrado</span>
          <span className={`pill ${SLATE_BADGE}`}>Pizarra</span>
          <span className={`pill ${SLATE_BADGE}`}>Líder</span>
          <span className="pill pill-neutral">Participación finalizada</span>
        </Familia>

        <Familia numero={6} titulo="Modalidad del proyecto" vista="Estudiante" origen="Compartida" fuente="proyectos/[id]/page.tsx · MODALIDAD_BADGE (pill-neutral) · project-header-card.tsx (pill-neutral + MODALIDAD_ICON)">
          {(Object.keys(MODALIDAD_LABEL) as ModalidadProyecto[]).map((m) => {
            const Icon = MODALIDAD_ICON[m];
            return (
              <Tag key={m} tone="neutral">
                <Icon aria-hidden="true" />
                {MODALIDAD_LABEL[m]}
              </Tag>
            );
          })}
        </Familia>

        <Familia numero={7} titulo="Estado de tarea" vista="Estudiante" origen="Compartida" fuente="components/projects/task-board.utils.ts · ESTADO_TAREA_TONE (Mis Tareas, explorador, Mis Horas, detalle de tarea)">
          {(Object.keys(ESTADO_TAREA_TONE) as Array<keyof typeof ESTADO_TAREA_TONE>).map((e) => (
            <Tag key={e} tone={ESTADO_TAREA_TONE[e]}>
              {ESTADO_TAREA_LABEL[e]}
            </Tag>
          ))}
          <span className="pill pill-neutral">Eliminada</span>
        </Familia>

        <Familia numero={8} titulo="Estado de tarea (calendario)" vista="Estudiante" origen="Compartida" fuente="components/calendar/agenda-item-row.tsx · ESTADO_TAREA_TONE en tamaño sm" nota="Mismos tokens que la familia 07, en tamaño compacto.">
          {(Object.keys(ESTADO_TAREA_TONE) as Array<keyof typeof ESTADO_TAREA_TONE>).map((e) => (
            <Tag key={e} tone={ESTADO_TAREA_TONE[e]} size="sm">
              {ESTADO_TAREA_LABEL[e]}
            </Tag>
          ))}
          <Tag tone="neutral" size="sm">
            Evento
          </Tag>
        </Familia>

        <Familia numero={9} titulo="Prioridad de tarea" vista="Estudiante" origen="Compartida" fuente="task-board.utils.ts · PRIORIDAD_TONE + PRIORIDAD_ICON">
          {(Object.keys(PRIORIDAD_TONE) as Array<keyof typeof PRIORIDAD_TONE>).map((p) => {
            const Icon = PRIORIDAD_ICON[p] ?? { BAJA: ArrowDown, MEDIA: Minus, ALTA: ArrowUp }[p];
            return (
              <Tag key={p} tone={PRIORIDAD_TONE[p]}>
                <Icon aria-hidden="true" />
                {PRIORIDAD_LABEL[p]}
              </Tag>
            );
          })}
        </Familia>

        <Familia numero={10} titulo="Vencimiento de tarea" vista="Estudiante" origen="Compartida" fuente="task-board.utils.ts · VENCIMIENTO_CONFIG (Mis Tareas)">
          {(Object.keys(VENCIMIENTO_CONFIG) as Array<keyof typeof VENCIMIENTO_CONFIG>).map((v) => {
            const { icon: Icon, label, tone } = VENCIMIENTO_CONFIG[v];
            return (
              <Tag key={v} tone={tone}>
                <Icon aria-hidden="true" />
                {label}
              </Tag>
            );
          })}
        </Familia>

        <Familia numero={11} titulo="Etiquetas libres de tarea" vista="Estudiante" origen="Particular" fuente="components/projects/task-label-chip.tsx · TaskLabelChip (color almacenado → punto + tinte al 16 %)" nota="Ejemplos: el color lo define cada proyecto; el texto conserva el color del tema.">
          {ETIQUETAS_LIBRES.map(([nombreEtiqueta, color], i) => (
            <TaskLabelChip
              key={nombreEtiqueta}
              etiqueta={{ idEtiqueta: i + 1, nombreEtiqueta, nombreNormalizado: nombreEtiqueta.toLowerCase(), color }}
            />
          ))}
        </Familia>

        <Familia numero={12} titulo="Estado de Sprint" vista="Estudiante" origen="Compartida" fuente="components/projects/sprint-status.utils.ts · ESTADO_SPRINT_STYLE (lista, detalle, finalizar, analíticas, ficha de integrante)">
          {Object.values(ESTADO_SPRINT_STYLE).map((e) => (
            <span key={e.label} className={`pill ${e.className}`}>
              {e.label}
            </span>
          ))}
        </Familia>

        <Familia numero={13} titulo="Estado de hito" vista="Estudiante" origen="Compartida" fuente="sprint-status.utils.ts · ESTADO_HITO_STYLE (detalle y analíticas del Sprint)">
          {Object.values(ESTADO_HITO_STYLE).map((e) => (
            <span key={e.label} className={`pill ${e.className}`}>
              {e.label}
            </span>
          ))}
        </Familia>

        <Familia numero={14} titulo="Situación temporal de Sprint" vista="Admin" origen="Particular" fuente="lib/admin/sprint-calendar.ts · SITUACION_SPRINT_TONE / SITUACION_SPRINT_LABEL" nota="Solo se pinta la situación que calcula el backend; el sistema no define situaciones de finalización adicionales.">
          {(Object.keys(SITUACION_SPRINT_TONE) as Array<keyof typeof SITUACION_SPRINT_TONE>).map((s) => (
            <span key={s} className={`pill ${SITUACION_SPRINT_TONE[s]}`}>
              {SITUACION_SPRINT_LABEL[s]}
            </span>
          ))}
        </Familia>

        <Familia numero={15} titulo="Estado de participación" vista="Ambas" origen="Compartida" fuente="components/projects/member-status.utils.ts · ESTADO_PARTICIPACION_STYLE · member-exit-request-actions.tsx · ExitRequestBadge">
          {Object.values(ESTADO_PARTICIPACION_STYLE).map((e) => (
            <span key={e.label} className={`pill ${e.className}`}>
              {e.label}
            </span>
          ))}
          <ExitRequestBadge request={{} as never} />
        </Familia>

        <Familia numero={16} titulo="Estado de postulación" vista="Estudiante" origen="Compartida" fuente="components/projects/application-status.utils.ts · ESTADO_POSTULACION_STYLE (Mis Postulaciones, postulaciones del proyecto)">
          {Object.values(ESTADO_POSTULACION_STYLE).map(({ label, icon: Icon, tone }) => (
            <Tag key={label} tone={tone}>
              <Icon aria-hidden="true" />
              {label}
            </Tag>
          ))}
        </Familia>

        <Familia numero={17} titulo="Postulación (dashboard)" vista="Estudiante" origen="Compartida" fuente="app/dashboard/page.tsx · ESTADO_POSTULACION_STYLE[estado].tone (texto crudo del backend)" nota="Reutiliza los tonos de la familia 16.">
          {(Object.keys(ESTADO_POSTULACION_STYLE) as Array<keyof typeof ESTADO_POSTULACION_STYLE>).map((e) => (
            <Tag key={e} tone={ESTADO_POSTULACION_STYLE[e].tone}>
              {e}
            </Tag>
          ))}
        </Familia>

        <Familia numero={18} titulo="Revisión de cierre" vista="Estudiante" origen="Particular" fuente="components/projects/closure-review-status.utils.ts · ESTADO_REVISION_LABEL (historial en proyectos/[id], tamaño sm)">
          {Object.values(ESTADO_REVISION_LABEL).map((e) => (
            <span key={e.label} className={`pill pill-sm ${e.className}`}>
              {e.label}
            </span>
          ))}
        </Familia>

        <Familia numero={19} titulo="Entidad en la bitácora" vista="Estudiante" origen="Particular" fuente="components/projects/bitacora-entity.utils.ts · ENTIDAD_TONE / ENTIDAD_LABEL">
          {(Object.keys(ENTIDAD_TONE) as Array<keyof typeof ENTIDAD_TONE>).map((e) => (
            // GPI01-C06 (H-04): la clave de la enumeración va fuera de la etiqueta. Dentro,
            // «Liderazgo (APELACION_LIDERAZGO)» no cabía en la columna y se recortaba; así la
            // etiqueta es la misma que pinta la bitácora y la clave puede partir línea.
            <span key={e} className="inline-flex max-w-full items-center gap-micro">
              <span className={`pill ${ENTIDAD_TONE[e]}`}>{ENTIDAD_LABEL[e]}</span>
              <code className="min-w-0 break-all font-mono text-xs">{e}</code>
            </span>
          ))}
        </Familia>

        <Familia numero={20} titulo="Semestre académico" vista="Estudiante" origen="Particular" fuente="lib/social/badge-colors.ts · getSemestreBadgeStyle (cualquier semestre)">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
            <span key={s} className={`pill ${getSemestreBadgeStyle(s)}`}>
              Semestre {s}
            </span>
          ))}
        </Familia>

        <Familia numero={21} titulo="Habilidades e intereses" vista="Estudiante" origen="Particular" fuente="lib/social/badge-colors.ts · getHabilidadBadgeStyle (hash estable sobre 6 tonos)">
          {HABILIDADES.map((h) => (
            <span key={h} className={`pill ${getHabilidadBadgeStyle(h)}`}>
              {h}
            </span>
          ))}
        </Familia>

        <Familia numero={22} titulo="Estado de usuario" vista="Admin" origen="Compartida" fuente="components/admin/UserStatusBadge.tsx · Tag">
          <UserStatusBadge estado="ACTIVO" />
          <UserStatusBadge estado="INACTIVO" />
          <UserStatusBadge estado="BLOQUEADO" />
        </Familia>

        <Familia numero={23} titulo="Estado de apelación" vista="Admin" origen="Particular" fuente="lib/admin/appeals.ts · ESTADO_APELACION_BADGE">
          {Object.values(ESTADO_APELACION_BADGE).map((e) => (
            <span key={e.label} className={`pill ${e.className}`}>
              {e.label}
            </span>
          ))}
        </Familia>

        <Familia numero={24} titulo="Cola de atención administrativa" vista="Admin" origen="Compartida" fuente="components/admin/dashboard/attention-queue.tsx · ATTENTION_TONE · app/dashboard/admin/page.tsx · actEstadoStyle (GOLD_BADGE)">
          <span className={`pill ${ATTENTION_TONE.atencion.etiqueta}`}>Pendiente</span>
          <span className={`pill ${ATTENTION_TONE.cierre.etiqueta}`}>Acción requerida</span>
          <span className={`pill ${ATTENTION_TONE.bloqueo.etiqueta}`}>Revisar</span>
          <span className={`pill ${GOLD_BADGE}`}>En solicitud de cierre</span>
        </Familia>

        <Familia numero={25} titulo="Solicitudes de publicación" vista="Admin" origen="Particular" fuente="lib/admin/request-status.ts · SITUACION_PUBLICACION (KPIs de projects/admin/reviews)" nota="Estados de la solicitud; los botones de acción no son etiquetas.">
          {Object.values(SITUACION_PUBLICACION).map((s) => (
            <Tag key={s.label} tone={s.tone}>
              {s.label}
            </Tag>
          ))}
          <Tag tone="success">Aprobada</Tag>
        </Familia>

        <Familia numero={26} titulo="Solicitudes de cierre" vista="Admin" origen="Particular" fuente="lib/admin/request-status.ts · SITUACION_CIERRE (KPIs de closure-requests-inbox)" nota="Semántica independiente de las solicitudes de publicación.">
          {Object.values(SITUACION_CIERRE).map((s) => (
            <Tag key={s.label} tone={s.tone}>
              {s.label}
            </Tag>
          ))}
          <Tag tone="success">Aprobada</Tag>
        </Familia>

        <Familia numero={27} titulo="Componente Badge (shadcn)" vista="Ambas" origen="Compartida" fuente="components/ui/badge.tsx · variantes sobre tokens tag-* (forma sm)">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </Familia>
      </div>
    </div>
  );
}
