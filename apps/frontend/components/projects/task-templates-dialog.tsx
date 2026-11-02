'use client';

import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { PRIORIDAD_LABEL } from '@/components/projects/task-board.utils';
import { aviso, confirmar } from '@/lib/mensajes';
import { useTaskTemplates } from '@/hooks/use-task-extras';
import type { Prioridad } from '@/lib/types/tasks';

interface Props {
  idProyecto: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Una línea por paso; ignora vacías y recorta cada una. */
export function parsearChecklist(texto: string): string[] {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** MEJ-52: gestión de plantillas de tarea del proyecto (solo líder). */
export function TaskTemplatesDialog({ idProyecto, open, onOpenChange }: Props) {
  const { plantillas, isLoading, isError, refetch, crear, eliminar } = useTaskTemplates(idProyecto, open);
  const [nombre, setNombre] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('MEDIA');
  const [horas, setHoras] = useState('');
  const [pasos, setPasos] = useState('');

  const horasNum = horas === '' ? undefined : Number(horas);
  const horasInvalidas = horasNum !== undefined && (!Number.isInteger(horasNum) || horasNum < 1 || horasNum > 1000);
  const checklist = parsearChecklist(pasos);
  const pasosInvalidos = checklist.length > 50 || checklist.some((p) => p.length > 200);
  const puedeGuardar = nombre.trim() !== '' && titulo.trim() !== '' && !horasInvalidas && !pasosInvalidos;

  const guardar = (event: React.FormEvent) => {
    event.preventDefault();
    if (!puedeGuardar) return;
    crear.mutate(
      {
        nombre: nombre.trim(),
        tituloTarea: titulo.trim(),
        prioridad,
        ...(descripcion.trim() ? { descripcionTarea: descripcion.trim() } : {}),
        ...(horasNum !== undefined ? { tiempoEstimadoHoras: horasNum } : {}),
        ...(checklist.length > 0 ? { checklist } : {}),
      },
      {
        onSuccess: () => {
          setNombre('');
          setTitulo('');
          setDescripcion('');
          setHoras('');
          setPasos('');
          setPrioridad('MEDIA');
          aviso.exito('Plantilla guardada');
        },
        onError: (err) => aviso.error('No se pudo guardar la plantilla', getApiErrorMessage(err, 'task')),
      },
    );
  };

  const quitar = async (idPlantilla: number, nombrePlantilla: string) => {
    const ok = await confirmar({
      titulo: `¿Eliminar la plantilla "${nombrePlantilla}"?`,
      descripcion: 'Las tareas ya creadas con ella no cambian.',
      textoAccion: 'Eliminar plantilla',
      destructiva: true,
    });
    if (!ok) return;
    eliminar.mutate(idPlantilla, {
      onError: (err) => aviso.error('No se pudo eliminar la plantilla', getApiErrorMessage(err, 'task')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto border-outline-variant bg-surface-container-lowest sm:max-w-160">
        <DialogHeader className="text-left">
          <DialogTitle>Plantillas de tarea</DialogTitle>
          <DialogDescription>
            Define tareas que se repiten en el proyecto. Al crear una tarea podrás empezar desde una plantilla.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <SkeletonRegion label="Cargando plantillas" className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </SkeletonRegion>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            No se pudieron cargar las plantillas.
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : plantillas.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md border border-outline-variant/40 bg-surface-container-low p-3 text-sm text-on-surface-variant">
            <FileText className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
            Aún no hay plantillas. Completa el formulario de abajo para crear la primera.
          </p>
        ) : (
          <ul className="space-y-2">
            {plantillas.map((p) => (
              <li
                key={p.idPlantilla}
                className="flex items-start gap-2 rounded-md border border-outline-variant/30 bg-surface-container-low p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">{p.nombre}</p>
                  <p className="truncate text-xs text-tertiary">{p.tituloTarea}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Tag size="sm" tone="neutral">
                      Prioridad {PRIORIDAD_LABEL[p.prioridad].toLowerCase()}
                    </Tag>
                    {p.tiempoEstimadoHoras !== null && (
                      <Tag size="sm" tone="neutral">
                        {p.tiempoEstimadoHoras} h
                      </Tag>
                    )}
                    {p.checklist.length > 0 && (
                      <Tag size="sm" tone="neutral">
                        {p.checklist.length} {p.checklist.length === 1 ? 'paso' : 'pasos'}
                      </Tag>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={eliminar.isPending}
                  onClick={() => void quitar(p.idPlantilla, p.nombre)}
                  aria-label={`Eliminar plantilla ${p.nombre}`}
                  className="text-tertiary hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={guardar} noValidate className="space-y-3 border-t border-outline-variant/40 pt-4">
          <h3 className="text-sm font-bold text-on-surface">Nueva plantilla</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plantilla-nombre">Nombre de la plantilla</Label>
              <Input id="plantilla-nombre" value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plantilla-titulo">Título de la tarea</Label>
              <Input id="plantilla-titulo" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plantilla-descripcion">Descripción (opcional)</Label>
            <Textarea
              id="plantilla-descripcion"
              value={descripcion}
              maxLength={5000}
              rows={2}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plantilla-prioridad">Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
                <SelectTrigger id="plantilla-prioridad" className="h-9 w-full bg-surface-container-lowest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ALTA', 'MEDIA', 'BAJA'] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDAD_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plantilla-horas">Horas estimadas (opcional)</Label>
              <Input
                id="plantilla-horas"
                inputMode="numeric"
                value={horas}
                aria-invalid={horasInvalidas ? true : undefined}
                onChange={(e) => setHoras(e.target.value)}
              />
              {horasInvalidas && <p className="text-xs text-destructive">Entero entre 1 y 1000.</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plantilla-pasos">Pasos del checklist (uno por línea, opcional)</Label>
            <Textarea
              id="plantilla-pasos"
              value={pasos}
              rows={3}
              aria-invalid={pasosInvalidos ? true : undefined}
              onChange={(e) => setPasos(e.target.value)}
            />
            {pasosInvalidos && <p className="text-xs text-destructive">Máximo 50 pasos de hasta 200 caracteres.</p>}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!puedeGuardar || crear.isPending}>
              {crear.isPending ? 'Guardando...' : 'Guardar plantilla'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
