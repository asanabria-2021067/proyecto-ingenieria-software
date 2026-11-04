'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Lock, Users } from 'lucide-react';
import { AnunciosEntidad } from '@/components/anuncios/anuncios-entidad';
import { AsociacionEstudiantesTabla } from '@/components/associations/asociacion-estudiantes-tabla';
import { AsociacionFiltros } from '@/components/associations/asociacion-filtros';
import { AsociacionProyectos } from '@/components/associations/asociacion-proyectos';
import { ReporteBotones } from '@/components/associations/reporte-botones';
import { PortafolioProyectos } from '@/components/projects/portafolio-proyectos';
import { DATA_TABLE_CARD } from '@/components/dashboard/data-table';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/components/admin/admin-tabs';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { BotonAyudaTour } from '@/components/ayuda/boton-ayuda-tour';
import { PageTitle } from '@/components/ui/page-title';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEstudiantesAsociacion, useMisJuntas } from '@/hooks/use-asociaciones';
import { useHorasActual } from '@/hooks/use-horas-semestre';
import { CARGO_LABEL, FILTROS_ASOCIACION_INICIALES, filtrosAsociacion, type FiltrosAsociacionUI } from '@/lib/asociaciones/vista';
import { descargarEstudiantesAsociacion, descargarProyectosAsociacion } from '@/lib/services/asociaciones';

const PASOS_AYUDA = [
  { target: '#tour-aso-pestanas', title: 'Secciones', content: 'Cambia entre estudiantes, proyectos, anuncios y portafolio.' },
  { target: '#tour-aso-filtros', title: 'Filtros', content: 'Busca por nombre y filtra por semestre o tipo de horas.' },
  { target: '#tour-aso-reportes', title: 'Reportes', content: 'Descarga la lista de estudiantes, o solo los que están en riesgo, en CSV o PDF.' },
];

/**
 * Dashboard de la asociación: solo lectura. Muestra a los estudiantes de las carreras que representa con sus horas
 * del semestre (declaradas y acreditadas por separado) y los proyectos publicados a su nombre.
 */
