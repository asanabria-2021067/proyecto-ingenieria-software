'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, ListChecks, MessageSquare, Sparkles, User } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalSearch } from '@/hooks/use-global-search';
import type { NavLeaf } from '@/components/dashboard/SidebarNav';

export const EVENTO_ABRIR_NOVEDADES = 'abrir-novedades';

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Buscador global Ctrl+K / Cmd+K (MEJ-73). Los destinos de navegacion los pone
 * cada layout (solo lo que el rol ve en su menu) y las entidades salen de
 * `GET /busqueda`, que ya acota proyectos, personas y tareas a lo visible
 * para el usuario autenticado.
 */
export function CommandPalette({ destinos }: { destinos: Pick<NavLeaf, 'href' | 'label'>[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data, isFetching, isDebouncing } = useGlobalSearch(open ? query : '');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function cambiarApertura(abierto: boolean) {
    setOpen(abierto);
    if (!abierto) setQuery('');
  }

  function ir(href: string) {
    cambiarApertura(false);
    router.push(href);
  }

  const q = normalizar(query.trim());
  const paginas = destinos.filter((d) => !q || normalizar(d.label).includes(q));
  const cargando = q.length > 0 && (isFetching || isDebouncing);
  const hayEntidades = !!data && (data.proyectos.items.length + data.personas.items.length + data.tareas.items.length + data.mensajes.items.length > 0);
  const sinResultados = paginas.length === 0 && !hayEntidades && !cargando;

  return (
    <CommandDialog
      open={open}
      onOpenChange={cambiarApertura}
      title="Buscador global"
      description="Busca páginas, proyectos, personas y tareas. Ctrl+K o Cmd+K para abrir y cerrar."
      commandProps={{ shouldFilter: false, label: 'Buscador global' }}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar páginas, proyectos, personas y tareas…" />
      <CommandList>
        {sinResultados && <CommandEmpty>Sin coincidencias. Prueba con otro texto.</CommandEmpty>}

        {paginas.length > 0 && (
          <CommandGroup heading="Ir a">
            {paginas.map((d) => (
              <CommandItem key={d.href} value={`pagina-${d.href}`} onSelect={() => ir(d.href)}>
                {d.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {q === '' && (
          <CommandGroup heading="Ayuda">
            <CommandItem
              value="novedades"
              onSelect={() => {
                cambiarApertura(false);
                window.dispatchEvent(new Event(EVENTO_ABRIR_NOVEDADES));
              }}
            >
              <Sparkles aria-hidden="true" />
              Qué hay de nuevo
            </CommandItem>
          </CommandGroup>
        )}

        {data && q !== '' && (
          <>
            {data.proyectos.items.length > 0 && (
              <CommandGroup heading="Proyectos">
                {data.proyectos.items.map((p) => (
                  <CommandItem key={p.idProyecto} value={`proyecto-${p.idProyecto}`} onSelect={() => ir(`/dashboard/proyectos/${p.idProyecto}`)}>
                    <FolderKanban aria-hidden="true" />
                    {p.tituloProyecto}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {data.personas.items.length > 0 && (
              <CommandGroup heading="Personas">
                {data.personas.items.map((p) => (
                  <CommandItem key={p.idUsuario} value={`persona-${p.idUsuario}`} onSelect={() => ir(`/dashboard/personas/${p.idUsuario}`)}>
                    <User aria-hidden="true" />
                    {p.nombre} {p.apellido}
                    {p.carrera && <span className="ml-auto truncate text-xs text-muted-foreground">{p.carrera}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {data.tareas.items.length > 0 && (
              <CommandGroup heading="Tareas">
                {data.tareas.items.map((t) => (
                  <CommandItem
                    key={t.idTarea}
                    value={`tarea-${t.idTarea}`}
                    onSelect={() => ir(`/dashboard/projects/${t.idProyecto}/kanban/tasks/${t.idTarea}`)}
                  >
                    <ListChecks aria-hidden="true" />
                    {t.tituloTarea}
                    <span className="ml-auto truncate text-xs text-muted-foreground">{t.tituloProyecto}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {data.mensajes.items.length > 0 && (
              <CommandGroup heading="Mensajes y canales">
                {data.mensajes.items.map((m) => (
                  <CommandItem key={m.idConversacion} value={`mensaje-${m.idConversacion}`} onSelect={() => ir(`/dashboard/mensajes/${m.idConversacion}`)}>
                    <MessageSquare aria-hidden="true" />
                    {m.nombre}
                    {m.tituloProyecto && <span className="ml-auto truncate text-xs text-muted-foreground">{m.tituloProyecto}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {cargando && (
          <div className="space-y-tight px-card py-inline" role="status" aria-label="Buscando">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        )}
      </CommandList>
      <div className="flex items-center gap-inline border-t px-3 py-2 text-xs text-muted-foreground">
        <Kbd>Flechas</Kbd> navegar
        <Kbd>Enter</Kbd> abrir
        <Kbd className="ml-auto">Esc</Kbd> cerrar
      </div>
    </CommandDialog>
  );
}
