'use client';

import Link from 'next/link';
import { ArrowRight, Briefcase, FolderOpen, GraduationCap, HandHeart, type LucideIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  estadoBadgeLabel,
  estadoBadgeStyle,
  tipoBadgeLabel,
  tipoBadgeStyle,
} from '@/components/projects/available-project-card';
import { ESTADO_LABEL } from '@/components/projects/task-board.utils';
import { formatearHoras } from '@/lib/hours/format';
import type { MisHorasProyecto, MisHorasTarea } from '@/lib/services/users';
import type { EstadoTarea, TipoProyecto } from '@/types';

const ICONO_TIPO: Record<TipoProyecto, LucideIcon> = {
  ACADEMICO_HORAS_BECA: GraduationCap,
  EXTRACURRICULAR_EXTENSION: HandHeart,
  ACADEMICO_EXPERIENCIA: Briefcase,
};

/** Mismos tonos que Mis Tareas y el explorador de tareas (el mapa no se extrae aquí). */
const ESTADO_TAREA_TONE: Record<EstadoTarea, string> = {
  POR_HACER: 'pill-neutral',
  EN_PROGRESO: 'pill-warning',
  EN_REVISION: 'pill-neutral',
  HECHO: 'pill-success',
};

function IconoTipo({ tipo }: { tipo: TipoProyecto }) {
  const Icono = ICONO_TIPO[tipo] ?? FolderOpen;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
      <Icono className="size-5" aria-hidden="true" />
    </span>
  );
}

function PillRol({ proyecto }: { proyecto: MisHorasProyecto }) {
  if (proyecto.esLider) return <span className="pill pill-accent">Líder</span>;
  if (!proyecto.participacionActiva) return <span className="pill pill-neutral">Participación finalizada</span>;
  return null;
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="flex flex-col">
      <span className="type-meta">{etiqueta}</span>
      <span className="type-body font-semibold tabular-nums">{formatearHoras(valor)}</span>
    </span>
  );
}

/** Una tarea solo enlaza si el usuario todavía puede abrirla: proyecto abierto, sigue dentro (o lo lidera) y no se eliminó. */
function puedeEnlazar(proyecto: MisHorasProyecto, tarea: MisHorasTarea): boolean {
  return proyecto.abierto && (proyecto.participacionActiva || proyecto.esLider) && !tarea.eliminada;
}

