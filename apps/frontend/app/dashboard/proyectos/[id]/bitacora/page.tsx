'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Clock,
  ClipboardList,
  ListPlus,
  Pencil,
  Repeat,
  ScrollText,
  UserPlus,
} from 'lucide-react';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useIsProjectLeader } from '@/hooks/use-is-project-leader';
import { useProjectSprints } from '@/hooks/use-project-sprints';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectBitacora } from '@/hooks/use-project-bitacora';
import { LeaderOnlyNotice } from '@/components/projects/leader-only-notice';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { EventoBitacoraDto, TipoEventoBitacoraValor } from '@/lib/types/bitacora';

const LIMITE_POR_PAGINA = 20;

/** Exhaustivo por diseño: un TipoEventoBitacoraValor nuevo en el backend rompe la compilación en vez de mostrarse en blanco. */
const EVENTO_STYLE: Record<TipoEventoBitacoraValor, { label: string; icon: typeof ClipboardList }> = {
  TASK_CREATED: { label: 'Tarea creada', icon: ListPlus },
  TASK_UPDATED: { label: 'Tarea actualizada', icon: Pencil },
  TASK_STATUS_CHANGED: { label: 'Cambio de estado', icon: ArrowRightLeft },
  TASK_ASSIGNED: { label: 'Tarea asignada', icon: UserPlus },
  TASK_REASSIGNED: { label: 'Tarea reasignada', icon: UserPlus },
  TASK_HOURS_LOGGED: { label: 'Horas registradas', icon: Clock },
  SPRINT_STARTED: { label: 'Sprint iniciado', icon: Repeat },
};

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MiembroResumen {
  idUsuario: number;
  nombre: string;
  apellido: string;
}

function nombreUsuario(idUsuario: number | null | undefined, miembros: MiembroResumen[]): string {
  if (idUsuario === null || idUsuario === undefined) return 'nadie';
  const miembro = miembros.find((m) => m.idUsuario === idUsuario);
  return miembro ? `${miembro.nombre} ${miembro.apellido}` : `Usuario #${idUsuario}`;
}

/**
 * Traduce valorAnterior/valorNuevo (JSON libre escrito por
 * BitacoraEventosService) a una frase legible por tipoEvento — nunca
 * muestra el JSON crudo al usuario final, que es exactamente lo que HU-140
 * pide evitar ("sin depender de logs técnicos").
 */
function describirEvento(evento: EventoBitacoraDto, miembros: MiembroResumen[]): string {
  const nuevo = (evento.valorNuevo ?? {}) as Record<string, unknown>;
  const anterior = (evento.valorAnterior ?? {}) as Record<string, unknown>;

  switch (evento.tipoEvento) {
    case 'TASK_CREATED':
      return `"${nuevo.tituloTarea ?? ''}"`;
    case 'TASK_UPDATED': {
      const campos = Object.keys(nuevo);
      return campos.length > 0 ? `Campos modificados: ${campos.join(', ')}` : 'Sin cambios detectados';
    }
    case 'TASK_STATUS_CHANGED':
      return `${anterior.estadoTarea ?? '—'} → ${nuevo.estadoTarea ?? '—'}`;
    case 'TASK_ASSIGNED':
      return `Asignada a ${nombreUsuario(nuevo.idUsuario as number | null, miembros)}`;
    case 'TASK_REASSIGNED':
      return `De ${nombreUsuario(anterior.idUsuario as number | null, miembros)} a ${nombreUsuario(
        nuevo.idUsuario as number | null,
        miembros,
      )}`;
    case 'TASK_HOURS_LOGGED':
      return `${nuevo.horasReales ?? 0} horas registradas`;
    case 'SPRINT_STARTED':
      return `Sprint #${nuevo.numero ?? evento.idEntidad} iniciado`;
    default:
      return '';
  }
}

function BitacoraItemSkeleton() {
  return <Skeleton className="h-20 w-full rounded-xl" />;
}

function BitacoraItem({ evento, miembros }: { evento: EventoBitacoraDto; miembros: MiembroResumen[] }) {
  const estilo = EVENTO_STYLE[evento.tipoEvento];
  const Icon = estilo.icon;
  const actor = evento.actor ? `${evento.actor.nombre} ${evento.actor.apellido}` : 'Alguien';

  return (
    <div className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-on-surface">{estilo.label}</p>
          <time className="text-xs text-tertiary" dateTime={evento.fechaEvento}>
            {formatearFechaHora(evento.fechaEvento)}
          </time>
        </div>
        <p className="mt-1 text-sm text-on-surface">{describirEvento(evento, miembros)}</p>
        <p className="mt-1 text-xs text-tertiary">Por {actor}</p>
      </div>
    </div>
  );
}

