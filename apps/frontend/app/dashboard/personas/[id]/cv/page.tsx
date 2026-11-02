'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { dashboardPage } from '@/components/layout/dashboard-page';
import { PerfilCvAcciones } from '@/components/profile/perfil-social-secciones';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageTitle } from '@/components/ui/page-title';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useCvProyectos } from '@/hooks/use-perfil-social';

const TH = `h-auto whitespace-normal px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`;
const TD = 'whitespace-normal px-stack py-inline align-top';
const dia = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

/** MEJ-27/63: CV de proyectos cerrados. Es una ruta del dashboard, así que el enlace solo abre con sesión iniciada. */
export default function CvProyectosPage() {
  const idUsuario = Number(useParams<{ id: string }>().id);
  const { data: yo } = useCurrentUser();
  const { data: cv, isLoading, isError } = useCvProyectos(idUsuario);
  const propio = yo?.idUsuario === idUsuario;
  const volver = propio ? '/dashboard/perfil' : `/dashboard/personas/${idUsuario}`;

  return (
    <div className={dashboardPage('flex flex-col gap-section py-section')}>
      <Link href={volver} className="type-body inline-flex items-center gap-tight font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver al perfil
      </Link>

      {isLoading ? (
        <SkeletonRegion label="Cargando CV de proyectos" className="space-y-stack">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40 w-full" />
        </SkeletonRegion>
      ) : isError || !cv ? (
        <Empty tone="danger" role="alert">
          <EmptyHeader>
            <EmptyTitle>No pudimos cargar este CV</EmptyTitle>
            <EmptyDescription>Puede que el usuario ya no exista o que no tengas acceso.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/personas">Ir a Personas</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-stack">
            <div>
              <PageTitle className="type-display">CV de proyectos</PageTitle>
              <p className="type-body text-text-secondary">
                {cv.nombre}
                {cv.carrera ? ` · ${cv.carrera}` : ''}
              </p>
            </div>
            <PerfilCvAcciones idUsuario={idUsuario} nombre={cv.nombre} />
          </header>

          {cv.proyectos.length === 0 ? (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <FileText aria-hidden="true" className="size-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Todavía no hay proyectos cerrados</EmptyTitle>
                <EmptyDescription>
                  {propio ? 'Cuando termine un proyecto en el que participes, aparecerá aquí con tu rol y tus horas.' : 'Cuando termine un proyecto, aparecerá aquí.'}
                </EmptyDescription>
              </EmptyHeader>
              {propio && (
                <EmptyContent>
                  <Button asChild size="sm">
                    <Link href="/dashboard/proyectos">Explorar proyectos</Link>
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <div className={DATA_TABLE_CARD}>
              <Table>
                <caption className="sr-only">Proyectos cerrados con rol, fechas y horas acreditadas</caption>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    <TableHead scope="col" className={TH}>Proyecto</TableHead>
                    <TableHead scope="col" className={TH}>Rol</TableHead>
                    <TableHead scope="col" className={TH}>Inicio</TableHead>
                    <TableHead scope="col" className={TH}>Fin</TableHead>
                    <TableHead scope="col" className={`${TH} text-right`}>Horas acreditadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cv.proyectos.map((p) => (
                    <TableRow key={p.idProyecto} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                      <TableCell className={`${TD} font-medium`}>
                        <Link href={`/dashboard/proyectos/${p.idProyecto}`} className="text-primary hover:underline">
                          {p.titulo}
                        </Link>
                      </TableCell>
                      <TableCell className={TD}>{p.rol}</TableCell>
                      <TableCell className={`${TD} tabular-nums`}>{dia(p.inicio)}</TableCell>
                      <TableCell className={`${TD} tabular-nums`}>{dia(p.fin)}</TableCell>
                      <TableCell className={`${TD} text-right tabular-nums`}>{p.horasAcreditadas}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className={DATA_TABLE_ROW_BORDER}>
                    <TableCell colSpan={4} className={`${TD} font-semibold`}>Total</TableCell>
                    <TableCell className={`${TD} text-right font-semibold tabular-nums`}>{cv.totalHorasAcreditadas}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
