'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CommandPalette } from '@/components/layout/command-palette';
import { Novedades } from '@/components/layout/novedades';
import { useCurrentUser } from '@/hooks/use-current-user';
import { etiquetaDeRuta } from '@/lib/migas';
import { guardarUltimaVista } from '@/lib/ultima-vista';
import type { NavLeaf } from '@/components/dashboard/SidebarNav';

/**
 * Piezas transversales del shell: buscador Ctrl+K (MEJ-73), «Qué hay de nuevo»
 * (MEJ-75) y registro de la ultima pagina visitada (MEJ-78).
 */
export function DashboardExtras({ destinos, recordarVista = true }: { destinos: Pick<NavLeaf, 'href' | 'label'>[]; recordarVista?: boolean }) {
  const pathname = usePathname() ?? '';
  const { data: user } = useCurrentUser();
  const idUsuario = user?.idUsuario;

  useEffect(() => {
    const etiqueta = etiquetaDeRuta(pathname);
    if (recordarVista && idUsuario !== undefined && etiqueta) guardarUltimaVista({ idUsuario, href: pathname, etiqueta });
  }, [pathname, idUsuario, recordarVista]);

  return (
    <>
      <CommandPalette destinos={destinos} />
      <Novedades />
    </>
  );
}
