'use client';

import { useState } from 'react';
import { CalendarClock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { EditarHorasSemestreDialog } from '@/components/hours/editar-horas-semestre-dialog';
import { useHorasProgreso } from '@/hooks/use-horas-semestre';
import { ETIQUETA_TIPO, etiquetaSemestre, porcentajeAvance, textoProyeccion, type TipoHorasSemestre } from '@/lib/hours/semestre';
import type { TramoProgreso } from '@/lib/services/horas-semestre';

function Tramo({ tipo, tramo, finSemestre }: { tipo: TipoHorasSemestre; tramo: TramoProgreso; finSemestre: string }) {
  const etiqueta = ETIQUETA_TIPO[tipo];
  const porcentaje = porcentajeAvance(tramo.avance, tramo.meta);
  const proyeccion = textoProyeccion(tipo, tramo, finSemestre);
  const id = `semestre-${tipo}`;
  return (
    <li aria-labelledby={id} className="flex flex-col gap-tight">
      <div className="flex flex-wrap items-center justify-between gap-x-inline gap-y-micro">
        <p id={id} className="type-subtitle flex items-center gap-tight">
          {etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}
          {tramo.enRiesgo && <Tag tone="amber" size="sm">En riesgo</Tag>}
        </p>
        <p className="type-body">
          <span className="font-semibold">{tramo.avance} h</span>
          {tramo.meta !== null && tramo.meta > 0 && <span className="text-text-secondary"> de {tramo.meta} h</span>}
        </p>
      </div>
      {tramo.meta !== null && tramo.meta > 0 && (
        <Progress
          value={porcentaje}
          aria-label={`Progreso de ${etiqueta} del semestre`}
          aria-valuenow={porcentaje}
          className="h-1.5 bg-primary/10"
        />
      )}
      <dl className="grid grid-cols-2 gap-inline type-meta">
        <div>
          <dt>Declaradas por ti</dt>
          <dd className="type-body font-semibold text-text-primary">{tramo.declaradas} h</dd>
        </div>
        <div>
          <dt>Acreditadas en UVGenius</dt>
          <dd className="type-body font-semibold text-text-primary">{tramo.acreditadas} h</dd>
        </div>
      </dl>
      {tramo.falta !== null && tramo.falta > 0 && <p className="type-meta">Te faltan {tramo.falta} h este semestre.</p>}
      {proyeccion && (
        <p className="type-meta flex items-center gap-tight text-text-primary">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          {proyeccion}
        </p>
      )}
    </li>
  );
}

/**
 * Semestre actual con lo declarado y lo acreditado en UVGenius siempre por separado
 * (la meta y el avance los calcula el backend). Con `editable`, abre el registro del semestre.
 */
export function SemestreHorasCard({ editable = false }: { editable?: boolean }) {
  const { data, isLoading, isError } = useHorasProgreso();
  const [editando, setEditando] = useState(false);

  if (isLoading) return <Skeleton className="h-48 rounded-card" aria-label="Cargando horas del semestre" />;
  if (isError || !data) return null;

  const visible = (t: TramoProgreso) => (t.meta ?? 0) > 0 || t.avance > 0;

  return (
    <section aria-labelledby="semestre-horas-titulo" className="card-base flex flex-col gap-card">
      <div className="flex flex-wrap items-start justify-between gap-inline">
        <div className="flex flex-col gap-micro">
          <h2 id="semestre-horas-titulo" className="type-section">
            Horas de este semestre
          </h2>
          <p className="type-meta">{etiquetaSemestre(data.semestre)}</p>
        </div>
        {editable && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            <Pencil aria-hidden="true" />
            Editar horas
          </Button>
        )}
      </div>

      {!visible(data.beca) && !visible(data.extension) ? (
        <p className="type-body text-text-secondary">
          Aún no registras tus metas de este semestre.
          {editable ? ' Usa «Editar horas» para declararlas.' : ' Puedes declararlas desde tu perfil.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-card">
          {visible(data.beca) && <Tramo tipo="beca" tramo={data.beca} finSemestre={data.semestre.fin} />}
          {visible(data.extension) && <Tramo tipo="extension" tramo={data.extension} finSemestre={data.semestre.fin} />}
        </ul>
      )}

      {editable && <EditarHorasSemestreDialog open={editando} onOpenChange={setEditando} />}
    </section>
  );
}
