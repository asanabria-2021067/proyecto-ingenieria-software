'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import { SafeExternalLink } from '@/components/profile/safe-external-link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConversationLinks } from '@/hooks/use-chat';
import { ChatFilesList } from './chat-files-list';

interface ChatLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idProyecto: number;
  idConversacion: number;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EnlacesLista({ idProyecto, idConversacion }: Omit<ChatLinksDialogProps, 'open' | 'onOpenChange'>) {
  const { enlaces, hasMore, isLoading, isError, cargarMas, cargandoMas } = useConversationLinks(idProyecto, idConversacion, true);
  // El mismo enlace puede repetirse entre paginas: se muestra solo la primera aparicion (la mas reciente).
  const unicos = enlaces.filter((e, i) => enlaces.findIndex((o) => o.url === e.url) === i);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-tertiary" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Cargando enlaces…
      </p>
    );
  }
  if (isError) {
    return <p role="alert" className="text-sm text-error">No se pudieron cargar los enlaces. Intenta de nuevo.</p>;
  }
  if (unicos.length === 0 && !hasMore) {
    return <p className="text-sm text-tertiary">Todavía no se han compartido enlaces en esta conversación.</p>;
  }
  return (
    <>
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {unicos.map((e) => (
          <li key={e.url} className="rounded-lg border border-outline-variant p-2 text-sm">
            <SafeExternalLink url={e.url} className="flex items-center gap-1 font-semibold text-primary hover:underline">
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{e.dominio}</span>
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </SafeExternalLink>
            <p className="truncate text-xs text-tertiary" title={e.url}>{e.url}</p>
            <p className="text-xs text-tertiary">
              {e.remitente.nombre} {e.remitente.apellido} · {formatFecha(e.enviadoEn)}
            </p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button type="button" variant="outline" size="sm" onClick={cargarMas} disabled={cargandoMas} className="self-center">
          {cargandoMas ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </>
  );
}

export function ChatLinksDialog({ open, onOpenChange, idProyecto, idConversacion }: ChatLinksDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enlaces y archivos compartidos</DialogTitle>
          <DialogDescription>Lo que se ha enviado en esta conversación, del más reciente al más antiguo.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="enlaces">
          <TabsList>
            <TabsTrigger value="enlaces">Enlaces</TabsTrigger>
            <TabsTrigger value="archivos">Archivos</TabsTrigger>
          </TabsList>
          <TabsContent value="enlaces" className="flex flex-col gap-3">
            <EnlacesLista idProyecto={idProyecto} idConversacion={idConversacion} />
          </TabsContent>
          <TabsContent value="archivos" className="flex flex-col gap-3">
            <ChatFilesList idProyecto={idProyecto} idConversacion={idConversacion} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
