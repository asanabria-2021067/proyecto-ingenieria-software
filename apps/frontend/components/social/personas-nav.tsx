'use client';

import { useState } from 'react';
import { Compass, Menu, Network, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ProjectNavList, type NavListGroup } from '@/components/projects/navigation/project-nav-list';

/**
 * Secciones de Personas. Desde md se eligen en el grupo «Personas» de la
 * sidebar global (DashboardLayout, mismos `href`); por debajo, donde solo hay
 * barra inferior, un Sheet «Secciones» (patrón de `ProjectMobileNav`) con el
 * mismo renderizador (`ProjectNavList`) y el activo verde de la navegación
 * global. La sección vive en `?seccion=`: sobrevive a la recarga y al
 * atrás/adelante; sin parámetro se abre Descubrir.
 */
export type SeccionPersonas = 'descubrir' | 'amigos' | 'amigos-de-amigos';

const BASE = '/dashboard/personas';

export const SECCIONES_PERSONAS: Record<SeccionPersonas, { label: string; titulo: string; descripcion: string; href: string }> = {
  descubrir: {
    label: 'Descubrir personas',
    titulo: 'Descubrir personas',
    descripcion: 'Busca compañeros, sigue su actividad y hazte amigo.',
    href: BASE,
  },
  amigos: {
    label: 'Mis amigos',
    titulo: 'Mis amigos',
    descripcion: 'Mantén el contacto con las personas de tu comunidad.',
    href: `${BASE}?seccion=amigos`,
  },
  'amigos-de-amigos': {
    label: 'Amigos de amigos',
    titulo: 'Amigos de amigos',
    descripcion: 'Descubre estudiantes con conexiones en común.',
    href: `${BASE}?seccion=amigos-de-amigos`,
  },
};

/** Sección de `?seccion=`; un valor ausente o desconocido abre Descubrir. */
export function parseSeccionPersonas(valor: string | null | undefined): SeccionPersonas {
  return valor === 'amigos' || valor === 'amigos-de-amigos' ? valor : 'descubrir';
}

const item = (id: SeccionPersonas, icon: NavListGroup['items'][number]['icon']) => ({
  id,
  href: SECCIONES_PERSONAS[id].href,
  label: SECCIONES_PERSONAS[id].label,
  icon,
});

/** Una sola lista, en el orden del grupo «Personas» de la sidebar global. */
const GRUPOS: NavListGroup[] = [
  { id: 'personas', label: null, items: [item('descubrir', Compass), item('amigos', Users), item('amigos-de-amigos', Network)] },
];

/** Por debajo de md (sin sidebar global): «Secciones» abre un Sheet con las tres secciones. */
export function PersonasMobileNav({ seccion }: { seccion: SeccionPersonas }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="sticky top-0 z-20 flex items-center gap-tight border-b border-outline-variant bg-card px-stack py-tight md:hidden">
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Menu className="size-4" aria-hidden="true" />
            Secciones
          </Button>
        </SheetTrigger>
        <SheetContent side="left" closeLabel="Cerrar secciones" className="w-72 gap-0 sm:max-w-72" aria-describedby={undefined}>
          <SheetHeader className="border-b border-outline-variant pr-section">
            <SheetTitle className="truncate text-sm font-bold text-on-surface">Personas</SheetTitle>
          </SheetHeader>
          <nav aria-label="Navegación de Personas" className="overflow-y-auto p-inline">
            <ProjectNavList
              id="personas-mobile-nav"
              groups={GRUPOS}
              activeHref={SECCIONES_PERSONAS[seccion].href}
              variant="full"
              activeTone="sage"
              onNavigate={() => setAbierto(false)}
            />
          </nav>
        </SheetContent>
      </Sheet>
      <p className="min-w-0 flex-1 truncate text-sm font-bold text-on-surface">{SECCIONES_PERSONAS[seccion].label}</p>
    </div>
  );
}
