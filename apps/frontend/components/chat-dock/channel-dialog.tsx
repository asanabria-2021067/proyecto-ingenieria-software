'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hash, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getIniciales } from '@/components/projects/available-project-card';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useCreateChannel, useUpdateChannelMembers } from '@/hooks/use-chat';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { getMyProjects } from '@/lib/services/projects';
import type { ChatConversacionGlobal } from '@/lib/types/chat';

interface ChannelDialogProps {
  onOpenChange: (open: boolean) => void;
  currentUserId: number | null;
  /** Con canal: gestiona sus miembros. Sin canal: crea uno nuevo (el líder elige proyecto). */
  canal?: ChatConversacionGlobal;
}

const NOMBRE_VALIDO = /^[\p{L}\p{N}_-]{2,40}$/u;

/** Proyectos que el usuario lidera y siguen abiertos (el backend solo deja administrar canales al líder). */
export function useProyectosQueLidero(habilitado: boolean) {
  return useQuery({
    queryKey: ['chat-dock-proyectos-que-lidero'],
    queryFn: async () => (await getMyProjects()).filter((p) => p.estadoProyecto !== 'CERRADO'),
    enabled: habilitado,
  });
}

/** El líder crea un canal o gestiona los miembros de uno existente; los candidatos son los integrantes activos del proyecto. */
export function ChannelDialog({ onOpenChange, currentUserId, canal }: ChannelDialogProps) {
  const gestionando = canal != null;
  const esGeneral = canal?.nombre === 'general';
  const [idProyectoElegido, setIdProyectoElegido] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [seleccionados, setSeleccionados] = useState<number[]>(
    () => canal?.participantes.map((p) => p.idUsuario) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const idProyecto = canal?.idProyecto ?? idProyectoElegido;
  const { data: proyectos, isLoading: cargandoProyectos } = useProyectosQueLidero(!gestionando);
  const { members, isLoading: cargandoMiembros } = useProjectMembers(idProyecto ?? 0);
  const candidatos = useMemo(() => {
    const vistos = new Set<number>();
    return members.filter((m) => {
      if (m.idUsuario === currentUserId || vistos.has(m.idUsuario)) return false;
      vistos.add(m.idUsuario);
      return true;
    });
  }, [members, currentUserId]);

  const crear = useCreateChannel(idProyecto ?? 0);
  const actualizar = useUpdateChannelMembers(idProyecto ?? 0, canal?.idConversacion ?? 0);
  const { abrirChat } = useChatDock();
  const pendiente = crear.isPending || actualizar.isPending;

  const toggle = (idUsuario: number) =>
    setSeleccionados((actual) =>
      actual.includes(idUsuario) ? actual.filter((id) => id !== idUsuario) : [...actual, idUsuario],
    );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (canal) {
        const actuales = canal.participantes.map((p) => p.idUsuario);
        await actualizar.mutateAsync({
          agregar: seleccionados.filter((id) => !actuales.includes(id)),
          quitar: actuales.filter((id) => id !== currentUserId && !seleccionados.includes(id)),
        });
        onOpenChange(false);
        return;
      }
      if (idProyecto == null) {
        setError('Elige un proyecto.');
        return;
      }
      const limpio = nombre.trim().replace(/^#/, '').toLowerCase();
      if (!NOMBRE_VALIDO.test(limpio)) {
        setError('El nombre debe tener entre 2 y 40 caracteres: letras, números, guion o guion bajo.');
        return;
      }
      const creado = await crear.mutateAsync({ nombre: limpio, idsMiembros: seleccionados });
      onOpenChange(false);
      abrirChat(idProyecto, creado.idConversacion);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'chat'));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[420px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="flex items-center gap-1.5 text-xl font-bold text-on-surface">
              <Hash className="size-5" aria-hidden="true" />
              {gestionando ? `Miembros de #${canal.nombre}` : 'Nuevo canal'}
            </DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              {esGeneral
                ? '#general incluye a todos los integrantes del proyecto y no se puede modificar.'
                : 'Solo los integrantes que elijas verán este canal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {!gestionando && (
              <>
                <div>
                  <label htmlFor="canal-proyecto" className="text-xs font-semibold text-on-surface">
                    Proyecto
                  </label>
                  <Select
                    value={idProyectoElegido != null ? String(idProyectoElegido) : ''}
                    onValueChange={(value) => {
                      setIdProyectoElegido(Number(value));
                      setSeleccionados([]);
                    }}
                  >
                    <SelectTrigger id="canal-proyecto" className="mt-1 h-10 w-full rounded-md border-outline-variant text-sm">
                      <SelectValue placeholder={cargandoProyectos ? 'Cargando proyectos…' : 'Elige un proyecto'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(proyectos ?? []).map((p) => (
                        <SelectItem key={p.idProyecto} value={String(p.idProyecto)}>
                          {p.tituloProyecto}
                        </SelectItem>
                      ))}
                      {!cargandoProyectos && (proyectos ?? []).length === 0 && (
                        <p className="px-2 py-1.5 text-xs text-tertiary">No lideras ningún proyecto activo.</p>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="canal-nombre" className="text-xs font-semibold text-on-surface">
                    Nombre del canal
                  </label>
                  <Input
                    id="canal-nombre"
                    value={nombre}
                    maxLength={41}
                    onChange={(event) => setNombre(event.target.value)}
                    placeholder="Ej. backend"
                    className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                  />
                </div>
              </>
            )}

            <fieldset>
              <legend className="text-xs font-semibold text-on-surface">Integrantes</legend>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {idProyecto == null && <p className="text-xs text-tertiary">Elige un proyecto para ver a su equipo.</p>}
                {idProyecto != null && cargandoMiembros && <p className="text-xs text-tertiary">Cargando equipo…</p>}
                {idProyecto != null && !cargandoMiembros && candidatos.length === 0 && (
                  <p className="text-xs text-tertiary">No hay más integrantes en este proyecto.</p>
                )}
                {candidatos.map((m) => (
                  <label
                    key={m.idUsuario}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-container-high"
                  >
                    <Checkbox
                      checked={esGeneral || seleccionados.includes(m.idUsuario)}
                      disabled={esGeneral}
                      onCheckedChange={() => toggle(m.idUsuario)}
                    />
                    <Avatar className="size-6 shrink-0">
                      {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">{getIniciales(m.nombre, m.apellido)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm text-on-surface">
                      {m.nombre} {m.apellido}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="type-meta text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pendiente}
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              {esGeneral ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!esGeneral && (
              <Button
                type="submit"
                disabled={pendiente}
                className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              >
                {pendiente && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {gestionando ? 'Guardar' : 'Crear canal'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
