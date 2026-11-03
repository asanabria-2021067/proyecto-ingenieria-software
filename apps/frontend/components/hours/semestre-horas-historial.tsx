'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { DATA_TABLE_CARD, DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, DATA_TABLE_ROW_BORDER } from '@/components/dashboard/data-table';
import { SemestreHorasComparar } from '@/components/hours/semestre-horas-comparar';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useHorasHistorial } from '@/hooks/use-horas-semestre';
import { downloadBlob } from '@/lib/download-file';
import { etiquetaSemestre } from '@/lib/hours/semestre';
import { descargarConstancia, type Semestre } from '@/lib/services/horas-semestre';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline align-top tabular-nums';

const meta = (n: number | null) => (n === null ? '—' : `${n} h`);

/** Desglose por semestre: lo declarado y lo acreditado en UVGenius de cada uno, el mas reciente primero. */
export function SemestreHorasHistorial() {
  const { data } = useHorasHistorial();
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState(false);
  if (!data || data.length === 0) return null;

  // MEJ-11: constancia PDF de lo acreditado en el semestre.
  async function constancia(s: Semestre) {
    setDescargando(`${s.anio}-${s.periodo}`);
    setErrorDescarga(false);
    try {
      downloadBlob(await descargarConstancia(s), `constancia-horas-${s.anio}-${s.periodo}.pdf`);
    } catch {
      setErrorDescarga(true);
    } finally {
      setDescargando(null);
    }
  }

  return (
    <section aria-labelledby="historial-horas-titulo" className="flex flex-col gap-inline">
      <h2 id="historial-horas-titulo" className="type-section">
        Horas por semestre
      </h2>
      <div className={DATA_TABLE_CARD}>
        <Table containerLabel="Historial de horas por semestre">
          <caption className="sr-only">Horas beca y de extensión por semestre, declaradas y acreditadas</caption>
          <TableHeader>
            <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
              <TableHead scope="col" className={TH}>Semestre</TableHead>
              <TableHead scope="col" className={TH}>Beca: meta</TableHead>
              <TableHead scope="col" className={TH}>Beca: declaradas</TableHead>
              <TableHead scope="col" className={TH}>Beca: acreditadas</TableHead>
              <TableHead scope="col" className={TH}>Extensión: meta</TableHead>
              <TableHead scope="col" className={TH}>Extensión: declaradas</TableHead>
              <TableHead scope="col" className={TH}>Extensión: acreditadas</TableHead>
              <TableHead scope="col" className={TH}>Constancia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => (
              <TableRow key={`${h.semestre.anio}-${h.semestre.periodo}`} className={DATA_TABLE_ROW_BORDER}>
                <TableCell className={`${TD} font-semibold`}>{etiquetaSemestre(h.semestre)}</TableCell>
                <TableCell className={TD}>{meta(h.metaBeca)}</TableCell>
                <TableCell className={TD}>{h.becaDeclarada} h</TableCell>
                <TableCell className={TD}>{h.becaAcreditada} h</TableCell>
                <TableCell className={TD}>{meta(h.metaExtension)}</TableCell>
                <TableCell className={TD}>{h.extensionDeclarada} h</TableCell>
                <TableCell className={TD}>{h.extensionAcreditada} h</TableCell>
                <TableCell className={TD}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={descargando !== null}
                    onClick={() => void constancia(h.semestre)}
                    aria-label={`Descargar constancia de ${etiquetaSemestre(h.semestre)}`}
                  >
                    <Download aria-hidden="true" />
                    PDF
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {errorDescarga && (
        <p role="alert" className="type-meta text-destructive">
          No pudimos generar la constancia. Intenta de nuevo.
        </p>
      )}
      {data.length > 1 ? (
        <SemestreHorasComparar historial={data} />
      ) : (
        <p className="type-meta">Cuando tengas horas en dos semestres podrás compararlos aquí.</p>
      )}
    </section>
  );
}
