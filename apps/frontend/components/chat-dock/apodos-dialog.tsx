'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSetApodo } from '@/hooks/use-chat';
import { nombreReal } from '@/lib/chat-apodos';
import type { ChatUsuario } from '@/lib/types/chat';

interface ApodosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idConversacion: number;
  participantes: ChatUsuario[];
}

export function ApodosDialog({ open, onOpenChange, idProyecto, idConversacion, participantes }: ApodosDialogProps) {
  const guardar = useSetApodo(idProyecto, idConversacion);
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(participantes.map((p) => [p.idUsuario, p.apodo ?? ''])),
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cambios = participantes.filter((p) => (valores[p.idUsuario] ?? '').trim() !== (p.apodo ?? ''));
    try {
      for (const p of cambios) {
        await guardar.mutateAsync({ idObjetivo: p.idUsuario, apodo: (valores[p.idUsuario] ?? '').trim() || null });
      }
      toast.success('Apodos guardados');
      onOpenChange(false);
    } catch {
      toast.error('No se pudieron guardar los apodos');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[420px] gap-0 border-outline-variant bg-surface-container-lowest p-0">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b border-outline-variant/35 px-6 pb-4 pt-5 text-left">
            <DialogTitle className="text-xl font-bold text-on-surface">Apodos</DialogTitle>
            <DialogDescription className="text-sm text-on-surface-variant">
              Solo tú ves estos apodos en esta conversación. Deja el campo vacío para quitarlo.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[50vh] space-y-4 overflow-y-auto px-6 py-5">
            {participantes.map((p) => (
              <li key={p.idUsuario}>
                <label htmlFor={`apodo-${p.idUsuario}`} className="text-xs font-semibold text-on-surface">
                  {nombreReal(p)}
                </label>
                <Input
                  id={`apodo-${p.idUsuario}`}
                  value={valores[p.idUsuario] ?? ''}
                  maxLength={40}
                  onChange={(event) => setValores((v) => ({ ...v, [p.idUsuario]: event.target.value }))}
                  placeholder="Sin apodo"
                  className="mt-1 h-10 rounded-md border-outline-variant text-sm"
                />
              </li>
            ))}
          </ul>

          <DialogFooter className="gap-2 border-t border-outline-variant/35 px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" disabled={guardar.isPending} onClick={() => onOpenChange(false)} className="h-10 rounded-md border-outline-variant text-xs font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending} className="h-10 gap-1.5 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
              {guardar.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
