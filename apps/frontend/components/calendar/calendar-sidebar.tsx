'use client';

import Link from 'next/link';
import { ClipboardList, Target, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { TONO_CLASES, type TonoCalendario } from '@/lib/calendar/paleta';
import type { UsuarioCalendarioDTO } from '@/lib/services/calendar-shares';
import { iniciales } from './invitados-field';

export interface ProyectoFiltro {
  idProyecto: number;
  tituloProyecto: string;
  tono: TonoCalendario;
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
}) {
  const progreso = metaHoras ? Math.min(100, Math.round((metaHoras.actual / metaHoras.requeridas) * 100)) : 0;

  return (
    <aside className="space-y-gap" aria-label="Opciones del calendario">
      <div className="card-base">
        <MiniCalendar
          year={mini.year}
          month={mini.month}
          todayKey={mini.todayKey}
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
                  <span className={`size-2.5 shrink-0 rounded-pill ${TONO_CLASES[p.tono].punto}`} aria-hidden="true" />
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
        <p className="type-meta mb-stack">Actívalos para verlos junto al tuyo.</p>
        {compartidos.length === 0 ? (
          <p className="type-meta">Nadie te ha compartido su calendario todavía.</p>
        ) : (
          <ul className="space-y-tight">
            {compartidos.map((persona) => {
              const id = `calendario-compartido-${persona.idUsuario}`;
              const nombre = `${persona.nombre} ${persona.apellido}`;
              return (
                <li key={persona.idUsuario} className="flex items-center gap-tight">
                  <Avatar className={`size-7 ring-2 ring-offset-1 ring-offset-card ${TONO_CLASES[persona.tono].anillo}`}>
                    {persona.fotoUrl && <AvatarImage src={persona.fotoUrl} alt="" />}
                    <AvatarFallback className={`text-[10px] font-bold ${TONO_CLASES[persona.tono].bloque}`}>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Link
        href="/dashboard/mis-tareas"
        className="inline-flex items-center gap-tight text-sm font-medium text-primary hover:underline"
      >
        <ClipboardList className="size-4" aria-hidden="true" />
        Ver todas mis tareas
      </Link>
    </aside>
  );
}
