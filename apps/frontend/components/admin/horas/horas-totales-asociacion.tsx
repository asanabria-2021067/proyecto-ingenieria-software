import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
} from '@/components/dashboard/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TotalesAsociacion } from '@/lib/hours/semestre';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-top tabular-nums';

/** Totales del semestre por asociación (suma de las carreras que representa). */
export function HorasTotalesAsociacion({ totales }: { totales: TotalesAsociacion[] }) {
  if (totales.length === 0) return null;
  return (
    <section aria-labelledby="horas-totales-titulo" className="flex flex-col gap-inline">
      <h2 id="horas-totales-titulo" className="type-section">
        Totales por asociación
      </h2>
      <div className={DATA_TABLE_CARD}>
        <Table>
          <caption className="sr-only">Totales de horas del semestre por asociación</caption>
          <TableHeader>
            <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
              <TableHead scope="col" className={TH}>Asociación</TableHead>
              <TableHead scope="col" className={TH}>Estudiantes</TableHead>
              <TableHead scope="col" className={TH}>En riesgo</TableHead>
              <TableHead scope="col" className={TH}>Beca: declaradas</TableHead>
              <TableHead scope="col" className={TH}>Beca: acreditadas</TableHead>
              <TableHead scope="col" className={TH}>Beca: falta</TableHead>
              <TableHead scope="col" className={TH}>Extensión: declaradas</TableHead>
              <TableHead scope="col" className={TH}>Extensión: acreditadas</TableHead>
              <TableHead scope="col" className={TH}>Extensión: falta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totales.map((t) => (
              <TableRow key={t.clave} className={DATA_TABLE_ROW_BORDER}>
                <TableCell className={`${TD} min-w-40 font-semibold`}>{t.nombre}</TableCell>
                <TableCell className={TD}>{t.estudiantes}</TableCell>
                <TableCell className={TD}>{t.enRiesgo}</TableCell>
                <TableCell className={TD}>{t.becaDeclarada} h</TableCell>
                <TableCell className={TD}>{t.becaAcreditada} h</TableCell>
                <TableCell className={TD}>{t.faltaBeca} h</TableCell>
                <TableCell className={TD}>{t.extensionDeclarada} h</TableCell>
                <TableCell className={TD}>{t.extensionAcreditada} h</TableCell>
                <TableCell className={TD}>{t.faltaExtension} h</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
