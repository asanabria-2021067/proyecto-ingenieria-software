'use client';

import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/download-file';
import { aviso } from '@/lib/mensajes';
import { getMisDatos } from '@/lib/services/cuenta';

/** MEJ-84: descarga de los datos propios en un JSON. El servidor limita la frecuencia (429). */
export function MisDatosSection() {
  const descargar = useMutation({
    mutationFn: getMisDatos,
    onSuccess: (blob) => {
      downloadBlob(blob, 'mis-datos-uvgenius.json');
      aviso.exito('Descarga lista', 'Guardamos tus datos en mis-datos-uvgenius.json.');
    },
    onError: (error: Error) =>
      aviso.error(
        'No se pudo descargar tus datos',
        getApiErrorStatus(error) === 429
          ? 'Alcanzaste el límite de descargas por hora. Vuelve a intentarlo más tarde.'
          : getApiErrorMessage(error, 'general', 'Intenta de nuevo en unos minutos.'),
      ),
  });

  return (
    <section aria-labelledby="mis-datos-titulo" className="card-base p-card">
      <h2 id="mis-datos-titulo" className="type-section">
        Descargar mis datos
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        Un archivo JSON con tu perfil, habilidades, participaciones, postulaciones, tareas asignadas y horas. No incluye
        contraseñas ni datos de otras personas.
      </p>
      <p className="type-meta mt-tight max-w-2xl">Puedes descargarlo hasta 3 veces por hora.</p>
      <Button type="button" variant="outline" className="mt-stack" disabled={descargar.isPending} onClick={() => descargar.mutate()}>
        <Download aria-hidden="true" />
        {descargar.isPending ? 'Preparando…' : 'Descargar mis datos'}
      </Button>
    </section>
  );
}
