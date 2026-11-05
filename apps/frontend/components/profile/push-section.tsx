'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { aviso } from '@/lib/mensajes';
import { claveABytes, leerSuscripcion, pushSoportado, SERVICE_WORKER_PUSH } from '@/lib/push';
import { borrarSuscripcionPush, getClavePush, guardarSuscripcionPush } from '@/lib/services/notifications';

type Estado = 'cargando' | 'no-soportado' | 'bloqueado' | 'sin-activar' | 'activo';

/**
 * MEJ-137: notificaciones del navegador o del celular (Web Push). El permiso solo se pide al pulsar
 * «Activar», nunca al entrar. Respeta las preferencias por tipo y el horario de silencio (lo aplica el servidor).
 */
export function PushSection() {
  const { data: clave, isLoading: cargandoClave } = useQuery({
    queryKey: ['push-clave'],
    queryFn: getClavePush,
    retry: false,
    staleTime: Infinity,
  });
  const [estado, setEstado] = useState<Estado>('cargando');
  const [ocupado, setOcupado] = useState(false);

  const leerEstado = useCallback(async () => {
    if (!pushSoportado()) return setEstado('no-soportado');
    if (Notification.permission === 'denied') return setEstado('bloqueado');
    const registro = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PUSH);
    const suscripcion = await registro?.pushManager.getSubscription();
    setEstado(suscripcion && Notification.permission === 'granted' ? 'activo' : 'sin-activar');
  }, []);

  useEffect(() => {
    void leerEstado().catch(() => setEstado('sin-activar'));
  }, [leerEstado]);

  const activar = async () => {
    if (!clave?.clave) return;
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'sin-activar');
        return;
      }
      const registro = await navigator.serviceWorker.register(SERVICE_WORKER_PUSH);
      await navigator.serviceWorker.ready;
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave.clave) }));
      const datos = leerSuscripcion(suscripcion);
      if (!datos) throw new Error('El navegador no entregó las llaves de la suscripción');
      await guardarSuscripcionPush(datos);
      setEstado('activo');
      aviso.exito('Notificaciones del navegador activadas');
    } catch {
      aviso.error('No se pudieron activar las notificaciones del navegador');
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PUSH);
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await borrarSuscripcionPush(suscripcion.endpoint);
        await suscripcion.unsubscribe();
      }
      setEstado('sin-activar');
      aviso.exito('Notificaciones del navegador desactivadas');
    } catch {
      aviso.error('No se pudieron desactivar las notificaciones del navegador');
    } finally {
      setOcupado(false);
    }
  };

  const servidorSinPush = !cargandoClave && !clave?.clave;

  return (
    <section aria-labelledby="push-titulo" className="card-base p-card">
      <div className="flex flex-wrap items-center gap-stack">
        <h2 id="push-titulo" className="type-section">
          Notificaciones del navegador
        </h2>
        {estado === 'activo' && (
          <Tag tone="success" size="sm">
            <BellRing aria-hidden="true" />
            Activadas en este dispositivo
          </Tag>
        )}
      </div>
      <p className="type-body mt-tight max-w-2xl text-text-secondary">
        Recibe un aviso en tu navegador o en tu celular aunque no tengas UVGenius abierto. Solo llegan los tipos de
        notificación que tienes activos y no suenan durante tu horario de silencio.
      </p>

      <div className="mt-stack flex flex-col gap-tight">
        {estado === 'no-soportado' && (
          <p className="type-meta">
            Este navegador no admite notificaciones push. En iPhone y iPad hay que añadir UVGenius a la pantalla de inicio primero.
          </p>
        )}
        {estado === 'bloqueado' && (
          <p role="status" className="type-meta">
            El permiso está bloqueado en este navegador. Habilítalo desde la configuración del sitio y vuelve aquí.
          </p>
        )}
        {servidorSinPush && estado !== 'no-soportado' && (
          <p className="type-meta">Las notificaciones del navegador no están disponibles en este momento.</p>
        )}
        {estado === 'sin-activar' && !servidorSinPush && (
          <div>
            <Button type="button" onClick={() => void activar()} disabled={ocupado || cargandoClave}>
              {ocupado ? 'Activando…' : 'Activar notificaciones del navegador'}
            </Button>
          </div>
        )}
        {estado === 'activo' && (
          <div>
            <Button type="button" variant="outline" onClick={() => void desactivar()} disabled={ocupado}>
              {ocupado ? 'Desactivando…' : 'Desactivar en este dispositivo'}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