export default function AsociacionDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const idAsociacion = Number(id);
  const juntas = useMisJuntas();
  const junta = juntas.data?.find((j) => j.idAsociacion === idAsociacion);

  const [ui, setUi] = useState<FiltrosAsociacionUI>(FILTROS_ASOCIACION_INICIALES);
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setUi((actual) => (actual.busqueda === texto ? actual : { ...actual, busqueda: texto })), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const filtros = useMemo(() => filtrosAsociacion(ui), [ui]);
  const estudiantes = useEstudiantesAsociacion(idAsociacion, filtros, !!junta);
  const semestreActual = useHorasActual().data?.semestre;
  const semestre = estudiantes.data?.pages[0]?.semestre;
  const filas = useMemo(() => estudiantes.data?.pages.flatMap((p) => p.filas) ?? [], [estudiantes.data]);

  if (juntas.isLoading) {
    return (
      <SkeletonRegion className={dashboardPage('py-section')} label="Cargando la asociación">
        <Skeleton className="h-10 w-72" />
      </SkeletonRegion>
    );
  }
  if (!junta) {
    return (
      <div className={dashboardPage('py-section')}>
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <Lock aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No perteneces a la junta de esta asociación</EmptyTitle>
            <EmptyDescription>Solo la junta directiva ve este tablero.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Volver al dashboard</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const nombreSemestre = semestre ? `${semestre.anio}-${semestre.periodo}` : 'semestre';
  const tipoVisible = ui.tipo === 'todos' ? undefined : ui.tipo;

  return (
    <div className={dashboardPage('flex flex-col gap-section py-section')}>
      <header className="flex items-start justify-between gap-inline">
        <div>
          <PageTitle>{junta.nombre}</PageTitle>
          <p className="type-body mt-micro text-text-secondary">
            Tu cargo: {CARGO_LABEL[junta.cargo]}. Aquí ves el avance de horas de los estudiantes de las carreras de la asociación. Es solo
            consulta: la junta no aprueba ni acredita horas.
          </p>
        </div>
        <BotonAyudaTour pasos={PASOS_AYUDA} />
      </header>

      <Tabs defaultValue="estudiantes" className="gap-stack">
        <TabsList id="tour-aso-pestanas" className={ADMIN_TAB_LIST}>
          <TabsTrigger value="estudiantes" className={ADMIN_TAB_TRIGGER}>
            Estudiantes
          </TabsTrigger>
          <TabsTrigger value="proyectos" className={ADMIN_TAB_TRIGGER}>
            Proyectos
          </TabsTrigger>
          <TabsTrigger value="anuncios" className={ADMIN_TAB_TRIGGER}>
            Anuncios
          </TabsTrigger>
          <TabsTrigger value="portafolio" className={ADMIN_TAB_TRIGGER}>
            Portafolio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estudiantes" className="flex flex-col gap-stack">
          <div id="tour-aso-filtros">
            <AsociacionFiltros value={ui} onChange={setUi} texto={texto} onTexto={setTexto} semestreActual={semestreActual} />
          </div>

          <div id="tour-aso-reportes" className="flex flex-wrap items-center gap-stack">
            <ReporteBotones
              etiqueta="Estudiantes"
              nombre={`estudiantes-${nombreSemestre}`}
              descargar={(f) => descargarEstudiantesAsociacion(idAsociacion, f, filtros)}
            />
            <ReporteBotones
              etiqueta="En riesgo"
              nombre={`en-riesgo-${nombreSemestre}`}
              descargar={(f) => descargarEstudiantesAsociacion(idAsociacion, f, { ...filtros, enRiesgo: true })}
            />
          </div>

          {estudiantes.isError ? (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No pudimos cargar a los estudiantes</EmptyTitle>
                <EmptyDescription>Revisa tu conexión y vuelve a intentarlo.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={() => void estudiantes.refetch()}>
                  Reintentar
                </Button>
              </EmptyContent>
            </Empty>
          ) : estudiantes.isLoading ? (
            <SkeletonRegion className={DATA_TABLE_CARD} label="Cargando estudiantes de la asociación">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="m-stack h-16" />
              ))}
            </SkeletonRegion>
          ) : filas.length === 0 && !estudiantes.hasNextPage ? (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <Users aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Ningún estudiante coincide con estos filtros</EmptyTitle>
                <EmptyDescription>Prueba con otro semestre, tipo de horas o búsqueda.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTexto('');
                    setUi(FILTROS_ASOCIACION_INICIALES);
                  }}
                >
                  Quitar filtros
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <p className="type-body text-text-secondary" role="status" aria-live="polite">
                Mostrando {filas.length} {filas.length === 1 ? 'estudiante' : 'estudiantes'}
                {estudiantes.hasNextPage ? '. Hay más por cargar.' : '.'}
              </p>
              <AsociacionEstudiantesTabla filas={filas} tipo={tipoVisible} />
              {estudiantes.hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={estudiantes.isFetchingNextPage}
                    onClick={() => void estudiantes.fetchNextPage()}
                  >
                    {estudiantes.isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="proyectos" className="flex flex-col gap-stack">
          <ReporteBotones
            etiqueta="Proyectos"
            nombre="proyectos-asociacion"
            descargar={(f) => descargarProyectosAsociacion(idAsociacion, f)}
          />
          <AsociacionProyectos idAsociacion={idAsociacion} />
        </TabsContent>

        <TabsContent value="anuncios">
          {/* Publican el Presidente y quien tenga nivel Editor o superior (misma regla que el backend). */}
          <AnunciosEntidad
            tipo="asociaciones"
            id={idAsociacion}
            puedePublicar={junta.cargo === 'PRESIDENTE' || junta.nivelPermiso !== 'LECTURA'}
          />
        </TabsContent>

        <TabsContent value="portafolio">
          <PortafolioProyectos tipo="asociacion" id={idAsociacion} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
