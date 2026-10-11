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
  originLabel,
  securityEventSummary,
} from '@/lib/admin/security-events';
import type { SecurityEvent } from '@/lib/types/admin-security';

// Misma tabla que las demás bandejas administrativas (`data-table`).
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
// Columnas que solo caben desde cierto ancho de la tarjeta; antes van como metadata bajo el tipo.
const COL_ACTOR = '@3xl/bandeja:table-cell';
const META_ACTOR = '@3xl/bandeja:hidden';
const COL_CUENTA = '@2xl/bandeja:table-cell';
const META_CUENTA = '@2xl/bandeja:hidden';
const COL_ORIGEN = '@4xl/bandeja:table-cell';
const META_ORIGEN = '@4xl/bandeja:hidden';
const COL_DETALLE = '@xl/bandeja:table-cell';
const META_DETALLE = '@xl/bandeja:hidden';

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
 */
export function SecurityEventsTable({ events }: { events: SecurityEvent[] }) {
  return (
    <div className={DATA_TABLE_CARD}>
      <Table>
        <caption className="sr-only">Eventos de seguridad, del más reciente al más antiguo</caption>
        <TableHeader>
          <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
            <TableHead scope="col" className={TH}>
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
            <TableHead scope="col" className={`${TH} hidden ${COL_DETALLE}`}>
              Detalle
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => {
            const actor = accountLabel(event.actor, 'Sin sesión');
            const cuenta = accountLabel(event.cuenta, 'Sin cuenta asociada');
            const resumen = securityEventSummary(event);
            return (
              <TableRow key={event.id} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                <TableCell className={`${TD} w-px`}>
                  <time dateTime={event.fecha} className="type-body whitespace-nowrap tabular-nums text-text-secondary">
                    {formatSecurityEventDate(event.fecha)}
                  </time>
                </TableCell>
                <TableCell className={`${TD} min-w-0`}>
                  <Tag tone={SECURITY_EVENT_TONE[event.tipo]} size="sm">
                    {SECURITY_EVENT_LABEL[event.tipo]}
                  </Tag>
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
                <TableCell className={`${TD} hidden ${COL_DETALLE}`}>
                  <span className="type-body break-words text-text-secondary">{resumen}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
