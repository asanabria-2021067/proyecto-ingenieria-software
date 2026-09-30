'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { useCreateConversation } from '@/hooks/use-chat';
import { useChatDock } from '@/components/chat-dock/chat-dock-context';
import { useProjectMembers, type MiembroProyecto } from '@/hooks/use-project-members';
import { getMyProjects, getContributorProjects } from '@/lib/services/projects';

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fijo (sidebar de un proyecto): salta el selector de proyecto. Sin
   * especificar (dock global): el diálogo deja elegir entre los proyectos
   * donde el usuario participa. */
  idProyecto?: number;
  members?: MiembroProyecto[];
  currentUserId: number | null;
}

/** Cualquier proyecto donde el usuario puede iniciar un chat: propios (líder)
 * + donde colabora, sin duplicados y sin los ya cerrados (el backend rechaza
 * crear conversaciones nuevas ahí). Solo se usa desde el dock global — el
 * flujo desde el sidebar de un proyecto ya trae su `idProyecto` fijo. */
function useProyectosParaChatear(habilitado: boolean) {
  return useQuery({
    queryKey: ['chat-dock-proyectos-para-chatear'],
    queryFn: async () => {
      const [propios, colaborador] = await Promise.all([getMyProjects(), getContributorProjects()]);
      const vistos = new Set<number>();
      return [...propios, ...colaborador].filter((p) => {
        if (p.estadoProyecto === 'CERRADO' || vistos.has(p.idProyecto)) return false;
        vistos.add(p.idProyecto);
        return true;
      });
    },
    enabled: habilitado,
  });
}

/** Crea un chat individual o grupal y lo abre en el dock global. */
export function NewChatDialog({ open, onOpenChange, idProyecto: idProyectoFijo, members: membersFijos, currentUserId }: NewChatDialogProps) {
  const [idProyectoElegido, setIdProyectoElegido] = useState<number | null>(null);
  const [tipo, setTipo] = useState<'GRUPAL' | 'INDIVIDUAL'>('INDIVIDUAL');
  const [nombre, setNombre] = useState('');
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const idProyecto = idProyectoFijo ?? idProyectoElegido;
  const { data: proyectosParaElegir, isLoading: cargandoProyectos } = useProyectosParaChatear(open && idProyectoFijo == null);
  const { members: membersDelProyectoElegido } = useProjectMembers(idProyectoFijo == null ? (idProyectoElegido ?? 0) : 0);
  const members = idProyectoFijo != null ? (membersFijos ?? []) : membersDelProyectoElegido;

  const crear = useCreateConversation(idProyecto ?? 0);
  const { abrirChat } = useChatDock();

  const otrosMiembros = members.filter((m) => m.idUsuario !== currentUserId);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setIdProyectoElegido(null);
      setTipo('INDIVIDUAL');
      setNombre('');
      setSeleccionados([]);
      setError(null);
    }
    onOpenChange(next);
  };

  const toggleSeleccionado = (idUsuario: number) => {
    setSeleccionados((current) => {
      if (tipo === 'INDIVIDUAL') return current.includes(idUsuario) ? [] : [idUsuario];
      return current.includes(idUsuario) ? current.filter((id) => id !== idUsuario) : [...current, idUsuario];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (idProyecto == null) {
      setError('Elige un proyecto.');
      return;
    }
    if (seleccionados.length === 0) {
      setError('Selecciona al menos un integrante.');
      return;
    }
    setError(null);
    try {
      const conversacion = await crear.mutateAsync({
        tipo,
        nombre: tipo === 'GRUPAL' ? nombre.trim() || undefined : undefined,
        idsParticipantes: seleccionados,
      });
      handleOpenChange(false);
      abrirChat(idProyecto, conversacion.idConversacion);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'chat'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[96vw] max-w-[420px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Nuevo chat</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Crea una conversación individual o grupal con el equipo del proyecto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {idProyectoFijo == null && (
              <div>
                <label htmlFor="chat-proyecto" className="text-xs font-semibold text-on-surface">
                  Proyecto
                </label>
                <Select
                  value={idProyectoElegido != null ? String(idProyectoElegido) : ''}
                  onValueChange={(value) => {
                    // Cambiar de proyecto trae gente de un equipo distinto:
                    // la selección anterior no debería sobrevivir.
                    setIdProyectoElegido(Number(value));
                    setSeleccionados([]);
                  }}
                >
                  <SelectTrigger id="chat-proyecto" className="mt-1 h-10 w-full rounded-md border-outline-variant text-sm">
                    <SelectValue placeholder={cargandoProyectos ? 'Cargando proyectos…' : 'Elige un proyecto'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(proyectosParaElegir ?? []).map((p) => (
                      <SelectItem key={p.idProyecto} value={String(p.idProyecto)}>
                        {p.tituloProyecto}
                      </SelectItem>
                    ))}
                    {!cargandoProyectos && (proyectosParaElegir ?? []).length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-tertiary">No participas en ningún proyecto activo.</p>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={tipo === 'INDIVIDUAL' ? 'default' : 'outline'}
                className={tipo === 'INDIVIDUAL' ? 'text-primary-foreground hover:text-primary-foreground' : ''}
                onClick={() => {
                  setTipo('INDIVIDUAL');
                  setSeleccionados((current) => current.slice(0, 1));
                }}
              >
                Individual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tipo === 'GRUPAL' ? 'default' : 'outline'}
                className={tipo === 'GRUPAL' ? 'text-primary-foreground hover:text-primary-foreground' : ''}
                onClick={() => setTipo('GRUPAL')}
              >
                Grupal
              </Button>
            </div>

            {tipo === 'GRUPAL' && (
              <div>
                <label htmlFor="chat-nombre" className="text-xs font-semibold text-on-surface">
                  Nombre del grupo (opcional)
                </label>
                <Input
                  id="chat-nombre"
                  value={nombre}
                  maxLength={255}
                  onChange={(event) => setNombre(event.target.value)}
                  placeholder="Ej. Backend"
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-on-surface">
                {tipo === 'INDIVIDUAL' ? 'Con quién' : 'Integrantes'}
              </p>
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {idProyecto == null && (
                  <p className="text-xs text-tertiary">Elige un proyecto para ver a su equipo.</p>
                )}
                {idProyecto != null && otrosMiembros.length === 0 && (
                  <p className="text-xs text-tertiary">No hay más integrantes en este proyecto.</p>
                )}
                {otrosMiembros.map((m) => (
                  <label
                    key={m.idUsuario}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-container-high"
                  >
                    <Checkbox
                      checked={seleccionados.includes(m.idUsuario)}
                      onCheckedChange={() => toggleSeleccionado(m.idUsuario)}
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
            </div>

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
              disabled={crear.isPending}
              onClick={() => handleOpenChange(false)}
              className="h-10 rounded-md border-outline-variant text-xs font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={crear.isPending}
              className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              {crear.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              {crear.isPending ? 'Creando...' : 'Crear chat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
