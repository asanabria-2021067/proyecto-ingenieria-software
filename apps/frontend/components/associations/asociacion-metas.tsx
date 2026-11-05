'use client';

import { useState } from 'react';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useMetasAsociacion, useMetasAsociacionMutations } from '@/hooks/use-asociaciones';
import { aviso } from '@/lib/mensajes';
import type { MetaAsociacion, TipoHorasFiltro } from '@/lib/services/asociaciones';

const TIPO: Record<TipoHorasFiltro, string> = { BECA: 'horas beca', EXTENSION: 'horas de extensión' };
const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none';

type Edicion = { meta: MetaAsociacion } | { tipos: TipoHorasFiltro[] };

/** Meta nueva (elige el tipo) o cambio del porcentaje de una existente. */
function MetaDialog({
  edicion,
  isPending,
  onSubmit,
  onClose,
}: {
  edicion: Edicion;
  isPending: boolean;
  onSubmit: (v: { tipo: TipoHorasFiltro; porcentajeObjetivo: number }) => void;
  onClose: () => void;
}) {
  const existente = 'meta' in edicion ? edicion.meta : null;
  const [tipo, setTipo] = useState<TipoHorasFiltro>(existente?.tipo ?? ('tipos' in edicion ? edicion.tipos[0] : 'BECA'));
  const [porcentaje, setPorcentaje] = useState(String(existente?.porcentajeObjetivo ?? 80));
  const valor = Number(porcentaje);
  const valido = Number.isInteger(valor) && valor >= 1 && valor <= 100;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) onSubmit({ tipo, porcentajeObjetivo: valor });
          }}
        >
          <DialogHeader>
            <DialogTitle>{existente ? 'Cambiar meta' : 'Nueva meta del semestre'}</DialogTitle>
            <DialogDescription>Porcentaje de estudiantes de la asociación que van al día con sus horas.</DialogDescription>
          </DialogHeader>
          {!existente && (
            <div>
              <Label htmlFor="meta-tipo">Tipo de horas</Label>
              <select id="meta-tipo" className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as TipoHorasFiltro)}>
                {(edicion as { tipos: TipoHorasFiltro[] }).tipos.map((t) => (
                  <option key={t} value={t}>
                    {TIPO[t].charAt(0).toUpperCase() + TIPO[t].slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="meta-porcentaje">Meta (% de estudiantes al día)</Label>
            <Input
              id="meta-porcentaje"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={porcentaje}
              aria-invalid={!valido}
              onChange={(e) => setPorcentaje(e.target.value)}
            />
            {!valido && (
              <p role="alert" className="type-meta mt-micro text-error">
                Escribe un número entero entre 1 y 100.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !valido}>
              {isPending ? 'Guardando...' : 'Guardar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * MEJ-162: metas del semestre de la asociación con su avance (estudiantes al día / estudiantes con meta de ese tipo).
 * Cualquier integrante de la junta las ve; crear, cambiar y quitar es de Presidente y Editores.
 */
export function AsociacionMetas({ idAsociacion, puedeEditar }: { idAsociacion: number; puedeEditar: boolean }) {
  const { data, isLoading, isError } = useMetasAsociacion(idAsociacion);
  const { crear, cambiar, quitar } = useMetasAsociacionMutations(idAsociacion);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [porQuitar, setPorQuitar] = useState<MetaAsociacion | null>(null);

  if (isLoading) return <Skeleton className="h-32 rounded-card" aria-label="Cargando metas del semestre" />;
  if (isError || !data) return null;

  const libres = (['BECA', 'EXTENSION'] as const).filter((t) => !data.metas.some((m) => m.tipo === t));
  const error = (titulo: string) => () => aviso.error(titulo, 'Revisa los datos e intenta de nuevo.');

  return (
    <section aria-labelledby="metas-titulo" className="card-base flex flex-col gap-stack">
      <div className="flex flex-wrap items-start justify-between gap-inline">
        <div>
          <h2 id="metas-titulo" className="type-section">
            Metas del semestre
          </h2>
          <p className="type-meta">
            Semestre {data.semestre.periodo} de {data.semestre.anio}. Al día: sin riesgo en sus horas.
          </p>
        </div>
        {puedeEditar && libres.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEdicion({ tipos: libres })}>
            <Plus aria-hidden="true" />
            Nueva meta
          </Button>
        )}
      </div>

      {data.metas.length === 0 ? (
        <p className="type-body flex items-center gap-tight text-text-secondary">
          <Target className="size-4 shrink-0" aria-hidden="true" />
          {puedeEditar ? 'Aún no hay metas este semestre. Crea la primera con «Nueva meta».' : 'La junta aún no define metas para este semestre.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-card">
          {data.metas.map((m) => (
            <li key={m.idMeta} aria-label={`Meta de ${TIPO[m.tipo]}`} className="flex flex-col gap-tight">
              <div className="flex flex-wrap items-center justify-between gap-x-inline gap-y-micro">
                <p className="type-subtitle flex flex-wrap items-center gap-tight">
                  {m.porcentajeObjetivo} % al día en {TIPO[m.tipo]}
                  <Tag tone={m.cumplida ? 'success' : 'amber'} size="sm">
                    {m.cumplida ? 'Cumplida' : 'En camino'}
                  </Tag>
                </p>
                {puedeEditar && (
                  <div className="flex gap-tight">
                    <Button type="button" variant="outline" size="sm" aria-label={`Cambiar meta de ${TIPO[m.tipo]}`} onClick={() => setEdicion({ meta: m })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" aria-label={`Quitar meta de ${TIPO[m.tipo]}`} onClick={() => setPorQuitar(m)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
              <Progress
                value={m.avance.porcentaje}
                aria-label={`Avance de la meta de ${TIPO[m.tipo]}: ${m.avance.porcentaje} %`}
                className="h-1.5 bg-primary/10"
              />
              <p className="type-meta tabular-nums">
                {m.avance.alDia} de {m.avance.total} estudiantes al día ({m.avance.porcentaje} %). Meta: {m.porcentajeObjetivo} %.
              </p>
            </li>
          ))}
        </ul>
      )}

      {edicion && (
        <MetaDialog
          edicion={edicion}
          isPending={crear.isPending || cambiar.isPending}
          onClose={() => setEdicion(null)}
          onSubmit={({ tipo, porcentajeObjetivo }) =>
            'meta' in edicion
              ? cambiar.mutate(
                  { idMeta: edicion.meta.idMeta, porcentajeObjetivo },
                  {
                    onSuccess: () => {
                      aviso.exito('Meta actualizada');
                      setEdicion(null);
                    },
                    onError: error('No se pudo actualizar la meta'),
                  },
                )
              : crear.mutate(
                  { ...data.semestre, tipo, porcentajeObjetivo },
                  {
                    onSuccess: () => {
                      aviso.exito('Meta creada');
                      setEdicion(null);
                    },
                    onError: error('No se pudo crear la meta'),
                  },
                )
          }
        />
      )}

      <ConfirmActionDialog
        open={!!porQuitar}
        title="Quitar meta"
        description={`Se quitará la meta de ${porQuitar ? TIPO[porQuitar.tipo] : ''} de este semestre.`}
        actionLabel="Quitar meta"
        variant="destructive"
        isPending={quitar.isPending}
        onCancel={() => setPorQuitar(null)}
        onConfirm={() =>
          porQuitar &&
          quitar.mutate(porQuitar.idMeta, {
            onSuccess: () => {
              aviso.exito('Meta eliminada');
              setPorQuitar(null);
            },
            onError: error('No se pudo quitar la meta'),
          })
        }
      />
    </section>
  );
}
