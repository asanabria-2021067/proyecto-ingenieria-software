'use client';

import { useState } from 'react';
import { DATA_TABLE_CARD, DATA_TABLE_HEAD_ROW, DATA_TABLE_HEAD_TEXT, DATA_TABLE_ROW_BORDER } from '@/components/dashboard/data-table';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { compararSemestres, etiquetaSemestre } from '@/lib/hours/semestre';
import type { HorasSemestreHistorial } from '@/lib/services/horas-semestre';

const clave = (h: HorasSemestreHistorial) => `${h.semestre.anio}-${h.semestre.periodo}`;
const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'px-stack py-inline tabular-nums';
const SELECT = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS} data-[size=default]:h-11.5`;

const delta = (n: number) => (n > 0 ? `+${n} h` : `${n} h`);

/** MEJ-61: compara dos semestres del historial (por defecto los dos más recientes). */
export function SemestreHorasComparar({ historial }: { historial: HorasSemestreHistorial[] }) {
  const [elegidos, setElegidos] = useState<{ a?: string; b?: string }>({});
  const claveB = elegidos.b ?? clave(historial[0]);
  const claveA = elegidos.a ?? clave(historial[1]);
  const a = historial.find((h) => clave(h) === claveA);
  const b = historial.find((h) => clave(h) === claveB);

  const selector = (id: string, etiqueta: string, valor: string, alCambiar: (v: string) => void) => (
    <div className="flex min-w-0 flex-col gap-tight">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select value={valor} onValueChange={alCambiar}>
        <SelectTrigger id={id} className={SELECT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {historial.map((h) => (
            <SelectItem key={clave(h)} value={clave(h)}>
              {etiquetaSemestre(h.semestre)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <section aria-labelledby="comparar-horas-titulo" className="flex flex-col gap-inline">
      <h2 id="comparar-horas-titulo" className="type-section">
        Comparar semestres
      </h2>
      <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
        {selector('comparar-semestre-a', 'Semestre base', claveA, (v) => setElegidos({ ...elegidos, a: v }))}
        {selector('comparar-semestre-b', 'Comparar con', claveB, (v) => setElegidos({ ...elegidos, b: v }))}
      </div>
      {a && b && (
        <div className={DATA_TABLE_CARD}>
          <Table>
            <caption className="sr-only">
              Horas de {etiquetaSemestre(a.semestre)} frente a {etiquetaSemestre(b.semestre)}
            </caption>
            <TableHeader>
              <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                <TableHead scope="col" className={TH}>Horas</TableHead>
                <TableHead scope="col" className={TH}>{etiquetaSemestre(a.semestre)}</TableHead>
                <TableHead scope="col" className={TH}>{etiquetaSemestre(b.semestre)}</TableHead>
                <TableHead scope="col" className={TH}>Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compararSemestres(a, b).map((f) => (
                <TableRow key={f.etiqueta} className={DATA_TABLE_ROW_BORDER}>
                  <TableCell className={`${TD} font-semibold`}>{f.etiqueta}</TableCell>
                  <TableCell className={TD}>{f.a} h</TableCell>
                  <TableCell className={TD}>{f.b} h</TableCell>
                  <TableCell className={TD}>{delta(f.diferencia)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
