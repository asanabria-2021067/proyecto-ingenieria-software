import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import type { FilaHorasCentral } from '@/lib/services/horas-semestre';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';

const horas = (n: number | null) => `${n ?? 0} h`;

/** `sinMetas`: el estudiante no registró ninguna de las dos metas; si solo falta esta, el texto nombra el tipo. */
export function Horas({
  meta,
  declaradas,
  acreditadas,
  falta,
  tipo,
  sinMetas,
}: {
  meta: number | null;
  declaradas: number;
  acreditadas: number;
  falta: number | null;
  tipo: 'beca' | 'extensión';
  sinMetas: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-inline gap-y-micro type-meta tabular-nums">
      {meta === null ? (
        <div className="col-span-2">
          <dt>Meta</dt>
          <dd>{sinMetas ? 'Aún no registra sus metas del semestre' : `Sin meta de ${tipo} registrada`}</dd>
        </div>
      ) : (
        <>
          <div>
            <dt>Meta</dt>
            <dd className="type-body font-semibold text-text-primary">{horas(meta)}</dd>
          </div>
          <div>
            <dt>Falta</dt>
            <dd className="type-body font-semibold text-text-primary">{horas(falta)}</dd>
          </div>
        </>
      )}
      <div>
        <dt>Declaradas</dt>
        <dd className="type-body text-text-primary">{declaradas} h</dd>
      </div>
      <div>
        <dt>Acreditadas</dt>
        <dd className="type-body text-text-primary">{acreditadas} h</dd>
      </div>
    </dl>
  );
}

/** Estudiantes con sus horas del semestre; declaradas y acreditadas siempre en columnas distintas. */
export function HorasCentralTabla({ filas }: { filas: FilaHorasCentral[] }) {
  return (
    <div className={DATA_TABLE_CARD}>
      <Table>
        <caption className="sr-only">Horas beca y de extensión por estudiante en el semestre</caption>
        <TableHeader>
          <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
            <TableHead scope="col" className={TH}>
              Estudiante
            </TableHead>
            <TableHead scope="col" className={TH}>
              Horas beca
            </TableHead>
            <TableHead scope="col" className={TH}>
              Horas de extensión
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
              <TableCell className={`${TD} min-w-40`}>
                <p className="type-body font-semibold">
                  {f.nombre} {f.apellido}
                </p>
                <p className="type-meta">Carné {f.carne}</p>
                <p className="type-meta">{f.carrera ?? 'Sin carrera'}</p>
                {f.enRiesgo && (
                  <Tag tone="amber" size="sm" className="mt-tight">
                    En riesgo
                  </Tag>
                )}
              </TableCell>
              <TableCell className={TD}>
                <Horas
                  meta={f.metaBeca}
                  declaradas={f.becaDeclarada}
                  acreditadas={f.becaAcreditada}
                  falta={f.faltaBeca}
                  tipo="beca"
                  sinMetas={f.metaBeca === null && f.metaExtension === null}
                />
              </TableCell>
              <TableCell className={TD}>
                <Horas
                  meta={f.metaExtension}
                  declaradas={f.extensionDeclarada}
                  acreditadas={f.extensionAcreditada}
                  falta={f.faltaExtension}
                  tipo="extensión"
                  sinMetas={f.metaBeca === null && f.metaExtension === null}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
