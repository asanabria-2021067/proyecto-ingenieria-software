import { useId } from 'react';
import Link from 'next/link';
import { GOLD_BADGE, GOLD_ICON, GREEN_BADGE } from '@/components/projects/available-project-card';
import { AlertTriangle, ChevronRight, ClipboardList, Clock, type LucideIcon } from 'lucide-react';

type AttentionTone = 'atencion' | 'cierre' | 'bloqueo';

// Etiqueta de estado: misma forma (radio, alto, tipografía) y la misma paleta
// que las etiquetas de las tarjetas de proyecto.
const ETIQUETA = 'mx-auto flex h-6.25 w-36 items-center justify-center rounded-[7px] px-3 text-[12px] font-semibold whitespace-nowrap';

const TONO: Record<AttentionTone, { icono: string; etiqueta: string }> = {
  // Acento del sistema (lima) para lo que espera una decisión.
  atencion: { icono: 'text-secondary-fixed-dim dark:text-secondary-fixed', etiqueta: GREEN_BADGE },
  // Mismo dorado que la etiqueta de proyecto en solicitud de cierre.
  cierre: { icono: GOLD_ICON, etiqueta: GOLD_BADGE },
  // El rojo queda solo para accesos restringidos.
  bloqueo: { icono: 'text-error', etiqueta: 'bg-status-error text-on-status-error' },
};

// Anchos compartidos por el encabezado de columnas y las filas, y los mismos
// (11rem y 7rem, centradas) que las tablas de Seguimiento del panel, para que
// las columnas caigan en la misma vertical. «Estado» se oculta en móvil.
const COL_ESTADO = 'hidden w-44 shrink-0 text-center sm:block';
const COL_TOTAL = 'relative w-16 shrink-0 text-center sm:w-28';

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
    <section aria-labelledby={tituloId} className="card-base flex flex-col overflow-hidden p-0">
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
        <span className={COL_ESTADO}>Estado</span>
        <span className={COL_TOTAL}>Total</span>
      </div>

      <ul className="divide-y divide-outline-variant/50">
        {filas.map((fila) => {
          const Icono = fila.icono;
          const tono = TONO[fila.tono];
          return (
            <li
              key={fila.clave}
              data-fila={fila.clave}
              className="relative flex items-center gap-inline px-card py-stack transition-colors hover:bg-surface-container-low"
            >
              <Icono className={`size-5 shrink-0 ${tono.icono}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link
                  href={fila.href}
                  aria-label={fila.enlaceLabel}
                  className="type-body font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary/40"
                >
                  {fila.titulo}
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
