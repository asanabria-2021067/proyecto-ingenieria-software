'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { useBorrarEjemplo, useCrearEjemplo, useEjemploProyecto } from '@/hooks/use-ayuda';
import { aviso, confirmar } from '@/lib/mensajes';
import { getMyProjects } from '@/lib/services/projects';

/** MEJ-89: ofrecimiento al líder tras crear su primer proyecto. */
export function OfertaEjemploDialog({ idProyecto, onClose }: { idProyecto: number; onClose: () => void }) {
  const crear = useCrearEjemplo(idProyecto);
  const empezar = () =>
    crear.mutate(undefined, {
      onSuccess: () => {
        aviso.exito('Sprint de ejemplo creado', 'Lo encuentras en el tablero y lo puedes borrar cuando quieras.');
        onClose();
      },
      onError: (error) => aviso.error('No se pudo crear el ejemplo', getApiErrorMessage(error, 'general')),
    });

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Empezar con un ejemplo?</DialogTitle>
          <DialogDescription>
            Podemos crear un sprint con unas tareas de ejemplo para que veas cómo funciona el tablero. Las puedes borrar todas de una vez.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={crear.isPending}>
            No, gracias
          </Button>
          <Button type="button" onClick={empezar} disabled={crear.isPending}>
            Empezar con ejemplo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** MEJ-89: acceso del líder para borrar el sprint y las tareas de ejemplo mientras existan. */
export function BorrarEjemploBoton({ idProyecto }: { idProyecto: number }) {
  const { data } = useEjemploProyecto(idProyecto);
  const borrar = useBorrarEjemplo(idProyecto);
  if (!data?.existe) return null;

  const onClick = async () => {
    const ok = await confirmar({
      titulo: 'Borrar contenido de ejemplo',
      descripcion: 'Se borrarán las tareas de ejemplo y su sprint si sigue activo. Tus propias tareas no se tocan.',
      textoAccion: 'Borrar ejemplo',
      destructiva: true,
    });
    if (!ok) return;
    borrar.mutate(undefined, {
      onSuccess: () => aviso.exito('Contenido de ejemplo borrado'),
      onError: (error) => aviso.error('No se pudo borrar el ejemplo', getApiErrorMessage(error, 'general')),
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={borrar.isPending} className="gap-1.5">
      <Trash2 className="size-3.5" aria-hidden="true" />
      Borrar contenido de ejemplo
    </Button>
  );
}

/** MEJ-89: se ofrece una sola vez, al líder que tiene un único proyecto, cuando este ya admite sprints y aún no tiene ninguno. */
export function OfertaEjemploPrimerProyecto({ idProyecto, idUsuario }: { idProyecto: number; idUsuario: number }) {
  const { data: mios } = useQuery({ queryKey: ['mis-proyectos'], queryFn: getMyProjects });
  const clave = `ejemplo_ofrecido_${idUsuario}`;
  const [cerrado, setCerrado] = useState(() => {
    try {
      return !!localStorage.getItem(clave);
    } catch {
      return false;
    }
  });
  if (cerrado || mios?.length !== 1) return null;
  const cerrar = () => {
    try {
      localStorage.setItem(clave, '1');
    } catch {}
    setCerrado(true);
  };
  return <OfertaEjemploDialog idProyecto={idProyecto} onClose={cerrar} />;
}
