import Link from 'next/link';
import { CheckCircle2, Circle, Clock, Flag, ListChecks, Repeat, Sparkles, Users } from 'lucide-react';
import { HoursKpiCard } from '@/components/hours/hours-kpi-card';
import { ProjectPageHeader } from '@/components/projects/detail/project-page-shell';
import { formatearHoras } from '@/components/projects/portafolio-proyectos';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
} from '@/components/dashboard/data-table';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { fecha } from '@/lib/utils';
import { TIPO_LABEL } from '@/types';
import type { TipoProyecto } from '@/types';
import type { ResultadosProyectoDTO } from '@/lib/services/seguimiento';

function Seccion({ icon: Icon, titulo, children }: { icon: typeof Users; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={titulo}>
      <h2 className="type-section flex items-center gap-tight">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function VacioSeccion({ mensaje }: { mensaje: string }) {
  return <p className="card-base type-body text-text-secondary">{mensaje}</p>;
}

/** Contenido de la página (sin red), para poder probarlo. */
export function ResultadosContenido({ resultados, idProyecto }: { resultados: ResultadosProyectoDTO; idProyecto: number }) {
  const { proyecto, metricas, hitos, sprints, equipo } = resultados;
  const duenos = [...proyecto.organizaciones.map((o) => o.nombreOrganizacion), ...(proyecto.asociacion ? [proyecto.asociacion.nombre] : [])];

  return (
    <div className="flex flex-col gap-section">
      <ProjectPageHeader
        back={{ href: `/dashboard/proyectos/${idProyecto}`, label: 'Volver al proyecto' }}
        title={proyecto.tituloProyecto}
        description={proyecto.descripcionProyecto}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/proyectos/${idProyecto}`}>Ver el histórico completo</Link>
          </Button>
        }
      >
        <div className="mt-tight flex flex-wrap items-center gap-tight">
          <Tag tone="closed">Proyecto cerrado</Tag>
          <Tag tone="subtle">{TIPO_LABEL[proyecto.tipoProyecto as TipoProyecto] ?? proyecto.tipoProyecto}</Tag>
          {duenos.map((d) => (
            <Tag key={d} tone="sage">
              {d}
            </Tag>
          ))}
        </div>
        <p className="type-meta mt-tight text-text-secondary">
          Liderado por {proyecto.lider.nombre} {proyecto.lider.apellido} · {fecha(proyecto.fechaInicio)} a {fecha(proyecto.fechaCierre)}
        </p>
      </ProjectPageHeader>

      <div className="grid grid-cols-2 gap-grid @3xl/project:grid-cols-3" data-testid="resultados-metricas">
        <HoursKpiCard variante="en-linea" icon={Users} label="Integrantes" value={String(metricas.integrantes)} />
        <HoursKpiCard
          variante="en-linea"
          icon={ListChecks}
          label="Tareas hechas"
          value={`${metricas.tareasHechas} de ${metricas.tareasTotales}`}
        />
        <HoursKpiCard
          variante="en-linea"
          icon={Flag}
          label="Hitos completados"
          value={`${metricas.hitosCompletados} de ${metricas.hitosTotales}`}
        />
        <HoursKpiCard variante="en-linea" destacado icon={Clock} label="Horas acreditadas" value={metricas.horasAcreditadas === null ? '-' : formatearHoras(metricas.horasAcreditadas)} />
        <HoursKpiCard variante="en-linea" icon={Repeat} label="Sprints cerrados" value={String(metricas.sprintsCerrados)} />
        <HoursKpiCard variante="en-linea" icon={Sparkles} label="Reconocimientos" value={String(metricas.reconocimientos)} />
      </div>

      <Seccion icon={Flag} titulo="Hitos">
        {hitos.length === 0 ? (
          <VacioSeccion mensaje="Este proyecto no definió hitos." />
        ) : (
          <ul className="card-base divide-y divide-outline-variant/40 p-0">
            {hitos.map((h) => (
              <li key={h.idHito} className="flex flex-wrap items-center justify-between gap-tight px-stack py-3">
                <span className="flex min-w-0 items-center gap-tight type-body font-medium text-text-primary">
                  {h.completado ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-label="Completado" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-text-secondary" aria-label="Sin completar" />
                  )}
                  {h.tituloHito}
                </span>
                <span className="type-meta text-text-secondary">{h.fechaLimite ? `Fecha límite ${fecha(h.fechaLimite)}` : 'Sin fecha límite'}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion icon={Repeat} titulo="Sprints">
        {sprints.length === 0 ? (
          <VacioSeccion mensaje="No se cerró ningún sprint en este proyecto." />
        ) : (
          <div className={DATA_TABLE_CARD}>
            <Table containerLabel="Tabla de sprints">
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  <TableHead scope="col" className={DATA_TABLE_HEAD_TEXT}>
                    Sprint
                  </TableHead>
                  <TableHead scope="col" className={DATA_TABLE_HEAD_TEXT}>
                    Tareas completadas
                  </TableHead>
                  <TableHead scope="col" className={`${DATA_TABLE_HEAD_TEXT} text-right`}>
                    Cumplimiento
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sprints.map((s) => (
                  <TableRow key={s.numero} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                    <TableCell className="font-medium">Sprint {s.numero}</TableCell>
                    <TableCell className="tabular-nums">
                      {s.tareasCompletadasCierre ?? 0} de {s.tareasPlanificadasCierre ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.porcentajeCumplimientoCierre ?? 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>

      <Seccion icon={Users} titulo="Equipo">
        {equipo.length === 0 ? (
          <VacioSeccion mensaje="La lista del equipo solo la ven quienes participaron en el proyecto." />
        ) : (
          <div className={DATA_TABLE_CARD}>
            <Table containerLabel="Tabla del equipo">
              <TableHeader>
                <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                  <TableHead scope="col" className={DATA_TABLE_HEAD_TEXT}>
                    Integrante
                  </TableHead>
                  <TableHead scope="col" className={DATA_TABLE_HEAD_TEXT}>
                    Rol
                  </TableHead>
                  <TableHead scope="col" className={`${DATA_TABLE_HEAD_TEXT} text-right`}>
                    Horas acreditadas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipo.map((e) => (
                  <TableRow key={e.idUsuario} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                    <TableCell className="font-medium">
                      {e.nombre} {e.apellido}
                    </TableCell>
                    <TableCell className="whitespace-normal">{e.roles.join(', ')}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatearHoras(e.horasAcreditadas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

