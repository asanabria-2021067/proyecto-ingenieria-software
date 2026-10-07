import { useId } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, ClipboardList, Clock, Inbox, type LucideIcon } from 'lucide-react';

type AttentionTone = 'atencion' | 'bloqueo';

const TONO: Record<AttentionTone, { icono: string; pill: string }> = {
  // Acento del sistema (lima) para lo que espera una decisión.
  atencion: { icono: 'bg-status-warning text-on-status-warning', pill: 'pill-warning' },
  // El rojo queda solo para accesos restringidos.
  bloqueo: { icono: 'bg-status-error text-on-status-error', pill: 'pill-error' },
};

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
      tono: 'atencion',
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
        <div className="flex min-w-0 items-center gap-inline">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Inbox className="size-5" aria-hidden="true" />
          </div>
          <h3 id={tituloId} className="type-subtitle font-semibold">
            Requieren atención
          </h3>
        </div>
        <span className="type-meta tabular-nums">
          {total === 0 ? 'Todo al día' : total === 1 ? '1 pendiente' : `${total} pendientes`}
        </span>
      </header>

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
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-control ${tono.icono}`}>
                <Icono className="size-5" aria-hidden="true" />
              </div>
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
              {fila.valor > 0 && <span className={`pill hidden shrink-0 sm:inline-flex lg:hidden xl:inline-flex ${tono.pill}`}>{fila.accion}</span>}
              <span className="w-10 shrink-0 text-right font-headline text-2xl font-bold tabular-nums text-text-primary">
                {fila.valor}
              </span>
              <ChevronRight className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
