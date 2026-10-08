import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

/**
 * Miga de pan de las vistas administrativas: «Sección > Página», con los
 * mismos nombres que la sidebar (Proyectos, Gobernanza, Administración).
 *
 * Empieza en la sección, no en el Dashboard: el panel es un destino hermano
 * de las secciones, no su contenedor. Una sección solo es enlace cuando tiene
 * una vista de entrada (`seccionHref`); «Administración» no la tiene.
 */
export function AdminBreadcrumb({
  seccion,
  seccionHref,
  pagina,
}: {
  seccion: string;
  seccionHref?: string;
  pagina: string;
}) {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList className="text-sm">
        <BreadcrumbItem>
          {seccionHref ? (
            <BreadcrumbLink asChild>
              <Link href={seccionHref} className="text-tertiary hover:text-on-surface">
                {seccion}
              </Link>
            </BreadcrumbLink>
          ) : (
            <span className="text-tertiary">{seccion}</span>
          )}
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium text-on-surface">{pagina}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