export default function BitacoraPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);

  const [page, setPage] = useState(1);
  const [idSprintFiltro, setIdSprintFiltro] = useState<string>('');
  const [idActorFiltro, setIdActorFiltro] = useState<string>('');
  const [tipoEventoFiltro, setTipoEventoFiltro] = useState<string>('');

  const { data: proyecto, isLoading: cargandoProyecto } = useProjectDetail(idProyecto);
  const { isLoading: cargandoUsuario } = useCurrentUser();
  // Validación de rol vía el usuario identificado por la cookie JWT httpOnly
  // (ver hooks/use-is-project-leader.ts) — misma fuente de verdad que usa
  // ProjectSidebar para decidir si mostrar el enlace "Bitácora".
  const isLeader = useIsProjectLeader(idProyecto);

  const { sprints } = useProjectSprints(idProyecto);
  const { members } = useProjectMembers(idProyecto);

  const filtros = {
    idSprint: idSprintFiltro ? Number(idSprintFiltro) : undefined,
    idActor: idActorFiltro ? Number(idActorFiltro) : undefined,
    tipoEvento: tipoEventoFiltro ? (tipoEventoFiltro as TipoEventoBitacoraValor) : undefined,
    page,
    limit: LIMITE_POR_PAGINA,
  };
  // `habilitado: isLeader` evita disparar la petición mientras no se sabe
  // que el usuario (identificado vía la cookie JWT) es líder — el backend
  // respondería 403 igual, pero no hace falta pedirlo.
  const { eventos, totalPages, isLoading, isError, error, refetch } = useProjectBitacora(
    idProyecto,
    filtros,
    isLeader,
  );

  const cargando = isLoading || cargandoProyecto || cargandoUsuario;

  function actualizarFiltro(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-8 md:px-8">
      <Link
        href={`/dashboard/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-tertiary transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al proyecto
      </Link>

      {!cargandoProyecto && !cargandoUsuario && !isLeader ? (
        <LeaderOnlyNotice description="No puedes acceder a la bitácora de este proyecto." />
      ) : (
        <>
          <div className="mb-8 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-headline text-3xl font-extrabold text-on-surface">Bitácora</h1>
          </div>
          <p className="-mt-6 mb-6 text-sm text-tertiary">
            Registro de quién hizo qué, cuándo y cómo evolucionó el trabajo durante el sprint.
          </p>

          <div className="mb-6 flex flex-wrap gap-3">
            <select
              aria-label="Filtrar por sprint"
              value={idSprintFiltro}
              onChange={(e) => actualizarFiltro(setIdSprintFiltro, e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              <option value="">Todos los sprints</option>
              {sprints.map((sprint) => (
                <option key={sprint.idSprint} value={sprint.idSprint}>
                  Sprint {sprint.numero}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por integrante"
              value={idActorFiltro}
              onChange={(e) => actualizarFiltro(setIdActorFiltro, e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              <option value="">Todos los integrantes</option>
              {members.map((miembro) => (
                <option key={miembro.idUsuario} value={miembro.idUsuario}>
                  {miembro.nombre} {miembro.apellido}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por tipo de evento"
              value={tipoEventoFiltro}
              onChange={(e) => actualizarFiltro(setTipoEventoFiltro, e.target.value)}
              className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              <option value="">Todos los tipos</option>
              {(Object.keys(EVENTO_STYLE) as TipoEventoBitacoraValor[]).map((tipo) => (
                <option key={tipo} value={tipo}>
                  {EVENTO_STYLE[tipo].label}
                </option>
              ))}
            </select>
          </div>

          {cargando && (
            <div className="space-y-3">
              <BitacoraItemSkeleton />
              <BitacoraItemSkeleton />
              <BitacoraItemSkeleton />
            </div>
          )}

          {!cargando && isError && (
            <Empty tone="danger" role="alert">
              <EmptyMedia variant="icon">
                <AlertCircle aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {error instanceof Error && error.message
                    ? error.message
                    : 'No fue posible cargar la bitácora del proyecto.'}
                </EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary transition-all hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </EmptyContent>
            </Empty>
          )}

          {!cargando && !isError && eventos.length === 0 && (
            <Empty tone="muted" role="status">
              <EmptyMedia variant="icon">
                <ScrollText aria-hidden="true" className="h-7 w-7" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>Todavía no hay eventos registrados.</EmptyTitle>
                <EmptyDescription>
                  Cuando el equipo cree, edite o asigne tareas, cada acción aparecerá aquí.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!cargando && !isError && eventos.length > 0 && (
            <>
              <div className="space-y-3">
                {eventos.map((evento) => (
                  <BitacoraItem key={evento.idAuditoria} evento={evento} miembros={members} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-tertiary">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
