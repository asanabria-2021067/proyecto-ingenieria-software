'use client';

import { useState } from 'react';
import { FileDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/download-file';

/** Botones de reporte CSV y PDF; `descargar` ya lleva los filtros activos. */
export function ReporteBotones({
  descargar,
  nombre,
  etiqueta,
}: {
  descargar: (formato: 'csv' | 'pdf') => Promise<Blob>;
  nombre: string;
  /** Qué reporte es: distingue sus botones de los de otros reportes de la misma página. */
  etiqueta: string;
}) {
  const [enCurso, setEnCurso] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState(false);

  async function bajar(formato: 'csv' | 'pdf') {
    setEnCurso(formato);
    setError(false);
    try {
      downloadBlob(await descargar(formato), `${nombre}.${formato}`);
    } catch {
      setError(true);
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-inline">
      <Button type="button" variant="outline" size="sm" disabled={enCurso !== null} onClick={() => void bajar('csv')}>
        <FileDown aria-hidden="true" />
        {enCurso === 'csv' ? 'Descargando...' : `${etiqueta} CSV`}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={enCurso !== null} onClick={() => void bajar('pdf')}>
        <FileText aria-hidden="true" />
        {enCurso === 'pdf' ? 'Descargando...' : `${etiqueta} PDF`}
      </Button>
      {error && (
        <p role="alert" className="type-meta text-error">
          No pudimos generar el reporte. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