function TablaTareas({ proyecto }: { proyecto: MisHorasProyecto }) {
  if (proyecto.tareas.length === 0) {
    return <p className="type-meta">Aún no registras horas en este proyecto.</p>;
  }
  return (
    <Table aria-label={`Horas por tarea en ${proyecto.tituloProyecto}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Tarea</TableHead>
          <TableHead className="hidden sm:table-cell">Sprint</TableHead>
          <TableHead className="hidden sm:table-cell">Estado</TableHead>
          <TableHead className="text-right">Registradas</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Legacy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proyecto.tareas.map((tarea) => (
          <TableRow key={tarea.idTarea}>
            <TableCell className="max-w-64 whitespace-normal">
              {tarea.eliminada ? (
                <span className="flex flex-wrap items-center gap-tight">
                  <span className="text-text-disabled">{tarea.tituloTarea}</span>
                  <span className="pill pill-neutral">Eliminada</span>
                </span>
              ) : puedeEnlazar(proyecto, tarea) ? (
                <Link
                  href={`/dashboard/projects/${proyecto.idProyecto}/kanban/tasks/${tarea.idTarea}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {tarea.tituloTarea}
                </Link>
              ) : (
                <span>{tarea.tituloTarea}</span>
              )}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              {tarea.sprint ? `Sprint ${tarea.sprint.numero}` : <span className="text-text-secondary">Sin sprint</span>}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <span className={`pill ${ESTADO_TAREA_TONE[tarea.estadoTarea]}`}>{ESTADO_LABEL[tarea.estadoTarea]}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatearHoras(tarea.registradas)}</TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatearHoras(tarea.legacy)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProyectoAbierto({ proyecto }: { proyecto: MisHorasProyecto }) {
  return (
    <AccordionItem value={String(proyecto.idProyecto)} className="card-base last:border-b">
      <AccordionTrigger className="items-center py-0 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-inline md:flex-row md:items-center">
          <span className="flex min-w-0 flex-1 items-start gap-inline">
            <IconoTipo tipo={proyecto.tipoProyecto} />
            <span className="flex min-w-0 flex-col gap-micro">
              <span className="type-subtitle">{proyecto.tituloProyecto}</span>
              <span className="flex flex-wrap gap-micro">
                <span className={`pill ${tipoBadgeStyle(proyecto.tipoProyecto)}`}>{tipoBadgeLabel(proyecto.tipoProyecto)}</span>
                <span className={`pill ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
                  {estadoBadgeLabel(proyecto.estadoProyecto)}
                </span>
                <PillRol proyecto={proyecto} />
              </span>
            </span>
          </span>
          <span className="grid shrink-0 grid-cols-3 gap-inline md:w-80">
            <Cifra etiqueta="Registradas" valor={proyecto.registradas} />
            <Cifra etiqueta="Propuestas" valor={proyecto.propuestasPendientes} />
            <Cifra etiqueta="Acreditadas" valor={proyecto.acreditadas} />
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-stack pb-0">
        <TablaTareas proyecto={proyecto} />
      </AccordionContent>
    </AccordionItem>
  );
}

function ProyectoCerrado({ proyecto }: { proyecto: MisHorasProyecto }) {
  const conHistorico = proyecto.estadoProyecto === 'CERRADO' && !proyecto.eliminado;
  return (
    <li className="card-base flex flex-col gap-inline sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-inline">
        <IconoTipo tipo={proyecto.tipoProyecto} />
        <div className="flex min-w-0 flex-col gap-micro">
          <h3 className="type-subtitle">{proyecto.tituloProyecto}</h3>
          <div className="flex flex-wrap items-center gap-x-inline gap-y-micro">
            {proyecto.eliminado ? (
              <span className="pill pill-neutral">Eliminado</span>
            ) : (
              <span className={`pill ${estadoBadgeStyle(proyecto.estadoProyecto)}`}>
                {estadoBadgeLabel(proyecto.estadoProyecto)}
              </span>
            )}
            <span className="type-meta">
              Acreditadas <span className="font-semibold text-text-primary">{formatearHoras(proyecto.acreditadas)}</span>
            </span>
            {Number(proyecto.propuestasPendientes) > 0 && (
              <span className="type-meta">
                Propuestas{' '}
                <span className="font-semibold text-text-primary">{formatearHoras(proyecto.propuestasPendientes)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
      {conHistorico && (
        <Link
          href={`/dashboard/proyectos/${proyecto.idProyecto}`}
          aria-label={`Ver histórico de ${proyecto.tituloProyecto}`}
          className="inline-flex shrink-0 items-center gap-micro type-body font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver histórico
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

/**
 * HU-158 (T-232): proyectos de Mis Horas. Respeta el orden del backend
 * (abiertos primero, luego por título) y muestra sus cifras tal cual: aquí no
 * se suma, no se reordena y el legacy se presenta siempre aparte.
 */
export function MyHoursProjectList({ proyectos }: { proyectos: MisHorasProyecto[] }) {
  const abiertos = proyectos.filter((proyecto) => proyecto.abierto);
  const cerrados = proyectos.filter((proyecto) => !proyecto.abierto);

  return (
    <>
      <section aria-labelledby="mis-horas-abiertos-titulo" className="flex flex-col gap-stack">
        <h2 id="mis-horas-abiertos-titulo" className="type-section">
          Proyectos abiertos
        </h2>
        {abiertos.length === 0 ? (
          <Empty tone="muted" className="gap-inline py-6 md:py-8">
            <EmptyMedia variant="icon">
              <FolderOpen aria-hidden="true" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No tienes proyectos abiertos</EmptyTitle>
              <EmptyDescription>Las horas de tus proyectos cerrados aparecen más abajo.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Accordion type="multiple" className="flex flex-col gap-inline">
            {abiertos.map((proyecto) => (
              <ProyectoAbierto key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </Accordion>
        )}
      </section>

      {cerrados.length > 0 && (
        <section aria-labelledby="mis-horas-cerrados-titulo" className="flex flex-col gap-stack">
          <h2 id="mis-horas-cerrados-titulo" className="type-section">
            Proyectos cerrados
          </h2>
          <ul className="flex flex-col gap-inline">
            {cerrados.map((proyecto) => (
              <ProyectoCerrado key={proyecto.idProyecto} proyecto={proyecto} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
