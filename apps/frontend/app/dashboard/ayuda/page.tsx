'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { AYUDA_POR_ROL, ROLES_AYUDA, buscarAyuda, type RolAyuda } from '@/content/ayuda';
import { DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageTitle } from '@/components/ui/page-title';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMisJuntas } from '@/hooks/use-asociaciones';
import { isAdminUser, useCurrentUser } from '@/hooks/use-current-user';
import { getMyProjects } from '@/lib/services/projects';

const ETIQUETA_ROL: Record<RolAyuda, string> = {
  estudiante: 'Estudiante',
  lider: 'Líder de proyecto',
  junta: 'Junta de asociación',
  coordinador: 'Coordinador',
  admin: 'Administración',
};

/** MEJ-86: preguntas frecuentes según el rol del usuario; solo el administrador ve las de los demás roles. */
export default function AyudaPage() {
  const { data: user } = useCurrentUser();
  const esAdmin = isAdminUser(user);
  const { data: juntas } = useMisJuntas(!!user && !esAdmin);
  const { data: proyectos } = useQuery({ queryKey: ['mis-proyectos'], queryFn: getMyProjects, enabled: !!user && !esAdmin });
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState<RolAyuda | null>(null);

  const roles = (user?.roles ?? []).map((r) => r.toLowerCase());
  const disponibles: RolAyuda[] = esAdmin
    ? [...ROLES_AYUDA]
    : [
        'estudiante',
        ...(proyectos?.length ? (['lider'] as const) : []),
        ...(juntas?.length ? (['junta'] as const) : []),
        ...(roles.includes('coordinador_academico') ? (['coordinador'] as const) : []),
      ];
  const rol = elegido && disponibles.includes(elegido) ? elegido : esAdmin ? 'admin' : 'estudiante';
  const preguntas = buscarAyuda(AYUDA_POR_ROL[rol], texto);

  return (
    <div className={dashboardPage('flex flex-col gap-section py-section lg:py-page')}>
      <header>
        <PageTitle className="type-display">Centro de ayuda</PageTitle>
        <p className="type-body mt-micro text-text-secondary">
          Respuestas a las dudas más comunes{esAdmin ? '' : ' según tu rol'}. Busca por una palabra o abre la pregunta que necesites.
        </p>
      </header>

      {disponibles.length > 1 && (
        <Tabs value={rol} onValueChange={(v) => setElegido(v as RolAyuda)}>
          <TabsList className="h-auto flex-wrap justify-start">
            {disponibles.map((r) => (
              <TabsTrigger key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <DashboardSearchField
        containerClassName="max-w-xl"
        aria-label="Buscar en el centro de ayuda"
        placeholder="Buscar una pregunta..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {preguntas.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No encontramos preguntas con esa búsqueda</EmptyTitle>
            <EmptyDescription>Prueba con otra palabra o escríbenos desde Contacto y soporte.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="type-meta" role="status" aria-live="polite">
            {preguntas.length} {preguntas.length === 1 ? 'pregunta' : 'preguntas'}
          </p>
          <Accordion type="single" collapsible className="card-base py-0">
            {preguntas.map((p) => (
              <AccordionItem key={p.id} value={p.id}>
                <AccordionTrigger className="type-body px-stack font-semibold text-text-primary">{p.pregunta}</AccordionTrigger>
                <AccordionContent className="space-y-tight px-stack">
                  <p className="type-body text-text-secondary">{p.respuesta}</p>
                  {p.ruta && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={p.ruta}>Ir a esta pantalla</Link>
                    </Button>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </>
      )}
    </div>
  );
}
