'use client';

import Link from 'next/link';
import { AlertCircle, ChevronDown, ClipboardList, Loader2, SlidersHorizontal, Target, UserMinus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { TONO_CLASES, type TonoCalendario } from '@/lib/calendar/paleta';
import type { UsuarioCalendarioDTO } from '@/lib/services/calendar-shares';
import type { EstadoAgendaCompartida } from '@/hooks/use-calendar-shares';
import { iniciales } from './invitados-field';

export interface ProyectoFiltro {
  idProyecto: number;
  tituloProyecto: string;
}

export interface CalendarioCompartidoFiltro extends UsuarioCalendarioDTO {
  tono: TonoCalendario;
}

export interface MetaHoras {
  etiqueta: string;
  actual: number;
  requeridas: number;
}

/**
 * HU-184 (T-324): columna izquierda del calendario (maqueta del equipo):
 * mini calendario para navegar, meta de horas, "Mis proyectos" con checks
 * para filtrar y, estilo Teams, los calendarios que otras personas me
 * compartieron: cada uno con su color y un check para superponerlo al mío.
 */
export function CalendarSidebar({
  mini,
  metaHoras,
  proyectos,
  proyectosOcultos,
  onToggleProyecto,
  compartidos,
  compartidosActivos,
  onToggleCompartido,
  onQuitarCompartido,
  quitandoCompartido = null,
  compartidosEstado = 'listo',
  onReintentarCompartidos,
  estadoAgendas,
  miniRedundanteEnMovil = false,
}: {
  mini: {
    year: number;
    month: number;
    todayKey: string;
    selectedKey?: string;
    markedDates: Set<string>;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onSelectDay: (key: string) => void;
  };
  metaHoras: MetaHoras | null;
  proyectos: ProyectoFiltro[];
  proyectosOcultos: Set<number>;
  onToggleProyecto: (idProyecto: number) => void;
  compartidos: CalendarioCompartidoFiltro[];
  compartidosActivos: Set<number>;
  onToggleCompartido: (idUsuario: number) => void;
  /** G01 (UI-31): quitarme definitivamente el calendario de esa persona (distinto del check, que solo lo oculta). */
  onQuitarCompartido: (idUsuario: number) => void;
  /** idUsuario cuya revocación está en curso (deshabilita su botón). */
  quitandoCompartido?: number | null;
  /** G03 (UI-12/UI-39): la lista de calendarios compartidos puede estar cargando o haber fallado (≠ vacía). */
  compartidosEstado?: 'cargando' | 'error' | 'listo';
  onReintentarCompartidos?: () => void;
  /** G03 (UI-12): estado de la agenda de cada persona activada (carga, fallo o revocación, con reintento). */
  estadoAgendas?: Map<number, Pick<EstadoAgendaCompartida, 'isLoading' | 'isError' | 'revocada' | 'refetch'>>;
  /** G04 (UI-41): en la vista Mes la rejilla grande ya es el mes; bajo `lg` el mini se oculta para no verlo dos veces. */
  miniRedundanteEnMovil?: boolean;
}) {
  const progreso = metaHoras ? Math.min(100, Math.round((metaHoras.actual / metaHoras.requeridas) * 100)) : 0;

  return (
    <aside aria-label="Opciones del calendario">
      {/* G04 (UI-42): bajo `lg` la columna va debajo del calendario (design system) y se puede
          plegar con este control; empieza abierta para que nada quede oculto por defecto. Desde
          `lg` el control no existe y el contenido se ve siempre, aunque se hubiera plegado antes. */}
      <Collapsible defaultOpen className="space-y-gap">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="group h-10 w-full justify-between rounded-control border-outline-variant text-sm font-bold lg:hidden"
          >
            <span className="inline-flex items-center gap-tight">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filtros y calendarios
            </span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount className="space-y-gap data-[state=closed]:hidden lg:data-[state=closed]:block">
          <div className={`card-base ${miniRedundanteEnMovil ? 'hidden lg:block' : ''}`}>
            <MiniCalendar
              year={mini.year}
              month={mini.month}
              todayKey={mini.todayKey}
              todayTone="primary"
              selectedKey={mini.selectedKey}
              markedDates={mini.markedDates}
              onPrevMonth={mini.onPrevMonth}
              onNextMonth={mini.onNextMonth}
              onSelectDay={mini.onSelectDay}
            />
          </div>

          {metaHoras && (
            <div className="card-base">
              <div className="mb-stack flex items-center gap-tight">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-container text-text-secondary">
                  <Target className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="type-subtitle text-text-primary">Meta de horas</h3>
                  <p className="type-meta">{metaHoras.etiqueta}</p>
                </div>
                <span className="type-section ml-auto text-text-primary">{progreso}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-container-high">
                <div className="h-full rounded-pill bg-accent" style={{ width: `${progreso}%` }} />
              </div>
              <p className="type-meta mt-tight">
                {metaHoras.actual} de {metaHoras.requeridas} hrs
              </p>
            </div>
          )}

          <div className="card-base">
            <h3 className="type-subtitle mb-stack text-text-primary">Mis proyectos</h3>
            {proyectos.length === 0 ? (
              <p className="type-meta">Sin proyectos con actividad en este rango.</p>
            ) : (
              <ul className="space-y-tight">
                {proyectos.map((p) => {
                  const id = `filtro-proyecto-${p.idProyecto}`;
                  return (
                    <li key={p.idProyecto} className="flex items-center gap-tight">
                      <label htmlFor={id} className="type-body min-w-0 flex-1 truncate text-text-primary">
                        {p.tituloProyecto}
                      </label>
                      <Checkbox
                        id={id}
                        checked={!proyectosOcultos.has(p.idProyecto)}
                        onCheckedChange={() => onToggleProyecto(p.idProyecto)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card-base">
            <h3 className="type-subtitle mb-micro flex items-center gap-tight text-text-primary">
              <Users className="size-4 text-text-secondary" aria-hidden="true" />
              Calendarios compartidos conmigo
            </h3>
            {/* G04 (UI-34): la identidad de lo compartido es el borde discontinuo y el nombre, no solo el color. */}
        <p className="type-meta mb-stack">
          Actívalos para verlos junto al tuyo. Sus actividades llevan borde discontinuo y el nombre de la persona.
        </p>
            {compartidosEstado === 'cargando' ? (
              <p role="status" className="type-meta flex items-center gap-tight">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Cargando calendarios compartidos...
              </p>
            ) : compartidosEstado === 'error' ? (
              <div role="alert" className="space-y-tight">
                <p className="type-meta flex items-center gap-tight text-status-error">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  No se pudieron cargar los calendarios compartidos.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={onReintentarCompartidos} className="h-8 rounded-pill text-xs font-bold">
                  Reintentar
                </Button>
              </div>
            ) : compartidos.length === 0 ? (
              <p className="type-meta">Nadie te ha compartido su calendario todavía.</p>
            ) : (
              <ul className="space-y-tight">
                {compartidos.map((persona) => {
                  const id = `calendario-compartido-${persona.idUsuario}`;
                  const nombre = `${persona.nombre} ${persona.apellido}`;
                  const estado = compartidosActivos.has(persona.idUsuario) ? estadoAgendas?.get(persona.idUsuario) : undefined;
                  return (
                    <li key={persona.idUsuario}>
                    <div className="flex items-center gap-tight">
                      <Avatar className={`size-7 border-2 border-dashed ${TONO_CLASES[persona.tono].contorno}`}>
                        {persona.fotoUrl && <AvatarImage src={persona.fotoUrl} alt="" />}
                        <AvatarFallback className={`type-micro font-bold ${TONO_CLASES[persona.tono].bloque}`}>
                          {iniciales(persona.nombre, persona.apellido)}
                        </AvatarFallback>
                      </Avatar>
                      <label htmlFor={id} className="type-body min-w-0 flex-1 truncate text-text-primary">
                        {nombre}
                      </label>
                      <Checkbox
                        id={id}
                        aria-label={`Ver el calendario de ${nombre}`}
                        checked={compartidosActivos.has(persona.idUsuario)}
                        onCheckedChange={() => onToggleCompartido(persona.idUsuario)}
                      />
                      {estado?.isLoading && (
                        <Loader2 role="status" aria-label={`Cargando el calendario de ${nombre}`} className="size-3.5 shrink-0 animate-spin text-text-secondary" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar el calendario de ${nombre}`}
                        disabled={quitandoCompartido === persona.idUsuario}
                        onClick={() => onQuitarCompartido(persona.idUsuario)}
                        className="size-7 shrink-0 text-text-secondary hover:text-status-error"
                      >
                        {quitandoCompartido === persona.idUsuario ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <UserMinus className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    {estado?.isError && (
                      <div role="alert" className="mt-1 flex flex-wrap items-center gap-tight pl-9">
                        <span className="type-meta text-status-error">
                          {estado.revocada ? `${persona.nombre} ya no comparte su calendario contigo.` : 'No se pudo cargar este calendario.'}
                        </span>
                        {!estado.revocada && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={estado.refetch}
                            aria-label={`Reintentar el calendario de ${nombre}`}
                            className="h-6 px-2 text-xs font-bold"
                          >
                            Reintentar
                          </Button>
                        )}
                      </div>
                    )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/dashboard/mis-tareas"
            className="inline-flex min-h-6 items-center gap-tight text-sm font-medium text-primary hover:underline"
          >
            <ClipboardList className="size-4" aria-hidden="true" />
            Ver todas mis tareas
          </Link>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
