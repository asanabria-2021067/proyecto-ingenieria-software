'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  leerUltimaVistaCruda,
  parsearUltimaVista,
  suscribirUltimaVista,
} from '@/lib/ultima-vista';

/** MEJ-78: retoma la ultima pagina interna visitada; sin historial, propone empezar por Explorar. */
export function ContinuarDondeQuedaste({ idUsuario }: { idUsuario: number | undefined }) {
  const cruda = useSyncExternalStore(suscribirUltimaVista, leerUltimaVistaCruda, () => null);
  const vista = parsearUltimaVista(cruda, idUsuario);
  const href = vista?.href ?? '/dashboard/proyectos';

  return (
    <section
      aria-labelledby="continuar-titulo"
      className="mb-section flex flex-wrap items-center gap-stack rounded-card border border-outline-variant bg-card p-card shadow-card"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-muted text-text-secondary">
        <History className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="continuar-titulo" className="type-subtitle text-text-primary">
          Continúa donde te quedaste
        </h2>
        <p className="type-body truncate text-text-secondary">
          {vista ? vista.etiqueta : 'Aún no has visitado nada. Explora proyectos para empezar.'}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href={href}>
          {vista ? 'Continuar' : 'Explorar proyectos'}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
