'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/download-file';
import { aviso } from '@/lib/mensajes';
import { descargarIcsPropio } from '@/lib/services/calendario-ics';

const DIAS_EXPORTADOS = 60;

/** MEJ-33: descarga tus próximos 60 días de eventos como .ics para Google, Outlook o Apple Calendar. */
export function ExportarIcsBoton({ className }: { className?: string }) {
  const [cargando, setCargando] = useState(false);

  const exportar = async () => {
    setCargando(true);
    try {
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);
      const hasta = new Date(desde.getTime() + DIAS_EXPORTADOS * 86_400_000);
      downloadBlob(await descargarIcsPropio(desde, hasta), 'uvgenius-calendario.ics');
      aviso.exito('Calendario exportado', `Incluye tus eventos de los próximos ${DIAS_EXPORTADOS} días.`);
    } catch {
      aviso.error('No se pudo exportar el calendario', 'Intenta de nuevo en unos segundos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={cargando}
      onClick={() => void exportar()}
      title={`Tus eventos de los próximos ${DIAS_EXPORTADOS} días`}
      className={className}
    >
      <Download className="size-4" aria-hidden="true" />
      Exportar .ics
    </Button>
  );
}
