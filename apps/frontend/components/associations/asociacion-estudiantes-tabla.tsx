import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Horas } from '@/components/admin/horas/horas-central-tabla';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import type { FilaEstudianteAsociacion, TipoHorasFiltro } from '@/lib/services/asociaciones';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';

/**
 * Estudiantes de las carreras de la asociación. Solo lectura: nombre, carné, carrera, semestre y horas
 * (declaradas y acreditadas siempre en rótulos distintos). Nunca teléfono ni contacto.
 */
export function AsociacionEstudiantesTabla({ filas, tipo }: { filas: FilaEstudianteAsociacion[]; tipo?: TipoHorasFiltro }) {
  return (
    <div className={DATA_TABLE_CARD}>
      <Table>
        <caption className="sr-only">Horas beca y de extensión por estudiante de la asociación en el semestre</caption>
        <TableHeader>
          <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
            <TableHead scope="col" className={TH}>
              Estudiante
            </TableHead>
            {tipo !== 'EXTENSION' && (
              <TableHead scope="col" className={TH}>
                Horas beca
              </TableHead>
            )}
            {tipo !== 'BECA' && (
              <TableHead scope="col" className={TH}>
                Horas de extensión
              </TableHead>
            )}
            <TableHead scope="col" className={TH}>
              Proyectos activos
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
              <TableCell className={`${TD} min-w-44`}>
                <p className="type-body font-semibold">
                  {f.nombre} {f.apellido}
                </p>
                <p className="type-meta">Carné {f.carne}</p>
                <p className="type-meta">
                  {f.carrera ?? 'Sin carrera'}
                  {f.semestreCarrera !== null && ` - ${f.semestreCarrera}.º semestre`}
                </p>
                {f.enRiesgo && (
                  <Tag tone="amber" size="sm" className="mt-tight">
                    En riesgo
                  </Tag>
                )}
              </TableCell>
              {tipo !== 'EXTENSION' && (
                <TableCell className={TD}>
                  <Horas meta={f.metaBeca} declaradas={f.becaDeclarada} acreditadas={f.becaAcreditada} falta={f.faltaBeca} />
                </TableCell>
              )}
              {tipo !== 'BECA' && (
                <TableCell className={TD}>
                  <Horas
                    meta={f.metaExtension}
                    declaradas={f.extensionDeclarada}
                    acreditadas={f.extensionAcreditada}
                    falta={f.faltaExtension}
                  />
                </TableCell>
              )}
              <TableCell className={`${TD} tabular-nums`}>{f.proyectosActivos}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
