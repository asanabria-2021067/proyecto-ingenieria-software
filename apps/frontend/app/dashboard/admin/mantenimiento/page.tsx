'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTitle } from '@/components/ui/page-title';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import {
  MENSAJE_MANTENIMIENTO,
  getAdminMantenimiento,
  putAdminMantenimiento,
  type MantenimientoAdmin,
  type MantenimientoInput,
} from '@/lib/services/admin-sistema';

const MAX_MENSAJE = 500;

/** ISO a valor de `datetime-local` en la hora del navegador. */
function aLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
const aIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

export default function AdminMantenimientoPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<MantenimientoAdmin>({
    queryKey: ['adminMantenimiento'],
    queryFn: getAdminMantenimiento,
  });
  const [activo, setActivo] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [regreso, setRegreso] = useState('');
  const [inicio, setInicio] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  // Los campos se rellenan cuando llega (o cambia) la configuración del servidor.
  const [cargado, setCargado] = useState<MantenimientoAdmin | null>(null);
  if (data && data !== cargado) {
    setCargado(data);
    // Un inicio programado ya vencido bloquea aunque `activo` sea false: el interruptor lo refleja
    // y ese inicio deja de ser una programación, así que no se vuelve a enviar.
    setActivo(data.bloqueando);
    setMensaje(data.mensaje === MENSAJE_MANTENIMIENTO ? '' : data.mensaje);
    setRegreso(aLocal(data.regresoEstimado));
    setInicio(data.inicioProgramado && new Date(data.inicioProgramado) <= new Date() ? '' : aLocal(data.inicioProgramado));
  }

  const guardar = useMutation({
    mutationFn: (body: MantenimientoInput) => putAdminMantenimiento(body),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['adminMantenimiento'], nuevo);
      void queryClient.invalidateQueries({ queryKey: ['mantenimiento'] });
      toast.success('Configuración de mantenimiento guardada');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'admin')),
  });

  const errorFechas =
    regreso && inicio && new Date(regreso) <= new Date(inicio)
      ? 'El regreso estimado debe ser posterior al inicio programado.'
      : null;

  // El PUT reemplaza toda la configuración: siempre se envían todos los campos.
  const enviar = () => {
    setConfirmando(false);
    guardar.mutate({ activo, mensaje: mensaje.trim(), regresoEstimado: aIso(regreso), inicioProgramado: aIso(inicio) });
  };

  const alGuardar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (errorFechas) return;
    if (activo && !data?.bloqueando) setConfirmando(true);
    else enviar();
  };

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Sistema" pagina="Modo mantenimiento" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Modo mantenimiento</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Mientras esté activo, todas las personas que no son administradoras ven una pantalla de mantenimiento. Los
          administradores siguen usando la plataforma con normalidad.
        </p>
      </section>

      {isLoading ? (
        <SkeletonRegion className="card-base flex max-w-2xl flex-col gap-stack" label="Cargando la configuración de mantenimiento">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-full" />
        </SkeletonRegion>
      ) : isError || !data ? (
        <p role="alert" className="card-base type-body max-w-2xl text-text-secondary">
          No se pudo cargar la configuración de mantenimiento.
        </p>
      ) : (
        <form
          onSubmit={alGuardar}
          aria-label="Configuración de mantenimiento"
          className="card-base flex max-w-2xl flex-col gap-stack"
        >
          <div className="flex items-center justify-between gap-inline">
            <div className="min-w-0">
              <Label htmlFor="mantenimiento-activo">Activar mantenimiento ahora</Label>
              <p className="type-meta mt-micro">
                Estado actual:{' '}
                <Tag tone={data.bloqueando ? 'red' : 'green'} size="sm">
                  {data.bloqueando ? 'Bloqueando' : 'Plataforma disponible'}
                </Tag>
              </p>
            </div>
            <Switch id="mantenimiento-activo" checked={activo} onCheckedChange={setActivo} />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="mantenimiento-mensaje">Mensaje para los usuarios</Label>
            <Textarea
              id="mantenimiento-mensaje"
              value={mensaje}
              maxLength={MAX_MENSAJE}
              placeholder={MENSAJE_MANTENIMIENTO}
              onChange={(e) => setMensaje(e.target.value)}
            />
            <p className="type-meta">
              Si lo dejas vacío se usa el mensaje estándar. {mensaje.length}/{MAX_MENSAJE}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-tight">
              <Label htmlFor="mantenimiento-inicio">Inicio programado (opcional)</Label>
              <Input id="mantenimiento-inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-tight">
              <Label htmlFor="mantenimiento-regreso">Regreso estimado (opcional)</Label>
              <Input
                id="mantenimiento-regreso"
                type="datetime-local"
                value={regreso}
                onChange={(e) => setRegreso(e.target.value)}
                aria-invalid={errorFechas ? true : undefined}
                aria-describedby={errorFechas ? 'mantenimiento-fechas-error' : undefined}
              />
            </div>
          </div>
          {errorFechas && (
            <p id="mantenimiento-fechas-error" role="alert" className="type-meta text-error">
              {errorFechas}
            </p>
          )}
          <p className="type-meta">
            Las fechas se interpretan en la hora de tu navegador. Para programar, deja el interruptor apagado y define el inicio.
          </p>

          <div className="flex justify-end">
            <Button type="submit" disabled={guardar.isPending || !!errorFechas}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      )}

      <ConfirmActionDialog
        open={confirmando}
        title="Activar el modo mantenimiento"
        description="Todas las personas que no son administradoras dejarán de poder usar la plataforma hasta que lo desactives. ¿Quieres activarlo ahora?"
        actionLabel="Activar mantenimiento"
        variant="warning"
        onConfirm={enviar}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}
