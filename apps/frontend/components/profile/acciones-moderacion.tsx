'use client';

import { BellOff, Flag, MoreHorizontal, ShieldBan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAccionesRestriccion, useRestricciones } from '@/hooks/use-perfil-portafolio';
import { confirmar } from '@/lib/mensajes';
import { ReportarDialog } from '@/components/profile/reportar-dialog';

/** MEJ-153/154: menú del perfil ajeno para bloquear, silenciar o reportar. Bloquear pide confirmación porque deshace la amistad. */
export function AccionesModeracion({ idUsuario, nombre }: { idUsuario: number; nombre: string }) {
  const { data } = useRestricciones();
  const { aplicar, quitar } = useAccionesRestriccion();
  const bloqueado = data?.bloqueados.some((p) => p.idUsuario === idUsuario) ?? false;
  const silenciado = data?.silenciados.some((p) => p.idUsuario === idUsuario) ?? false;

  const alternar = async (tipo: 'bloqueo' | 'silencio', activo: boolean) => {
    if (!activo && tipo === 'bloqueo') {
      const ok = await confirmar({
        titulo: `¿Bloquear a ${nombre}?`,
        descripcion: 'Dejarán de ser amigos y no podrán escribirse, enviarse solicitudes ni invitarse. Puedes desbloquear desde Configuración.',
        textoAccion: 'Bloquear',
        destructiva: true,
      });
      if (!ok) return;
    }
    (activo ? quitar : aplicar).mutate({ tipo, idObjetivo: idUsuario });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={`Más acciones sobre ${nombre}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => alternar('silencio', silenciado)}>
          <BellOff aria-hidden="true" />
          {silenciado ? 'Dejar de silenciar' : 'Silenciar notificaciones'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => alternar('bloqueo', bloqueado)}>
          <ShieldBan aria-hidden="true" />
          {bloqueado ? 'Desbloquear' : 'Bloquear'}
        </DropdownMenuItem>
        <ReportarDialog
          idReportado={idUsuario}
          nombre={nombre}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Flag aria-hidden="true" />
              Reportar perfil
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
