'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ListTree, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { COLUMNAS_TABLERO, ESTADO_LABEL, ESTADO_TAREA_TONE, responsablesDe } from '@/components/projects/task-board.utils';
import { hoyGuatemalaISO } from '@/components/projects/task-form.schema';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import type { MiembroProyecto } from '@/hooks/use-project-members';
import { inputSubtarea } from '@/lib/tasks/extras';
import { aviso } from '@/lib/mensajes';
import type { EstadoTarea, TareaPublicaDTO } from '@/lib/types/tasks';

const SIN_RESPONSABLE = 'sin-responsable';

interface Props {
  idProyecto: number;
  tarea: TareaPublicaDTO;
  subtareas: TareaPublicaDTO[];
  members: MiembroProyecto[];
  isLeader: boolean;
  idUsuarioActual: number | null;
  /** Quien puede crear tareas en el proyecto (el servidor lo vuelve a validar). */
  puedeAgregar: boolean;
}

/**
 * MEJ-106: subtareas de la tarea. Cada una es una tarea con su propio responsable, estado y
 * horas (se abre en su propio detalle); no se mezcla con el checklist. Una subtarea no tiene hijas.
 */
export function TaskSubtareas({ idProyecto, tarea, subtareas, members, isLeader, idUsuarioActual, puedeAgregar }: Props) {
  const { crearTarea, cambiarEstadoTarea } = useProjectTasks(idProyecto);
  const [titulo, setTitulo] = useState('');
  const [responsable, setResponsable] = useState(SIN_RESPONSABLE);
  const [estado, setEstado] = useState<EstadoTarea>('POR_HACER');
  const [ocupado, setOcupado] = useState(false);

  const hechas = subtareas.filter((s) => s.estadoTarea === 'HECHO').length;
  const porcentaje = subtareas.length === 0 ? 0 : Math.round((hechas / subtareas.length) * 100);
  const puedeCrearHijas = puedeAgregar && (tarea.idTareaPadre ?? null) === null;

  // Quien puede ser responsable: integrantes del rol de la tarea (todos si no tiene rol), una vez cada uno.
  const candidatos = [
    ...new Map(
      members
        .filter((m) => tarea.idRolProyecto === null || m.idRolProyecto === tarea.idRolProyecto)
        .map((m) => [m.idUsuario, m] as const),
    ).values(),
  ];

  const onError = (titulo: string) => (err: unknown) => aviso.error(titulo, getApiErrorMessage(err, 'task'));

  const agregar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!titulo.trim() || ocupado) return;
    setOcupado(true);
    try {
      const creada = await crearTarea.mutateAsync(
        inputSubtarea(tarea, titulo, responsable === SIN_RESPONSABLE ? null : Number(responsable), hoyGuatemalaISO(new Date())),
      );
      if (estado !== 'POR_HACER') {
        await cambiarEstadoTarea.mutateAsync({ taskId: creada.idTarea, input: { estadoTarea: estado } });
      }
      setTitulo('');
      setResponsable(SIN_RESPONSABLE);
      setEstado('POR_HACER');
    } catch (err) {
      onError('No se pudo agregar la subtarea')(err);
    } finally {
      setOcupado(false);
    }
  };

  const marcar = (sub: TareaPublicaDTO, hecha: boolean) =>
    cambiarEstadoTarea.mutate(
      { taskId: sub.idTarea, input: { estadoTarea: hecha ? 'HECHO' : 'POR_HACER' } },
      { onError: onError('No se pudo actualizar la subtarea') },
    );

  const puedeMarcar = (sub: TareaPublicaDTO) =>
    isLeader || (idUsuarioActual !== null && sub.asignacionActiva?.idUsuario === idUsuarioActual);

  if (subtareas.length === 0 && !puedeCrearHijas) return null;

  return (
    <section
      className="rounded-[11px] border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm"
      aria-labelledby="subtareas-titulo"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="subtareas-titulo" className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <ListTree className="size-4 text-tertiary" aria-hidden="true" />
          Subtareas
        </h2>
        {subtareas.length > 0 && (
          <span className="text-xs font-semibold text-tertiary" aria-label={`${hechas} de ${subtareas.length} subtareas hechas`}>
            {hechas}/{subtareas.length}
          </span>
        )}
      </div>

      {subtareas.length > 0 && (
        <Progress value={porcentaje} aria-label={`Avance de subtareas: ${porcentaje}%`} className="mb-3 h-1.5" />
      )}

      {subtareas.length === 0 ? (
        <p className="text-sm italic text-tertiary">
          Esta tarea aún no tiene subtareas. Agrega la primera para repartir el trabajo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {subtareas.map((sub) => {
            const responsables = responsablesDe(sub);
            return (
              <li key={sub.idTarea} className="flex items-start gap-2.5">
                <Checkbox
                  id={`subtarea-${sub.idTarea}`}
                  checked={sub.estadoTarea === 'HECHO'}
                  disabled={!puedeMarcar(sub) || cambiarEstadoTarea.isPending}
                  onCheckedChange={(valor) => marcar(sub, valor === true)}
                  aria-label={`Marcar «${sub.tituloTarea}» como hecha`}
                  className="mt-0.5"
                />
                <Link
                  href={`/dashboard/projects/${idProyecto}/kanban/tasks/${sub.idTarea}`}
                  className={`min-w-0 flex-1 wrap-break-word text-sm font-medium hover:text-primary hover:underline ${
                    sub.estadoTarea === 'HECHO' ? 'text-tertiary line-through' : 'text-on-surface'
                  }`}
                >
                  {sub.tituloTarea}
                </Link>
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {responsables.length > 0 && (
                    <span className="max-w-32 truncate text-xs text-tertiary">
                      {responsables[0].nombre} {responsables[0].apellido}
                      {responsables.length > 1 ? ` +${responsables.length - 1}` : ''}
                    </span>
                  )}
                  <Tag tone={ESTADO_TAREA_TONE[sub.estadoTarea]} size="sm">
                    {ESTADO_LABEL[sub.estadoTarea]}
                  </Tag>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {puedeCrearHijas && (
        <form onSubmit={agregar} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={150}
            placeholder="Nueva subtarea"
            aria-label={`Título de la nueva subtarea de ${tarea.tituloTarea}`}
            className="h-9"
          />
          <Select value={responsable} onValueChange={setResponsable}>
            <SelectTrigger aria-label="Responsable de la subtarea" className="h-9 w-full bg-surface-container-lowest sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_RESPONSABLE}>Sin responsable</SelectItem>
              {candidatos.map((m) => (
                <SelectItem key={m.idUsuario} value={String(m.idUsuario)}>
                  {m.nombre} {m.apellido}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTarea)}>
            <SelectTrigger aria-label="Estado de la subtarea" className="h-9 w-full bg-surface-container-lowest sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMNAS_TABLERO.map((c) => (
                <SelectItem key={c.estado} value={c.estado}>
                  {ESTADO_LABEL[c.estado]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={ocupado || titulo.trim() === ''} className="h-9 gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Agregar
          </Button>
        </form>
      )}
    </section>
  );
}
