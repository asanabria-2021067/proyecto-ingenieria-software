'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SkeletonList } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useCalendarioOrganizacion } from '@/hooks/use-calendario-organizacion';
import { agruparPorDia, mesSiguiente, rangoDelMes } from '@/lib/calendar/agenda-organizacion';
import { TIPO_EVENTO_ESTILO } from '@/lib/calendar/paleta';
import { downloadBlob } from '@/lib/download-file';
import { aviso } from '@/lib/mensajes';
import { descargarIcsOrganizacion } from '@/lib/services/calendario-ics';

const mesTexto = (d: Date) => d.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
const diaTexto = (clave: string) =>
  new Date(`${clave}T12:00:00`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });

/** MEJ-34: agenda mensual de los proyectos de la organización, con exportación .ics. */
export function OrgCalendario({ idOrganizacion }: { idOrganizacion: number }) {
  const [mes, setMes] = useState(() => mesSiguiente(new Date(), 0));
  const { desde, hasta } = rangoDelMes(mes);
  const { data, isLoading, isError, refetch } = useCalendarioOrganizacion(idOrganizacion, desde, hasta);
  const [exportando, setExportando] = useState(false);

  const exportar = async () => {
    setExportando(true);
    try {
      downloadBlob(await descargarIcsOrganizacion(idOrganizacion, desde, hasta), `organizacion-${idOrganizacion}.ics`);
    } catch {
      aviso.error('No se pudo exportar el calendario', 'Intenta de nuevo en unos segundos.');
    } finally {
      setExportando(false);
    }
  };

  const dias = agruparPorDia(data ?? []);

  return (
    <section className="card-base space-y-stack" aria-labelledby="org-calendario-titulo">
      <div className="flex flex-wrap items-center justify-between gap-stack">
        <div className="flex items-center gap-tight">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Mes anterior" onClick={() => setMes(mesSiguiente(mes, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2 id="org-calendario-titulo" className="type-subtitle min-w-40 text-center">
            {mesTexto(mes)}
          </h2>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Mes siguiente" onClick={() => setMes(mesSiguiente(mes, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={exportando} onClick={() => void exportar()}>
          <Download aria-hidden="true" />
          Exportar .ics
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList label="Cargando calendario" count={3} lines={2} layout="rows" />
      ) : isError ? (
        <Empty tone="danger" role="alert">
          <EmptyHeader>
            <EmptyTitle>No se pudo cargar el calendario.</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : dias.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyMedia variant="icon">
            <CalendarDays aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay actividades este mes.</EmptyTitle>
            <EmptyDescription>Aquí aparecen las sesiones que los líderes agendan en los proyectos de la organización.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => setMes(mesSiguiente(mes, 1))}>
              Ver el mes siguiente
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-stack">
          {dias.map(([clave, eventos]) => (
            <div key={clave}>
              <h3 className="type-meta mb-tight font-semibold uppercase tracking-wide">{diaTexto(clave)}</h3>
              <ul className="flex flex-col gap-tight">
                {eventos.map((e) => (
                  <li key={e.idEvento} className="flex flex-wrap items-center justify-between gap-tight rounded-control border border-outline-variant p-tight">
                    <div className="min-w-0">
                      <p className="type-body truncate font-medium text-text-primary">{e.tituloEvento}</p>
                      <p className="type-meta">
                        <span className="tabular-nums">{hora(e.fechaInicio)} - {hora(e.fechaFin)}</span>
                        {' · '}
                        <Link href={`/dashboard/proyectos/${e.proyecto.idProyecto}`} className="text-primary hover:underline">
                          {e.proyecto.tituloProyecto}
                        </Link>
                      </p>
                    </div>
                    <Tag tone="subtle" size="sm">{TIPO_EVENTO_ESTILO[e.tipoEvento].label}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
