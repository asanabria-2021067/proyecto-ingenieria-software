'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import novedades from '@/lib/novedades.json';
import { EVENTO_ABRIR_NOVEDADES } from '@/components/layout/command-palette';

const CLAVE_VISTO = 'uvg-novedades-visto';

/**
 * MEJ-75: «Qué hay de nuevo». `lib/novedades.json` lo regenera `npm run changelog`
 * (scripts/changelog.mjs); el aviso sale una sola vez por release (`id`) y el
 * detalle se abre desde el aviso o desde el buscador Ctrl+K.
 */
export function Novedades() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener(EVENTO_ABRIR_NOVEDADES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_NOVEDADES, abrir);
  }, []);

  useEffect(() => {
    if (novedades.items.length === 0) return;
    try {
      if (localStorage.getItem(CLAVE_VISTO) === novedades.id) return;
      localStorage.setItem(CLAVE_VISTO, novedades.id);
    } catch {
      return;
    }
    toast('Qué hay de nuevo', {
      description: `Novedades de ${novedades.id}.`,
      // FIX-42: abajo-izquierda para no tapar la cabecera (el Toaster global va arriba-derecha).
      // md+: margen para librar el sidebar (231px, con el menu de cuenta abajo); movil: sube sobre la
      // barra inferior (h-16) y el boton del chat (h-10, abajo a la derecha).
      position: 'bottom-left',
      // FIX-45: con la sidebar del proyecto (lg+, data-project-sidebar en <html>): global fija 231px + proyecto en rem (16rem abierta, 3.5rem colapsada) - offset 32px + 24px de aire; en px+rem para no solaparse con A-.
      className:
        'md:ml-52 max-md:mb-28 lg:[html[data-project-sidebar=open]_&]:ml-[calc(16rem_+_223px)] lg:[html[data-project-sidebar=collapsed]_&]:ml-[calc(3.5rem_+_223px)]',
      duration: 8_000,
      action: { label: 'Ver', onClick: () => setOpen(true) },
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qué hay de nuevo</DialogTitle>
          <DialogDescription>Funcionalidades recientes de UVGenius ({novedades.id}).</DialogDescription>
        </DialogHeader>
        {novedades.items.length === 0 ? (
          <p className="text-sm text-text-secondary">Aún no hay novedades registradas.</p>
        ) : (
          <ul className="max-h-[60vh] list-disc space-y-tight overflow-y-auto pl-5 text-sm text-text-primary">
            {novedades.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
