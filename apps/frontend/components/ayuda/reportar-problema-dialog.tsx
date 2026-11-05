'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage, getApiErrorStatus } from '@/components/projects/api-error';
import { useEnviarReporte } from '@/hooks/use-ayuda';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { aviso } from '@/lib/mensajes';

export const MAX_DESCRIPCION = 2000;
const MAX_CONTEXTO = 300;

/** MEJ-90: reporte de un problema con la pantalla actual, el navegador y una captura opcional. */
export function ReportarProblemaDialog({ onClose }: { onClose: () => void }) {
  const [descripcion, setDescripcion] = useState('');
  const [captura, setCaptura] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const enviar = useEnviarReporte();
  const ocupado = subiendo || enviar.isPending;
  const valida = descripcion.trim().length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valida || ocupado) return;
    let urlCaptura: string | undefined;
    if (captura) {
      setSubiendo(true);
      try {
        urlCaptura = (await uploadToCloudinary(captura, 'reportes-problema')).url;
      } catch {
        aviso.error('No se pudo subir la captura', 'Puedes quitarla y enviar el reporte sin ella.');
        return;
      } finally {
        setSubiendo(false);
      }
    }
    enviar.mutate(
      {
        ruta: (window.location.pathname + window.location.search).slice(0, MAX_CONTEXTO),
        userAgent: navigator.userAgent.slice(0, MAX_CONTEXTO),
        descripcion: descripcion.trim(),
        urlCaptura,
      },
      {
        onSuccess: () => {
          aviso.exito('Reporte enviado', 'La administración lo revisará.');
          onClose();
        },
        onError: (error) =>
          aviso.error(
            'No se pudo enviar el reporte',
            getApiErrorStatus(error) === 429
              ? 'Enviaste varios reportes seguidos. Espera un minuto antes de volver a intentarlo.'
              : getApiErrorMessage(error, 'general'),
          ),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !ocupado && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-stack">
          <DialogHeader>
            <DialogTitle>Reportar un problema</DialogTitle>
            <DialogDescription>
              Cuéntanos qué pasó. Enviamos también la pantalla en la que estás y tu navegador para ayudar a encontrar el error.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-tight">
            <label htmlFor="reporte-descripcion" className="type-body font-medium text-text-primary">
              Descripción
            </label>
            <Textarea
              id="reporte-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={MAX_DESCRIPCION}
              rows={5}
              required
              placeholder="¿Qué intentabas hacer y qué ocurrió?"
            />
            <p className="type-meta">
              {descripcion.length} de {MAX_DESCRIPCION} caracteres
            </p>
          </div>
          <div className="space-y-tight">
            <label htmlFor="reporte-captura" className="type-body font-medium text-text-primary">
              Captura de pantalla (opcional)
            </label>
            <Input
              id="reporte-captura"
              type="file"
              accept="image/*"
              onChange={(e) => setCaptura(e.target.files?.[0] ?? null)}
              className="h-auto py-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valida || ocupado}>
              {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Enviar reporte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
