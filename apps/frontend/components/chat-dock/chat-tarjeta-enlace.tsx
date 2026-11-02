'use client';

import Link from 'next/link';
import { ClipboardList, FolderKanban, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useTarjetasEnlace } from '@/hooks/use-chat-extras';
import { etiquetaEstado, extraerEnlacesInternos, type EnlaceInternoMensaje } from '@/lib/chat-tarjetas';
import type { ChatTarjetaEnlace } from '@/lib/types/chat';

interface ChatTarjetasEnlaceProps {
  idProyecto: number;
  idConversacion: number;
  contenido: string;
}

const CLASE_TARJETA =
  'mt-2 flex max-w-full items-center gap-2 overflow-hidden rounded-lg border border-outline-variant bg-surface px-2 py-1.5 text-on-surface dark:bg-surface-container-low';

function Tarjeta({ tarjeta, href }: { tarjeta: ChatTarjetaEnlace; href: string }) {
  const Icono = tarjeta.tipo === 'TAREA' ? ClipboardList : FolderKanban;
  if (!tarjeta.accesible) {
    return (
      <div className={`${CLASE_TARJETA} text-tertiary`} data-testid="tarjeta-enlace-bloqueada">
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 text-xs">
          {tarjeta.tipo === 'TAREA' ? 'Tarea' : 'Proyecto'} no disponible: no existe o no tienes acceso.
        </span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={`${CLASE_TARJETA} no-underline transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
      data-testid="tarjeta-enlace"
    >
      <Icono className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wide text-tertiary">{tarjeta.tipo === 'TAREA' ? 'Tarea' : 'Proyecto'}</span>
        <span className="line-clamp-2 break-words text-xs font-semibold">{tarjeta.titulo}</span>
        {tarjeta.proyecto && <span className="truncate text-[11px] text-tertiary">{tarjeta.proyecto}</span>}
      </span>
      {tarjeta.estado && (
        <Tag tone="subtle" size="sm" className="shrink-0">
          {etiquetaEstado(tarjeta.estado)}
        </Tag>
      )}
    </Link>
  );
}

function TarjetasResueltas({ idProyecto, idConversacion, enlaces }: { idProyecto: number; idConversacion: number; enlaces: EnlaceInternoMensaje[] }) {
  const { tarjetas, isLoading } = useTarjetasEnlace(idProyecto, idConversacion, enlaces.map((e) => e.ruta));
  if (isLoading) return <Skeleton className="mt-2 h-10 w-full max-w-xs" />;
  return (
    <>
      {tarjetas.map((t) => (
        <Tarjeta key={t.ruta} tarjeta={t} href={enlaces.find((e) => e.ruta === t.ruta)?.href ?? t.ruta} />
      ))}
    </>
  );
}

/** Tarjetas de los enlaces internos de un mensaje; los permisos son los de quien lo lee. Sin enlaces no consulta nada. */
export function ChatTarjetasEnlace({ idProyecto, idConversacion, contenido }: ChatTarjetasEnlaceProps) {
  const origen = typeof window === 'undefined' ? '' : window.location.origin;
  const enlaces = origen ? extraerEnlacesInternos(contenido, origen) : [];
  if (enlaces.length === 0) return null;
  return <TarjetasResueltas idProyecto={idProyecto} idConversacion={idConversacion} enlaces={enlaces} />;
}
