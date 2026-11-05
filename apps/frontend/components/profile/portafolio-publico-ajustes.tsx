'use client';

import { Copy, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { usePortafolioAcciones, usePortafolioEstado } from '@/hooks/use-perfil-portafolio';
import { aviso } from '@/lib/mensajes';

/** MEJ-146: activar o desactivar el portafolio público, copiar su enlace y generar uno nuevo. */
export function PortafolioPublicoAjustes() {
  const { data, isLoading, isError } = usePortafolioEstado();
  const { actualizar, regenerar } = usePortafolioAcciones();

  if (isLoading) return <Skeleton className="h-40 rounded-card" aria-label="Cargando portafolio público" />;
  if (isError || !data) return null;

  const enlace = data.token ? `${window.location.origin}/portafolio/${data.token}` : '';
  const copiar = () =>
    navigator.clipboard
      .writeText(enlace)
      .then(() => aviso.exito('Enlace copiado', 'Compártelo con quien quieras que vea tu portafolio.'))
      .catch(() => aviso.error('No se pudo copiar', 'Selecciona el enlace y cópialo manualmente.'));

  return (
    <section className="card-base space-y-stack" aria-labelledby="portafolio-publico-titulo">
      <div className="flex items-start justify-between gap-stack">
        <div className="space-y-micro">
          <h2 id="portafolio-publico-titulo" className="type-subtitle flex items-center gap-tight text-text-primary">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            Portafolio público
          </h2>
          <p className="type-meta">
            Un enlace que se abre sin iniciar sesión con tu nombre, carrera, habilidades y proyectos cerrados. Nunca muestra tu
            correo, carné, teléfono ni tus horas.
          </p>
        </div>
        <Switch
          checked={data.activo}
          disabled={actualizar.isPending}
          onCheckedChange={(activo) => actualizar.mutate({ activo })}
          aria-label="Portafolio público activo"
        />
      </div>

      {data.activo && enlace && (
        <div className="space-y-tight">
          <div className="flex flex-col gap-tight sm:flex-row">
            <input
              readOnly
              value={enlace}
              aria-label="Enlace de tu portafolio público"
              onFocus={(e) => e.currentTarget.select()}
              className="type-body min-w-0 flex-1 rounded-control border border-outline-variant bg-card px-3 py-2 text-text-primary"
            />
            <Button type="button" variant="outline" onClick={copiar}>
              <Copy aria-hidden="true" />
              Copiar enlace
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-tight">
            <label className="type-meta flex items-center gap-tight">
              <Checkbox
                checked={data.indexable}
                disabled={actualizar.isPending}
                onCheckedChange={(v) => actualizar.mutate({ indexable: v === true })}
                aria-label="Permitir que los buscadores indexen mi portafolio"
              />
              Permitir que los buscadores lo indexen
            </label>
            <Button type="button" variant="ghost" size="sm" disabled={regenerar.isPending} onClick={() => regenerar.mutate()}>
              <RefreshCw aria-hidden="true" />
              Generar enlace nuevo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
