'use client';

import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronDown, Tags, UserMinus, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { COLUMNAS_TABLERO, ESTADO_COLUMNA_STYLE, ESTADO_LABEL } from '@/components/projects/task-board.utils';
import { aviso, confirmar } from '@/lib/mensajes';
import { textoTareas } from '@/lib/tasks/selection';
import type { BulkTaskActionInput, EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';
import type { LabelDTO } from '@/lib/services/labels';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import type { useProjectTasks } from '@/hooks/use-project-tasks';

type AccionMasivaMutation = ReturnType<typeof useProjectTasks>['accionMasiva'];

export interface TaskBulkActionsBarProps {
  /** Tareas seleccionadas, ya resueltas (solo las visibles). */
  tareas: TareaPublicaDTO[];
  members: MiembroProyecto[];
  labels: LabelDTO[];
  accionMasiva: AccionMasivaMutation;
  onLimpiar: () => void;
}

interface Candidato {
  idUsuario: number;
  nombreCompleto: string;
  roles: Set<number>;
}

interface TextosAccion {
  titulo: string;
  descripcion: string;
  textoAccion: string;
  tituloExito: string;
  /** Participio para el aviso: «movidas», «asignadas»… */
  verbo: string;
}

/**
 * Integrantes activos, una sola entrada por persona con todos sus roles
 * (multirol): la lista de candidatos de «Asignar».
 */
function candidatosDesde(members: MiembroProyecto[]): Candidato[] {
  const porUsuario = new Map<number, Candidato>();
  for (const miembro of members) {
    const existente = porUsuario.get(miembro.idUsuario);
    if (existente) {
      existente.roles.add(miembro.idRolProyecto);
    } else {
      porUsuario.set(miembro.idUsuario, {
        idUsuario: miembro.idUsuario,
        nombreCompleto: `${miembro.nombre} ${miembro.apellido}`,
        roles: new Set([miembro.idRolProyecto]),
      });
    }
  }
  return [...porUsuario.values()].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
}

/** Resultado parcial: el backend no reescribe las tareas que ya estaban así. */
function descripcionResultado(total: number, actualizadas: number, verbo: string): string {
  if (actualizadas === 0) return 'Ninguna tarea cambió: todas ya estaban así.';
  if (actualizadas === total) return `${textoTareas(total)} ${verbo}.`;
  return `${actualizadas} de ${total} ${verbo}; el resto ya estaba así.`;
}

const BOTON_BARRA =
  'h-9 gap-1.5 rounded-control px-3 text-xs font-semibold text-on-bulk-bar hover:bg-on-bulk-bar/10 hover:text-on-bulk-bar dark:hover:bg-on-bulk-bar/10 focus-visible:ring-2 focus-visible:ring-on-bulk-bar/40 disabled:opacity-50';

/**
 * HU-202/T-384: barra contextual de acciones masivas. Aparece abajo al
 * centro cuando el líder selecciona tareas (Kanban o Lista): mover de
 * columna, asignar o quitar la asignación, agregar o quitar etiquetas. Cada
 * acción pide confirmación; el backend la aplica todo o nada.
 */
export function TaskBulkActionsBar({ tareas, members, labels, accionMasiva, onLimpiar }: TaskBulkActionsBarProps) {
  const [etiquetasAbiertas, setEtiquetasAbiertas] = useState(false);
  const [etiquetasElegidas, setEtiquetasElegidas] = useState<ReadonlySet<number>>(() => new Set());

  const candidatos = useMemo(() => candidatosDesde(members), [members]);
  const rolesSeleccion = useMemo(
    () => [...new Set(tareas.map((t) => t.rolProyecto?.idRolProyecto).filter((id): id is number => id !== undefined))],
    [tareas],
  );

  const cantidad = tareas.length;
  if (cantidad === 0) return null;

  const ocupada = accionMasiva.isPending;
  const hayAsignadas = tareas.some((t) => t.asignacionActiva !== null);
  const ids = tareas.map((t) => t.idTarea);

  // El backend valida al candidato contra el rol de cada tarea; aquí se
  // anticipa para no ofrecer a quien haría fallar toda la operación.
  const puedeTomarTodas = (candidato: Candidato) => rolesSeleccion.every((rol) => candidato.roles.has(rol));

  async function ejecutar(input: BulkTaskActionInput, textos: TextosAccion) {
    const confirmado = await confirmar({
      titulo: textos.titulo,
      descripcion: textos.descripcion,
      textoAccion: textos.textoAccion,
    });
    if (!confirmado) return;
    accionMasiva.mutate(input, {
      onSuccess: (resultado) => {
        aviso.exito(textos.tituloExito, descripcionResultado(cantidad, resultado.idsActualizadas.length, textos.verbo));
        setEtiquetasElegidas(new Set());
        onLimpiar();
      },
      onError: (error) => aviso.error('No se pudo completar la acción', getApiErrorMessage(error, 'task')),
    });
  }

  const mover = (estado: EstadoTarea) =>
    void ejecutar(
      { idsTareas: ids, accion: 'MOVER', estadoTarea: estado },
      {
        titulo: `¿Mover ${textoTareas(cantidad)} a «${ESTADO_LABEL[estado]}»?`,
        descripcion: 'Las tareas seleccionadas cambiarán de columna. Si alguna no puede moverse, no se moverá ninguna.',
        textoAccion: 'Mover tareas',
        tituloExito: 'Tareas movidas',
        verbo: cantidad === 1 ? 'movida' : 'movidas',
      },
    );

  const asignar = (candidato: Candidato) =>
    void ejecutar(
      { idsTareas: ids, accion: 'ASIGNAR', idUsuario: candidato.idUsuario },
      {
        titulo: `¿Asignar ${textoTareas(cantidad)} a ${candidato.nombreCompleto}?`,
        descripcion:
          'Las que tengan a otra persona se reasignarán; las horas ya registradas se conservan. Si alguna no admite a este integrante, no se asignará ninguna.',
        textoAccion: 'Asignar',
        tituloExito: 'Tareas asignadas',
        verbo: cantidad === 1 ? 'asignada' : 'asignadas',
      },
    );

  const desasignar = () =>
    void ejecutar(
      { idsTareas: ids, accion: 'DESASIGNAR' },
      {
        titulo: `¿Quitar la asignación de ${textoTareas(cantidad)}?`,
        descripcion: 'Las tareas quedarán sin asignar. Las horas ya registradas se conservan.',
        textoAccion: 'Quitar asignación',
        tituloExito: 'Asignación retirada',
        verbo: cantidad === 1 ? 'quedó sin asignar' : 'quedaron sin asignar',
      },
    );

  const cambiarEtiquetas = (modo: 'AGREGAR' | 'QUITAR') => {
    const idsEtiquetas = [...etiquetasElegidas];
    const nombres = labels
      .filter((l) => etiquetasElegidas.has(l.idEtiqueta))
      .map((l) => `«${l.nombreEtiqueta}»`)
      .join(', ');
    setEtiquetasAbiertas(false);
    void ejecutar(
      { idsTareas: ids, accion: modo === 'AGREGAR' ? 'AGREGAR_ETIQUETAS' : 'QUITAR_ETIQUETAS', idsEtiquetas },
      modo === 'AGREGAR'
        ? {
            titulo: `¿Agregar ${nombres} a ${textoTareas(cantidad)}?`,
            descripcion: 'Las etiquetas que ya tengan las tareas se conservan.',
            textoAccion: 'Agregar etiquetas',
            tituloExito: 'Etiquetas agregadas',
            verbo: cantidad === 1 ? 'actualizada' : 'actualizadas',
          }
        : {
            titulo: `¿Quitar ${nombres} de ${textoTareas(cantidad)}?`,
            descripcion: 'Solo se quitan las etiquetas elegidas; las demás se conservan.',
            textoAccion: 'Quitar etiquetas',
            tituloExito: 'Etiquetas quitadas',
            verbo: cantidad === 1 ? 'actualizada' : 'actualizadas',
          },
    );
  };

  const alternarEtiqueta = (idEtiqueta: number) =>
    setEtiquetasElegidas((previas) => {
      const siguientes = new Set(previas);
      if (siguientes.has(idEtiqueta)) siguientes.delete(idEtiqueta);
      else siguientes.add(idEtiqueta);
      return siguientes;
    });

  return (
    // Sobre la barra de navegación móvil (h-16) y, en escritorio, a 24 px del borde.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
      <div
        role="toolbar"
        aria-label="Acciones masivas"
        data-slot="task-bulk-actions-bar"
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-card border border-bulk-bar-border bg-bulk-bar p-1.5 text-on-bulk-bar shadow-raised motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
      >
        <span className="flex shrink-0 items-center gap-2 py-1 pr-2 pl-2.5 text-xs font-semibold" aria-live="polite">
          {ocupada ? (
            <Spinner className="size-4" aria-label="Aplicando la acción" />
          ) : (
            <span className="pill pill-sm min-w-6 justify-center bg-bulk-bar-accent font-bold tabular-nums text-on-bulk-bar-accent">
              {cantidad}
            </span>
          )}
          <span>{cantidad === 1 ? 'seleccionada' : 'seleccionadas'}</span>
        </span>

        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-on-bulk-bar/20" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={ocupada} className={BOTON_BARRA}>
              <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              {/* En móvil la barra queda solo con iconos; el texto sigue para el lector. */}
              <span className="max-sm:sr-only">Mover a</span>
              <ChevronDown className="size-3 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-48">
            <DropdownMenuLabel className="text-xs text-text-secondary">Mover a la columna</DropdownMenuLabel>
            {COLUMNAS_TABLERO.map((columna) => (
              <DropdownMenuItem key={columna.estado} onSelect={() => mover(columna.estado)}>
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${ESTADO_COLUMNA_STYLE[columna.estado].columnDot}`}
                />
                {columna.titulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={ocupada} className={BOTON_BARRA}>
              <UserPlus className="size-3.5" aria-hidden="true" />
              <span className="max-sm:sr-only">Asignar</span>
              <ChevronDown className="size-3 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="max-h-72 w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-text-secondary">Asignar a</DropdownMenuLabel>
            {candidatos.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-text-secondary">No hay integrantes activos en el proyecto.</p>
            )}
            {candidatos.map((candidato) => {
              const compatible = puedeTomarTodas(candidato);
              return (
                <DropdownMenuItem
                  key={candidato.idUsuario}
                  disabled={!compatible}
                  onSelect={() => asignar(candidato)}
                  className="flex-col items-start gap-0"
                >
                  <span className="truncate">{candidato.nombreCompleto}</span>
                  {!compatible && (
                    <span className="text-[11px] text-text-secondary">No participa en el rol de todas las tareas</span>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!hayAsignadas} onSelect={desasignar}>
              <UserMinus aria-hidden="true" />
              Quitar asignación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={etiquetasAbiertas} onOpenChange={setEtiquetasAbiertas}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={ocupada} className={BOTON_BARRA}>
              <Tags className="size-3.5" aria-hidden="true" />
              <span className="max-sm:sr-only">Etiquetas</span>
              <ChevronDown className="size-3 opacity-70" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" side="top" className="w-72 p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Elige las etiquetas</p>
            {labels.length === 0 ? (
              <p className="py-2 text-xs text-text-secondary">Este proyecto aún no tiene etiquetas.</p>
            ) : (
              <ul className="max-h-56 space-y-0.5 overflow-y-auto" aria-label="Etiquetas del proyecto">
                {labels.map((etiqueta) => {
                  const idCasilla = `etiqueta-masiva-${etiqueta.idEtiqueta}`;
                  return (
                    <li key={etiqueta.idEtiqueta}>
                      <label
                        htmlFor={idCasilla}
                        className="flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-sm hover:bg-surface-container-high"
                      >
                        <Checkbox
                          id={idCasilla}
                          checked={etiquetasElegidas.has(etiqueta.idEtiqueta)}
                          onCheckedChange={() => alternarEtiqueta(etiqueta.idEtiqueta)}
                        />
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full border border-outline-variant/40"
                          style={{ backgroundColor: etiqueta.color }}
                        />
                        <span className="truncate">{etiqueta.nombreEtiqueta}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex gap-2 border-t border-outline-variant/40 pt-3">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={etiquetasElegidas.size === 0}
                onClick={() => cambiarEtiquetas('AGREGAR')}
              >
                Agregar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={etiquetasElegidas.size === 0}
                onClick={() => cambiarEtiquetas('QUITAR')}
              >
                Quitar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-on-bulk-bar/20" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onLimpiar}
          disabled={ocupada}
          aria-label="Limpiar selección"
          className={`${BOTON_BARRA} px-2.5`}
        >
          <X className="size-3.5" aria-hidden="true" />
          <Kbd className="hidden bg-on-bulk-bar/15 text-on-bulk-bar md:inline-flex">Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}
