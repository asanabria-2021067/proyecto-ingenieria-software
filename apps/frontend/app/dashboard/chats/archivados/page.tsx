'use client';

/* ===========================================================================
   T-236: pantalla de conversaciones archivadas.
   ---------------------------------------------------------------------------
   Separada de cualquier lista de chats "activa" (esta app no tiene una lista
   global de conversaciones entre proyectos — el chat vive dentro de cada
   proyecto, ver project-chat-panel.tsx). Esta pantalla SÍ cruza todos los
   proyectos: es la única forma de encontrar un chat archivado sin recordar
   de qué proyecto era.

   Búsqueda: un solo campo que el backend compara contra el nombre del chat
   Y contra el nombre de la persona participante (sin normalización de
   acentos todavía — esa función la trae Saúl en T-245/HU-161; cuando exista,
   se conecta acá sin cambiar esta pantalla).
   =========================================================================== */

import { useState } from 'react';
import { Archive, Lock, Search, Users as UsersIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { getIniciales } from '@/components/projects/available-project-card';
import { useArchivedConversations } from '@/hooks/use-chat';
import { getMessages } from '@/lib/services/chat';
import { useQuery } from '@tanstack/react-query';
import type { ArchivedConversacion } from '@/lib/types/chat';
import { useCurrentUser } from '@/hooks/use-current-user';

function nombreConversacion(conversacion: ArchivedConversacion, currentUserId: number | null): string {
  if (conversacion.tipo === 'GRUPAL') return conversacion.nombre ?? 'Grupo';
  const otro = conversacion.participantes.find((p) => p.idUsuario !== currentUserId);
  return otro ? `${otro.nombre} ${otro.apellido}` : 'Conversación';
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}

function ListaSkeleton() {
  return (
    <SkeletonTheme baseColor="var(--color-surface-container)" highlightColor="var(--color-surface-container-high)">
      <div className="space-y-tight" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={64} borderRadius="var(--radius-control)" />
        ))}
      </div>
    </SkeletonTheme>
  );
}

export default function ChatsArchivadosPage() {
  const { data: user } = useCurrentUser();
  const currentUserId = user?.idUsuario ?? null;
  const [q, setQ] = useState('');
  const [activa, setActiva] = useState<ArchivedConversacion | null>(null);

  const { conversaciones, hasMore, isLoading, cargarMas, cargandoMas } = useArchivedConversations(q);

  return (
    <div className="mx-auto max-w-content px-stack py-section lg:px-section lg:py-page">
      <header className="mb-section flex items-center gap-tight">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-container text-text-secondary">
          <Archive className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="type-display text-text-primary">Chats archivados</h1>
          <p className="type-body mt-tight text-text-secondary">
            Conversaciones de proyectos que ya cerraron, en solo lectura.
          </p>
        </div>
      </header>

      <div className="relative mb-card max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre del chat o de la persona"
          className="pl-9"
          aria-label="Buscar chats archivados"
        />
      </div>

      {isLoading ? (
        <ListaSkeleton />
      ) : conversaciones.length === 0 ? (
        <Empty tone="muted" aria-live="polite">
          <EmptyMedia variant="compact">
            <Archive aria-hidden="true" className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="type-subtitle">
              {q.trim() ? 'No encontramos ningún chat archivado con eso' : 'Todavía no tenés chats archivados'}
            </EmptyTitle>
            <EmptyDescription>
              {q.trim()
                ? 'Probá con otro nombre de chat o de persona.'
                : 'Cuando un proyecto cierre, su chat aparece acá en solo lectura.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="space-y-tight">
            {conversaciones.map((c) => (
              <li key={c.idConversacion}>
                <button
                  type="button"
                  onClick={() => setActiva(c)}
                  className="card-base flex w-full items-center gap-tight text-left transition-shadow hover:shadow-raised"
                >
                  {c.tipo === 'GRUPAL' ? (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-secondary-container text-on-secondary-container">
                      <UsersIcon className="size-4" aria-hidden="true" />
                    </span>
                  ) : (
                    <Avatar className="size-11 shrink-0">
                      {(() => {
                        const otro = c.participantes.find((p) => p.idUsuario !== currentUserId);
                        return (
                          <>
                            {otro?.fotoUrl && <AvatarImage src={otro.fotoUrl} alt="" />}
                            <AvatarFallback className="type-body font-medium text-text-secondary">
                              {getIniciales(otro?.nombre ?? '?', otro?.apellido ?? '')}
                            </AvatarFallback>
                          </>
                        );
                      })()}
                    </Avatar>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="type-subtitle truncate text-text-primary">
                      {nombreConversacion(c, currentUserId)}
                    </p>
                    <p className="type-meta truncate">{c.proyecto.tituloProyecto}</p>
                    {c.ultimoMensaje && (
                      <p className="type-body truncate text-text-secondary">{c.ultimoMensaje.contenido}</p>
                    )}
                  </div>
                  <Lock className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="mt-card flex justify-center">
              <Button variant="outline" onClick={cargarMas} disabled={cargandoMas}>
                {cargandoMas ? 'Cargando…' : 'Cargar más'}
              </Button>
            </div>
          )}
        </>
      )}

      <ArchivedThreadSheet
        conversacion={activa}
        currentUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) setActiva(null);
        }}
      />
    </div>
  );
}

interface ArchivedThreadSheetProps {
  conversacion: ArchivedConversacion | null;
  currentUserId: number | null;
  onOpenChange: (open: boolean) => void;
}

function ArchivedThreadSheet({ conversacion, currentUserId, onOpenChange }: ArchivedThreadSheetProps) {
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['chats-archivados-mensajes', conversacion?.proyecto.idProyecto, conversacion?.idConversacion],
    queryFn: () => getMessages(conversacion!.proyecto.idProyecto, conversacion!.idConversacion),
    enabled: conversacion != null,
  });

  return (
    <Sheet open={conversacion != null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-outline-variant px-4 py-3.5 text-left">
          <SheetTitle className="text-base font-bold text-on-surface">
            {conversacion ? nombreConversacion(conversacion, currentUserId) : 'Chat archivado'}
          </SheetTitle>
        </SheetHeader>

        {conversacion && (
          <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container px-4 py-2.5">
            <Lock className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
            <p className="type-meta text-text-secondary">
              Archivado — proyecto <span className="font-medium">{conversacion.proyecto.tituloProyecto}</span>, ya
              cerrado. Solo lectura.
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {isLoading && <p className="text-xs text-tertiary">Cargando historial…</p>}
          {!isLoading && messages.length === 0 && (
            <p className="text-xs text-tertiary">Esta conversación no tiene mensajes.</p>
          )}
          {messages.map((m) => {
            const propio = m.remitente.idUsuario === currentUserId;
            return (
              <div key={m.idMensaje} className={`flex items-end gap-2 ${propio ? 'flex-row-reverse' : ''}`}>
                <Avatar className="size-6 shrink-0">
                  {m.remitente.fotoUrl && <AvatarImage src={m.remitente.fotoUrl} alt="" />}
                  <AvatarFallback className="text-[10px]">
                    {getIniciales(m.remitente.nombre, m.remitente.apellido)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    propio ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'
                  }`}
                >
                  {!propio && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.remitente.nombre}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                  <p className={`mt-0.5 text-[10px] ${propio ? 'text-on-primary/70' : 'text-tertiary'}`}>
                    {formatHora(m.enviadoEn)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
