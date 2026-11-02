'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatearDuracion, formatoGrabacion, NOTA_VOZ_MAX_BYTES, NOTA_VOZ_MAX_SEGUNDOS } from '@/lib/chat-extras';
import { getVoiceNoteAudio } from '@/lib/services/chat-extras';
import type { ChatAdjunto } from '@/lib/types/chat';

interface NotaVozGrabadorProps {
  onEnviar: (audio: Blob, duracionSegundos: number) => void;
  disabled?: boolean;
  /** El formulario esconde el campo de texto mientras se graba. */
  onGrabandoChange?: (grabando: boolean) => void;
}

/** Botón de micrófono: graba hasta 2 min (MediaRecorder), muestra el tiempo y envía o descarta. */
export function NotaVozGrabador({ onEnviar, disabled = false, onGrabandoChange }: NotaVozGrabadorProps) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const grabadora = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicio = useRef(0);
  const descartar = useRef(false);
  const onEnviarRef = useRef(onEnviar);
  useEffect(() => {
    onEnviarRef.current = onEnviar;
  }, [onEnviar]);

  const liberar = useCallback(() => {
    if (temporizador.current) clearInterval(temporizador.current);
    temporizador.current = null;
    flujo.current?.getTracks().forEach((pista) => pista.stop());
    flujo.current = null;
  }, []);

  const terminar = useCallback((descartada: boolean) => {
    descartar.current = descartada;
    if (grabadora.current?.state === 'recording') grabadora.current.stop();
  }, []);

  // Al desmontar (cerrar la ventana) la grabación en curso se descarta y se apaga el micrófono.
  useEffect(
    () => () => {
      descartar.current = true;
      if (grabadora.current?.state === 'recording') grabadora.current.stop();
      liberar();
    },
    [liberar],
  );

  const empezar = async () => {
    const formato = formatoGrabacion();
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Tu navegador no permite grabar notas de voz.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('No se pudo acceder al micrófono. Revisa el permiso del navegador.');
      return;
    }
    flujo.current = stream;
    trozos.current = [];
    descartar.current = false;
    const rec = new MediaRecorder(stream, { mimeType: formato });
    grabadora.current = rec;
    rec.ondataavailable = (evento) => {
      if (evento.data.size > 0) trozos.current.push(evento.data);
    };
    rec.onstop = () => {
      const duracion = Math.min(NOTA_VOZ_MAX_SEGUNDOS, Math.max(1, Math.round((Date.now() - inicio.current) / 1000)));
      liberar();
      setGrabando(false);
      onGrabandoChange?.(false);
      if (descartar.current) return;
      const audio = new Blob(trozos.current, { type: formato.split(';')[0] });
      if (audio.size > NOTA_VOZ_MAX_BYTES) {
        toast.error('La nota de voz supera el máximo de 5 MB.');
        return;
      }
      onEnviarRef.current(audio, duracion);
    };
    inicio.current = Date.now();
    setSegundos(0);
    rec.start();
    setGrabando(true);
    onGrabandoChange?.(true);
    temporizador.current = setInterval(() => {
      const transcurridos = Math.floor((Date.now() - inicio.current) / 1000);
      setSegundos(transcurridos);
      if (transcurridos >= NOTA_VOZ_MAX_SEGUNDOS) terminar(false);
    }, 250);
  };

  if (!grabando) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={empezar}
        disabled={disabled}
        className="size-9 shrink-0 rounded-full"
        aria-label="Grabar nota de voz"
        title="Grabar nota de voz (máx. 2 min)"
      >
        <Mic className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Grabando nota de voz" className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-container px-3 py-1">
      <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-error" aria-hidden="true" />
      <span role="timer" className="text-xs font-semibold tabular-nums text-on-surface">
        {formatearDuracion(segundos)} / {formatearDuracion(NOTA_VOZ_MAX_SEGUNDOS)}
      </span>
      <span className="flex-1" />
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => terminar(true)} className="rounded-full" aria-label="Descartar grabación">
        <X className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" onClick={() => terminar(false)} className="rounded-full" aria-label="Enviar nota de voz">
        <Send className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

interface NotaVozReproductorProps {
  adjunto: ChatAdjunto;
  idProyecto: number;
  idConversacion: number;
}

/** Reproductor de una nota de voz: baja el audio al primer play (mismo origen, objectURL) y lo controla. */
export function NotaVozReproductor({ adjunto, idProyecto, idConversacion }: NotaVozReproductorProps) {
  const total = adjunto.duracionSegundos ?? 0;
  const audio = useRef<HTMLAudioElement>(null);
  const [fuente, setFuente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [actual, setActual] = useState(0);

  useEffect(() => () => {
    if (fuente) URL.revokeObjectURL(fuente);
  }, [fuente]);

  // La fuente llega después del clic: al montarla en el <audio> se reproduce sola.
  useEffect(() => {
    if (fuente) void audio.current?.play().catch(() => setReproduciendo(false));
  }, [fuente]);

  const alternar = async () => {
    if (fuente) {
      if (audio.current?.paused) void audio.current.play().catch(() => undefined);
      else audio.current?.pause();
      return;
    }
    setCargando(true);
    try {
      const blob = await getVoiceNoteAudio(idProyecto, idConversacion, adjunto.idAdjunto);
      setFuente(URL.createObjectURL(blob));
    } catch {
      toast.error('No se pudo cargar la nota de voz. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const progreso = total > 0 ? Math.min(100, (actual / total) * 100) : 0;
  const Icono = cargando ? Loader2 : reproduciendo ? Pause : Play;

  return (
    <div className="flex min-w-48 items-center gap-2 rounded-lg bg-surface-container-lowest p-2 text-on-surface">
      <Button
        type="button"
        size="icon-sm"
        onClick={alternar}
        disabled={cargando}
        className="rounded-full"
        aria-label={reproduciendo ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
      >
        <Icono className={`size-4 ${cargando ? 'animate-spin' : ''}`} aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1 space-y-1">
        <Progress value={progreso} aria-label="Progreso de la nota de voz" className="h-1.5" />
        <p className="text-[11px] tabular-nums text-tertiary">
          {formatearDuracion(reproduciendo || actual > 0 ? actual : total)} / {formatearDuracion(total)}
        </p>
      </div>
      {fuente && (
        <audio
          ref={audio}
          src={fuente}
          preload="auto"
          onPlay={() => setReproduciendo(true)}
          onPause={() => setReproduciendo(false)}
          onEnded={() => {
            setReproduciendo(false);
            setActual(0);
          }}
          onTimeUpdate={(evento) => setActual(evento.currentTarget.currentTime)}
        />
      )}
    </div>
  );
}
