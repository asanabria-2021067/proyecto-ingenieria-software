'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProjectDetail } from '@/hooks/use-project-detail';
import { useProjectTasks } from '@/hooks/use-project-tasks';
import { aInputLocal } from '@/lib/chat-recordatorio';
import { contenidoAEditable } from '@/lib/mentions/mention-tokens';
import type { ChatMensaje } from '@/lib/types/chat';
import type { Prioridad } from '@/lib/types/tasks';

const TITULO_MAX = 150;
const DESCRIPCION_MAX = 5000;
const CAMPO = 'h-9 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  mensaje: ChatMensaje | null;
}

/** Texto plano del mensaje (sin tokens de mencion) para usarlo como base de la tarea. */
function textoDe(mensaje: ChatMensaje): string {
  return contenidoAEditable(mensaje.contenido).texto.trim();
}

/** Evita un `datetime-local`: la fecha limite es solo dia; minimo mañana (el backend exige fecha futura). */
function manana(): string {
  const f = new Date();
  f.setDate(f.getDate() + 1);
  return aInputLocal(f).slice(0, 10);
}

/** MEJ-7: crea una tarea del proyecto a partir de un mensaje del chat (mismo endpoint y permisos que «Nueva tarea»). */
export function CrearTareaDesdeMensajeDialog({ open, onOpenChange, idProyecto, mensaje }: Props) {
  return (
    <Dialog open={open && mensaje !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[440px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        {mensaje && <Formulario key={mensaje.idMensaje} idProyecto={idProyecto} mensaje={mensaje} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ idProyecto, mensaje, onClose }: { idProyecto: number; mensaje: ChatMensaje; onClose: () => void }) {
  const router = useRouter();
  const { data: proyecto, isLoading } = useProjectDetail(idProyecto);
  const { crearTarea } = useProjectTasks(idProyecto);
  const texto = textoDe(mensaje);
  const autor = `${mensaje.remitente.nombre} ${mensaje.remitente.apellido}`.trim();
  const [titulo, setTitulo] = useState(texto.replace(/\s+/g, ' ').slice(0, TITULO_MAX));
  const [descripcion, setDescripcion] = useState(`Mensaje de ${autor}:\n${texto}`.slice(0, DESCRIPCION_MAX));
  const [fecha, setFecha] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('MEDIA');
  const [idHito, setIdHito] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hitos = proyecto?.hitos ?? [];

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!titulo.trim()) return setError('Escribe un título para la tarea.');
    if (!fecha) return setError('Elige una fecha límite.');
    if (!idHito) return setError('Elige el hito al que pertenece la tarea.');
    setError(null);
    crearTarea.mutate(
      {
        tituloTarea: titulo.trim(),
        descripcionTarea: descripcion.trim() || undefined,
        fechaLimite: fecha,
        prioridad,
        idHito: Number(idHito),
      },
      {
        onSuccess: (tarea) => {
          onClose();
          toast.success('Tarea creada', {
            action: { label: 'Ver tarea', onClick: () => router.push(`/dashboard/projects/${idProyecto}/kanban/tasks/${tarea.idTarea}`) },
          });
        },
        onError: (e) => setError(e.message || 'No se pudo crear la tarea'),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
        <DialogTitle className="text-xl font-bold text-on-surface">Crear tarea desde este mensaje</DialogTitle>
        <DialogDescription className="text-sm text-on-surface-variant">
          La tarea se crea en el proyecto de esta conversación, en el sprint activo.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 px-6 py-4">
        <div className="space-y-1">
          <label htmlFor="tarea-msg-titulo" className="text-xs font-semibold text-on-surface">Título</label>
          <Input id="tarea-msg-titulo" value={titulo} maxLength={TITULO_MAX} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="tarea-msg-descripcion" className="text-xs font-semibold text-on-surface">Descripción</label>
          <Textarea id="tarea-msg-descripcion" value={descripcion} maxLength={DESCRIPCION_MAX} rows={4} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="tarea-msg-fecha" className="text-xs font-semibold text-on-surface">Fecha límite</label>
            <input id="tarea-msg-fecha" type="date" value={fecha} min={manana()} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
          </div>
          <div className="space-y-1">
            <label htmlFor="tarea-msg-prioridad" className="text-xs font-semibold text-on-surface">Prioridad</label>
            <select id="tarea-msg-prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)} className={CAMPO}>
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="tarea-msg-hito" className="text-xs font-semibold text-on-surface">Hito</label>
          <select id="tarea-msg-hito" value={idHito} disabled={isLoading || hitos.length === 0} onChange={(e) => setIdHito(e.target.value)} className={CAMPO}>
            <option value="">{isLoading ? 'Cargando hitos…' : hitos.length === 0 ? 'El proyecto no tiene hitos' : 'Elige un hito'}</option>
            {hitos.map((h) => (
              <option key={h.idHito} value={h.idHito}>{h.tituloHito}</option>
            ))}
          </select>
          {!isLoading && hitos.length === 0 && (
            <p className="text-xs text-tertiary">
              Las tareas necesitan un hito.{' '}
              <Link href={`/dashboard/projects/${idProyecto}/kanban?tab=hitos`} className="font-semibold text-primary hover:underline">
                Crear un hito
              </Link>
            </p>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-error">{error}</p>}
      </div>

      <DialogFooter className="border-t border-outline-variant/35 px-6 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={crearTarea.isPending} className="gap-1.5">
          {crearTarea.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Crear tarea
        </Button>
      </DialogFooter>
    </form>
  );
}
