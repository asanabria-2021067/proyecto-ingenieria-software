'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { coordinadorKeys } from '@/hooks/use-coordinador';
import uvgSwal from '@/lib/swal';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import { getAlcanceCoordinador, guardarAlcanceCoordinador, type AlcanceCoordinador } from '@/lib/services/coordinador';

/** Carreras agrupadas por su facultad (texto de la carrera); las que no tienen, juntas al final. */
function porFacultad(carreras: Carrera[]): Array<[string, Carrera[]]> {
  const grupos = new Map<string, Carrera[]>();
  for (const c of carreras) grupos.set(c.facultad ?? '', [...(grupos.get(c.facultad ?? '') ?? []), c]);
  return [...grupos.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
}

function Formulario({ idUsuario, actual, carreras }: { idUsuario: number; actual: AlcanceCoordinador; carreras: Carrera[] }) {
  const queryClient = useQueryClient();
  const [carreraIds, setCarreraIds] = useState(() => new Set(actual.carreraIds));
  const [facultades, setFacultades] = useState(() => new Set(actual.facultades));
  const [confirmando, setConfirmando] = useState(false);
  const grupos = useMemo(() => porFacultad(carreras), [carreras]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarAlcanceCoordinador(idUsuario, {
        // Una carrera cubierta por su facultad completa no se guarda aparte.
        carreraIds: carreras.filter((c) => carreraIds.has(c.idCarrera) && !(c.facultad && facultades.has(c.facultad))).map((c) => c.idCarrera),
        facultades: [...facultades],
      }),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(coordinadorKeys.alcanceDe(idUsuario), nuevo);
      setConfirmando(false);
      void uvgSwal.fire({
        icon: 'success',
        title: 'Alcance actualizado',
        text: 'El coordinador recibirá un aviso con su nuevo alcance.',
        timer: 2000,
        showConfirmButton: false,
      });
    },
    onError: (error) => {
      setConfirmando(false);
      void uvgSwal.fire({ icon: 'error', title: 'No se pudo guardar el alcance', text: getApiErrorMessage(error, 'admin') });
    },
  });

  const alternar = <T,>(valor: T) => (previo: Set<T>) => {
    const siguiente = new Set(previo);
    if (!siguiente.delete(valor)) siguiente.add(valor);
    return siguiente;
  };
  const sinCambios =
    actual.carreraIds.length === carreraIds.size &&
    actual.carreraIds.every((id) => carreraIds.has(id)) &&
    actual.facultades.length === facultades.size &&
    actual.facultades.every((f) => facultades.has(f));

  return (
    <div className="space-y-stack">
      <p className="type-meta">{actual.regla}</p>

      <div>
        <h4 className="type-body font-semibold text-text-primary">Alcance actual</h4>
        {actual.carreras.length === 0 ? (
          <p className="type-body text-text-secondary">
            Sin alcance asignado: este coordinador ve las listas vacías y no puede resolver proyectos.
          </p>
        ) : (
          <ul aria-label="Carreras del alcance actual" className="mt-tight flex flex-wrap gap-tight">
            {actual.carreras.map((c) => (
              <li key={c.idCarrera}>
                <Tag tone="sage">{c.nombreCarrera}</Tag>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="space-y-inline">
        <legend className="type-body font-semibold text-text-primary">Carreras y facultades</legend>
        {grupos.map(([facultad, lista]) => {
          const completa = facultad !== '' && facultades.has(facultad);
          return (
            <div key={facultad || 'sin-facultad'} className="space-y-tight">
              {facultad !== '' && (
                <label className="flex items-center gap-inline type-body font-semibold text-text-primary">
                  <Checkbox
                    checked={completa}
                    onCheckedChange={() => setFacultades(alternar(facultad))}
                    aria-label={`Facultad completa: ${facultad}`}
                  />
                  Facultad completa: {facultad}
                </label>
              )}
              <ul className="space-y-tight pl-card">
                {lista.map((c) => (
                  <li key={c.idCarrera}>
                    <label className="flex items-center gap-inline type-body text-text-primary">
                      <Checkbox
                        checked={completa || carreraIds.has(c.idCarrera)}
                        disabled={completa}
                        onCheckedChange={() => setCarreraIds(alternar(c.idCarrera))}
                        aria-label={c.nombreCarrera}
                      />
                      {c.nombreCarrera}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </fieldset>

      <Button type="button" size="sm" disabled={sinCambios || guardar.isPending} onClick={() => setConfirmando(true)}>
        Guardar alcance
      </Button>

      {confirmando && (
        <ConfirmActionDialog
          open
          title="Guardar alcance del coordinador"
          description="El alcance reemplaza al anterior y define qué proyectos y estudiantes puede revisar. Se registra en la bitácora y se avisa al coordinador."
          actionLabel="Guardar alcance"
          isPending={guardar.isPending}
          onConfirm={() => guardar.mutate()}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}

/** Editor del alcance de un coordinador académico: carreras sueltas o una facultad completa. Solo administración. */
export function CoordinadorAlcanceEditor({ idUsuario }: { idUsuario: number }) {
  const alcance = useQuery({ queryKey: coordinadorKeys.alcanceDe(idUsuario), queryFn: () => getAlcanceCoordinador(idUsuario) });
  const carreras = useQuery({ queryKey: ['carreras'], queryFn: getCarreras });

  if (alcance.isError || carreras.isError) {
    return (
      <p role="alert" className="type-body text-error">
        No se pudo cargar el alcance del coordinador.
      </p>
    );
  }
  if (!alcance.data || !carreras.data) {
    return (
      <SkeletonRegion label="Cargando alcance del coordinador">
        <Skeleton className="h-24" />
      </SkeletonRegion>
    );
  }
  // `key`: tras guardar, el formulario vuelve a partir del alcance recién devuelto por el servidor.
  return (
    <Formulario
      key={`${alcance.data.carreraIds.join(',')}|${alcance.data.facultades.join(',')}`}
      idUsuario={idUsuario}
      actual={alcance.data}
      carreras={carreras.data}
    />
  );
}
