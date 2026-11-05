'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useReportarPerfil } from '@/hooks/use-perfil-portafolio';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { aviso } from '@/lib/mensajes';
import { MOTIVOS_REPORTE, type MotivoReportePerfil } from '@/lib/services/perfil-portafolio';

const MAX_DETALLE = 500;

/**
 * MEJ-154: reportar un perfil o, con `idMensaje`, un mensaje del chat. Llega a la bandeja de administración;
 * quien reporta no ve el resultado ni se avisa a la persona reportada.
 */
export function ReportarDialog({
  idReportado,
  nombre,
  idMensaje,
  trigger,
}: {
  idReportado: number;
  nombre: string;
  idMensaje?: number;
  trigger: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoReportePerfil | ''>('');
  const [detalle, setDetalle] = useState('');
  const reportar = useReportarPerfil();
  const esMensaje = idMensaje !== undefined;

  const cerrar = (valor: boolean) => {
    setAbierto(valor);
    if (!valor) {
      setMotivo('');
      setDetalle('');
    }
  };

  const enviar = () => {
    if (!motivo) return;
    reportar.mutate(
      { idReportado, idMensaje, motivo, detalle: detalle.trim() || undefined },
      {
        onSuccess: () => {
          aviso.exito('Reporte enviado', 'Administración lo revisará.');
          cerrar(false);
        },
        onError: (error) => aviso.error('No se pudo enviar el reporte', getApiErrorMessage(error, 'general')),
      },
    );
  };

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esMensaje ? 'Reportar mensaje' : `Reportar a ${nombre}`}</DialogTitle>
          <DialogDescription>
            {esMensaje ? `Reportas un mensaje de ${nombre}.` : 'Cuéntanos qué pasa con este perfil.'} Solo lo verá administración.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-stack">
          <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoReportePerfil)}>
            <SelectTrigger aria-label="Motivo del reporte">
              <SelectValue placeholder="Elige un motivo" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_REPORTE.map((m) => (
                <SelectItem key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <Textarea
              aria-label="Detalle (opcional)"
              placeholder="Detalle (opcional)"
              maxLength={MAX_DETALLE}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
            <p className="type-meta mt-micro text-right">
              {detalle.length}/{MAX_DETALLE}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!motivo || reportar.isPending} onClick={enviar}>
            Enviar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
