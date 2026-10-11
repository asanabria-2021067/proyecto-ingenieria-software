import { useId } from 'react';
import Link from 'next/link';
import { GOLD_BADGE, GOLD_ICON, NEUTRAL_BADGE } from '@/components/projects/available-project-card';
import { AlertTriangle, ChevronRight, ClipboardList, Clock, type LucideIcon } from 'lucide-react';

export type AttentionTone = 'atencion' | 'cierre' | 'bloqueo';

// Etiqueta de estado: la forma `.pill` estándar (misma que las tarjetas de
// proyecto), de ancho fijo; centrada en su columna cuando la tarjeta es ancha.
const ETIQUETA = 'pill w-36 justify-center @xl/atencion:mx-auto';

export const ATTENTION_TONE: Record<AttentionTone, { icono: string; etiqueta: string }> = {
  // Pendiente de decisión: neutral; el número de la fila ya llama la atención.
  atencion: { icono: 'text-text-secondary', etiqueta: NEUTRAL_BADGE },
  // Mismo verde bosque que la etiqueta de proyecto en solicitud de cierre.
  cierre: { icono: GOLD_ICON, etiqueta: GOLD_BADGE },
  // Cuentas bloqueadas: ámbar de atención (el rojo se reserva para errores).
  bloqueo: { icono: 'text-on-tag-amber', etiqueta: 'pill-amber' },
};

// GPI01-C07 (H-05): el diseño depende del ancho de la TARJETA, no de la
// ventana. A 768 px con la barra lateral abierta la tarjeta mide ~450 px: con
// las columnas fijas de Estado y Total, «Tipo» quedaba en ~70 px y partía una
// palabra por línea. Por debajo de `@xl` (36rem) el estado baja a una segunda
// línea bajo la descripción; desde `@xl` vuelve la tabla de siempre.
//
// En ancho, Estado y Total miden lo mismo (11rem y 7rem, centradas) que las
// tablas de Seguimiento del panel, para que las columnas caigan en la misma
// vertical.
const FILA =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-inline gap-y-micro @xl/atencion:grid-cols-[auto_minmax(0,1fr)_11rem_7rem]';
const COL_ICONO = 'row-span-2 @xl/atencion:row-span-1';
const COL_ESTADO =
  'col-start-2 row-start-2 empty:hidden @xl/atencion:col-start-3 @xl/atencion:row-start-1 @xl/atencion:empty:block';
const COL_TOTAL =
  'relative col-start-3 row-span-2 row-start-1 w-16 text-center @xl/atencion:col-start-4 @xl/atencion:row-span-1 @xl/atencion:w-28';
// Encabezado: solo visual; «Estado» solo existe como columna en ancho.
const ENCABEZADO_ESTADO = 'hidden w-44 shrink-0 text-center @xl/atencion:block';
const ENCABEZADO_TOTAL = 'w-16 shrink-0 text-center @xl/atencion:w-28';

interface AttentionRow {
  clave: string;
  titulo: string;
  descripcion: string;
  valor: number;
  /** Etiqueta de la píldora cuando hay algo pendiente. */
  accion: string;
  href: string;
  /** Nombre accesible del enlace de la fila. */
  enlaceLabel: string;
  icono: LucideIcon;
  tono: AttentionTone;
}

interface AdminAttentionQueueProps {
  enRevision: number;
  cierrePendiente: number;
  usuariosBloqueados: number;
}

/**
 * Cola administrativa: lo que hoy espera una decisión de Administración, en
 * una sola tarjeta de filas compactas en vez de tres tarjetas grandes. Cada
 * fila lleva a la bandeja donde se resuelve.
 *
 * Solo presenta los conteos que recibe; no consulta nada por su cuenta.
 */
export function AdminAttentionQueue({ enRevision, cierrePendiente, usuariosBloqueados }: AdminAttentionQueueProps) {
  const tituloId = useId();
  const filas: AttentionRow[] = [
    {
      clave: 'revision',
      titulo: 'En revisión',
      descripcion: 'Proyectos pendientes de revisión',
      valor: enRevision,
      accion: 'Pendiente',
      href: '/dashboard/projects/admin/reviews',
      enlaceLabel: 'Ver proyectos en revisión',
      icono: ClipboardList,
      tono: 'atencion',
    },
    {
      clave: 'cierres',
      titulo: 'Cierre pendiente',
      descripcion: 'Solicitudes de cierre por aprobar',
      valor: cierrePendiente,
      accion: 'Acción requerida',
      href: '/dashboard/admin/proyectos?grupo=cierres',
      enlaceLabel: 'Ver solicitudes de cierre pendientes',
      icono: Clock,
      tono: 'cierre',
    },
    {
      clave: 'bloqueados',
      titulo: 'Bloqueados',
      descripcion: 'Usuarios con acceso restringido',
      valor: usuariosBloqueados,
      accion: 'Revisar',
      href: '/dashboard/admin/usuarios',
      enlaceLabel: 'Ver gestión de usuarios',
      icono: AlertTriangle,
      tono: 'bloqueo',
    },
  ];
  const total = filas.reduce((suma, fila) => suma + fila.valor, 0);

  return (
    <section aria-labelledby={tituloId} className="@container/atencion card-base flex flex-col overflow-hidden p-0">
      <header className="flex items-center justify-between gap-inline border-b border-outline-variant/50 px-card py-stack">
        <h3 id={tituloId} className="type-subtitle min-w-0 text-lg font-semibold">
          Requieren atención
        </h3>
        <span className="type-meta tabular-nums">
          {total === 0 ? 'Todo al día' : total === 1 ? '1 pendiente' : `${total} pendientes`}
        </span>
      </header>

      {/* Encabezado de columnas: solo visual, calca los anchos de cada fila. */}
      <div
        aria-hidden="true"
        className="type-meta flex items-center gap-inline border-b border-outline-variant/50 bg-surface-container-low px-card py-tight font-medium"
      >
        <span className="min-w-0 flex-1">Tipo</span>
        <span className={ENCABEZADO_ESTADO}>Estado</span>
        <span className={ENCABEZADO_TOTAL}>Total</span>
      </div>

      <ul className="divide-y divide-outline-variant/50">
        {filas.map((fila) => {
          const Icono = fila.icono;
          const tono = ATTENTION_TONE[fila.tono];
          return (
            <li
              key={fila.clave}
              data-fila={fila.clave}
              className={`relative px-card py-stack transition-colors hover:bg-surface-container-low ${FILA}`}
            >
              <Icono className={`size-5 shrink-0 ${COL_ICONO} ${tono.icono}`} aria-hidden="true" />
              <div className="min-w-0">
                <Link
                  href={fila.href}
                  className="type-body font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary/40"
                >
                  {fila.titulo}
                  {/* T-317 (A11Y-08): el nombre accesible empieza por el texto que se ve (WCAG 2.5.3)
                      y añade el destino solo para lectores de pantalla. */}
                  <span className="sr-only">. {fila.enlaceLabel}</span>
                </Link>
                <p className="type-meta">{fila.descripcion}</p>
              </div>
              <div className={COL_ESTADO}>
                {fila.valor > 0 && <span className={`${ETIQUETA} ${tono.etiqueta}`}>{fila.accion}</span>}
              </div>
              <div className={COL_TOTAL}>
                <span className="font-headline text-2xl font-bold tabular-nums text-text-primary">{fila.valor}</span>
                <ChevronRight
                  className="absolute right-0 top-1/2 size-4 -translate-y-1/2 text-text-secondary"
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
