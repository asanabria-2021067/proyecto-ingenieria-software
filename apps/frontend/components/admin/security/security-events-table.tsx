import { Eye } from 'lucide-react';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import {
  SECURITY_EVENT_LABEL,
  SECURITY_EVENT_TONE,
  accountLabel,
  formatSecurityEventDate,
  formatSecurityEventDateParts,
  originLabel,
  securityEventSummary,
} from '@/lib/admin/security-events';
import type { SecurityEvent } from '@/lib/types/admin-security';

// Misma tabla que las demás bandejas administrativas (`data-table`).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
// Cada columna aparece cuando la TARJETA (no la ventana) tiene sitio para ella; antes, su dato va como
// metadata bajo el tipo. Los umbrales salen de sumar los anchos reales: la etiqueta más larga no se parte
// (`.pill` es de una línea), así que la columna «Tipo» necesita ~220 px en cualquier ancho.
const COL_FECHA = '@lg/bandeja:table-cell';
const META_FECHA = '@lg/bandeja:hidden';
const COL_CUENTA = '@3xl/bandeja:table-cell';
const META_CUENTA = '@3xl/bandeja:hidden';
const COL_ACTOR = '@4xl/bandeja:table-cell';
const META_ACTOR = '@4xl/bandeja:hidden';
const COL_ORIGEN = '@5xl/bandeja:table-cell';
const META_ORIGEN = '@5xl/bandeja:hidden';
// «Detalle» siempre está: lleva el botón. Su resumen y el texto del botón solo caben desde cierto ancho.
const RESUMEN_DETALLE = '@4xl/bandeja:block';
const META_DETALLE = '@4xl/bandeja:hidden';
const TEXTO_BOTON = '@3xl/bandeja:inline';
const DETALLE_ANCHO = '@4xl/bandeja:w-auto';
const FECHA_EN_LINEA = '@5xl/bandeja:inline';
// Mismo botón compacto que «Ver perfil» en Gestión de Usuarios.
const BOTON_DETALLE =
  'flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface transition-all hover:bg-primary hover:text-on-primary';

function Origen({ origen }: { origen: SecurityEvent['origen'] }) {
  const { etiqueta, ip } = originLabel(origen);
  return (
    <>
      <span className="type-meta block">{etiqueta}</span>
      {ip && <span className="type-body block break-all tabular-nums text-text-secondary">{ip}</span>}
    </>
  );
}

/**
 * Tabla del visor de eventos de seguridad (T-310): Fecha, Tipo, Actor, Cuenta,
 * Origen y Detalle. Solo pinta textos compuestos por `lib/admin/security-events`.
 * Con `onSelect`, cada fila ofrece «Ver detalle».
 */
export function SecurityEventsTable({
  events,
  onSelect,
}: {
  events: SecurityEvent[];
  /** Recibe también el botón pulsado, para devolverle el foco al cerrar el detalle. */
  onSelect?: (event: SecurityEvent, trigger: HTMLElement) => void;
}) {
  return (
    <div className={DATA_TABLE_CARD}>
      <Table>
        <caption className="sr-only">Eventos de seguridad, del más reciente al más antiguo</caption>
        <TableHeader>
          <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
            <TableHead scope="col" className={`${TH} hidden ${COL_FECHA}`}>
              Fecha
            </TableHead>
            <TableHead scope="col" className={TH}>
              Tipo
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden ${COL_ACTOR}`}>
              Actor
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden ${COL_CUENTA}`}>
              Cuenta
            </TableHead>
            <TableHead scope="col" className={`${TH} hidden ${COL_ORIGEN}`}>
              Origen
            </TableHead>
            <TableHead scope="col" className={TH}>
              Detalle
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const actor = accountLabel(event.actor, 'Sin sesión');
            const cuenta = accountLabel(event.cuenta, 'Sin cuenta asociada');
            const resumen = securityEventSummary(event);
            const fecha = formatSecurityEventDateParts(event.fecha);
            return (
              <TableRow key={event.id} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                <TableCell className={`${TD} hidden w-px ${COL_FECHA}`}>
                  {/* Día y hora en una línea solo cuando la tarjeta tiene sitio; antes, apilados. */}
                  <time dateTime={event.fecha} className="type-body tabular-nums text-text-secondary">
                    <span className={`block whitespace-nowrap ${FECHA_EN_LINEA}`}>{fecha.dia}</span>
                    {fecha.hora && (
                      <>
                        <span className={`hidden ${FECHA_EN_LINEA}`}>, </span>
                        <span className={`block whitespace-nowrap ${FECHA_EN_LINEA}`}>{fecha.hora}</span>
                      </>
                    )}
                  </time>
                </TableCell>
                <TableCell className={`${TD} min-w-0`}>
                  <Tag tone={SECURITY_EVENT_TONE[event.tipo]} size="sm">
                    {SECURITY_EVENT_LABEL[event.tipo]}
                  </Tag>
                  <p className={`type-meta mt-tight tabular-nums ${META_FECHA}`}>
                    <time dateTime={event.fecha}>{formatSecurityEventDate(event.fecha)}</time>
                  </p>
                  <p className={`type-meta mt-tight break-words ${META_DETALLE}`}>{resumen}</p>
                  <p className={`type-meta break-words ${META_CUENTA}`}>Cuenta: {cuenta}</p>
                  <p className={`type-meta break-words ${META_ACTOR}`}>Actor: {actor}</p>
                  <div className={META_ORIGEN}>
                    <Origen origen={event.origen} />
                  </div>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_ACTOR}`}>
                  <span className="type-body break-words text-text-secondary">{actor}</span>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_CUENTA}`}>
                  <span className="type-body break-words text-text-secondary">{cuenta}</span>
                </TableCell>
                <TableCell className={`${TD} hidden ${COL_ORIGEN}`}>
                  <Origen origen={event.origen} />
                </TableCell>
                <TableCell className={`${TD} w-px ${DETALLE_ANCHO}`}>
                  <span className={`type-body mb-tight hidden break-words text-text-secondary ${RESUMEN_DETALLE}`}>{resumen}</span>
                  {onSelect && (
                    <button
                      type="button"
                      onClick={(click) => onSelect(event, click.currentTarget)}
                      aria-label={`Ver detalle: ${SECURITY_EVENT_LABEL[event.tipo]}, ${formatSecurityEventDate(event.fecha)}`}
                      className={BOTON_DETALLE}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      {/* En tarjetas estrechas queda solo el icono: el nombre accesible ya lo dice. */}
                      <span className={`hidden ${TEXTO_BOTON}`}>Ver detalle</span>
                    </button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
