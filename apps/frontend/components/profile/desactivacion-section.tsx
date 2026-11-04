'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tag, type TagTone } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { isAdminUser, useCurrentUser } from '@/hooks/use-current-user';
import { aviso } from '@/lib/mensajes';
import {
  desactivacionQueryKey,
  getDesactivacion,
  solicitarDesactivacion,
  type EstadoDesactivacion,
} from '@/lib/services/cuenta';

const MAX_MOTIVO = 500;

const ESTADO: Record<EstadoDesactivacion, { etiqueta: string; tono: TagTone }> = {
  PENDIENTE: { etiqueta: 'Pendiente', tono: 'amber' },
  APROBADA: { etiqueta: 'Aprobada', tono: 'success' },
  RECHAZADA: { etiqueta: 'Rechazada', tono: 'red' },
};

/** MEJ-85: el estudiante pide desactivar su cuenta; un administrador la resuelve. Los administradores no la ven. */
export function DesactivacionSection() {
  const { data: usuario } = useCurrentUser();
  const esAdmin = isAdminUser(usuario);
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: desactivacionQueryKey,
    queryFn: getDesactivacion,
    enabled: !!usuario && !esAdmin,
    retry: false,
  });

  const solicitar = useMutation({
    mutationFn: () => solicitarDesactivacion(motivo.trim()),
    onSuccess: () => {
      setMotivo('');
      aviso.exito('Solicitud enviada', 'La administración la revisará.');
    },
    onError: (error: Error) =>
      aviso.error('No se pudo enviar la solicitud', getApiErrorMessage(error, 'general', 'Intenta de nuevo en unos segundos.')),
    onSettled: () => {
      setConfirmando(false);
      void queryClient.invalidateQueries({ queryKey: desactivacionQueryKey });
    },
  });

  if (!usuario || esAdmin) return null;

  const solicitud = data?.solicitud ?? null;
  const pendiente = solicitud?.estado === 'PENDIENTE';

  return (
    <section aria-labelledby="desactivacion-titulo" className="card-base p-card">
      <h2 id="desactivacion-titulo" className="type-section">
        Solicitar desactivar mi cuenta
      </h2>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        Un administrador revisará tu solicitud. Si la aprueba, tu cuenta quedará inactiva y no podrás iniciar sesión. Se
        conservan las horas acreditadas y el historial de tus proyectos.
      </p>

      {solicitud && (
        <div className="mt-stack flex max-w-2xl flex-col gap-tight" aria-live="polite">
          <p className="type-body flex flex-wrap items-center gap-tight">
            Estado de tu última solicitud:
            <Tag tone={ESTADO[solicitud.estado].tono}>{ESTADO[solicitud.estado].etiqueta}</Tag>
          </p>
          {solicitud.motivo && <p className="type-meta break-words">Motivo: {solicitud.motivo}</p>}
          {solicitud.comentarioResolucion && (
            <p className="type-meta break-words">Comentario de la administración: {solicitud.comentarioResolucion}</p>
          )}
        </div>
      )}

      {isError && (
        <p role="alert" className="type-meta mt-stack text-error">
          No se pudo cargar el estado de tu solicitud.
        </p>
      )}

      {pendiente ? (
        <p className="type-meta mt-stack">Ya tienes una solicitud pendiente. Espera a que se resuelva.</p>
      ) : (
        !isLoading &&
        !isError && (
          <form
            className="mt-stack flex max-w-2xl flex-col gap-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setConfirmando(true);
            }}
          >
            <div className="flex flex-col gap-tight">
              <Label htmlFor="desactivacion-motivo">Motivo (opcional)</Label>
              <Textarea
                id="desactivacion-motivo"
                value={motivo}
                maxLength={MAX_MOTIVO}
                onChange={(e) => setMotivo(e.target.value)}
                aria-describedby="desactivacion-motivo-ayuda"
              />
              <p id="desactivacion-motivo-ayuda" className="type-meta">
                Hasta {MAX_MOTIVO} caracteres.
              </p>
            </div>
            <div>
              <Button type="submit" variant="destructive" disabled={solicitar.isPending}>
                Solicitar desactivación
              </Button>
            </div>
          </form>
        )
      )}

      {confirmando && (
        <ConfirmActionDialog
          open
          title="Solicitar desactivar tu cuenta"
          description="Si un administrador la aprueba, tu cuenta quedará inactiva y no podrás iniciar sesión. Se conservan las horas acreditadas y el historial de tus proyectos. ¿Enviar la solicitud?"
          actionLabel="Enviar solicitud"
          variant="destructive"
          isPending={solicitar.isPending}
          onConfirm={() => solicitar.mutate()}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </section>
  );
}
