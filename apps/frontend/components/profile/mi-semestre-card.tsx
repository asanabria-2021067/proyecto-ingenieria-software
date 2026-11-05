'use client';

import { useState } from 'react';
import { Download, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useResumenSemestre } from '@/hooks/use-perfil-portafolio';
import { downloadBlob } from '@/lib/download-file';
import { crearTarjetaSemestrePng, textosTarjeta } from '@/lib/perfil/semestre-card-png';
import { aviso } from '@/lib/mensajes';

/** MEJ-150: «Mi semestre en UVGenius», con descarga como imagen PNG generada en el navegador. */
export function MiSemestreCard() {
  const { data, isLoading, isError } = useResumenSemestre();
  const { data: user } = useCurrentUser();
  const [generando, setGenerando] = useState(false);

  if (isLoading) return <Skeleton className="h-48 rounded-card" aria-label="Cargando tu semestre" />;
  if (isError || !data) return null;

  const nombre = `${user?.nombre ?? ''} ${user?.apellido ?? ''}`.trim();
  const t = textosTarjeta(data, nombre);

  const descargar = async () => {
    setGenerando(true);
    try {
      downloadBlob(await crearTarjetaSemestrePng(data, nombre), `mi-semestre-uvgenius-${data.semestre.anio}-${data.semestre.periodo}.png`);
    } catch {
      aviso.error('No se pudo generar la imagen', 'Inténtalo de nuevo.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <section className="card-base flex flex-col gap-card" aria-labelledby="mi-semestre-titulo">
      <div className="flex flex-wrap items-start justify-between gap-inline">
        <div className="flex flex-col gap-micro">
          <h2 id="mi-semestre-titulo" className="type-section flex items-center gap-tight">
            <Trophy className="size-4 text-primary" aria-hidden="true" />
            Mi semestre en UVGenius
          </h2>
          <p className="type-meta">{t.semestre}</p>
        </div>
        <Button type="button" variant="outline" disabled={generando} onClick={descargar}>
          <Download aria-hidden="true" />
          Descargar imagen
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-inline md:grid-cols-4">
        {t.cifras.map((c) => (
          <div key={c.etiqueta}>
            <dd className="type-section text-primary">{c.valor}</dd>
            <dt className="type-meta">{c.etiqueta}</dt>
          </div>
        ))}
      </dl>
      {data.insignias.length > 0 ? (
        <ul className="flex flex-wrap gap-tight" aria-label="Insignias del semestre">
          {data.insignias.map((i) => (
            <li key={i.clave}>
              <Tag tone="subtle" size="sm">{i.nombre}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-meta">{t.insignias}</p>
      )}
    </section>
  );
}
