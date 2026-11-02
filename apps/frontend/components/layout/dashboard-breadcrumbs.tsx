'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { migaEnLayout, migasDe } from '@/lib/migas';
import { dashboardPage } from '@/components/layout/dashboard-page';

/** Migas de pan de las paginas internas, calculadas desde la ruta (MEJ-74). */
export function DashboardBreadcrumbs({ enLayout = false }: { enLayout?: boolean }) {
  const pathname = usePathname() ?? '';
  const migas = migasDe(pathname);
  if (!migas || migaEnLayout(pathname) !== enLayout) return null;

  return (
    <div className={dashboardPage('pt-stack')}>
      <Breadcrumb>
        <BreadcrumbList className="text-sm">
          {migas.map((m, i) => (
            <Fragment key={`${i}-${m.label}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === migas.length - 1 ? (
                  <BreadcrumbPage className="font-medium text-on-surface">{m.label}</BreadcrumbPage>
                ) : m.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={m.href} className="text-tertiary hover:text-on-surface">
                      {m.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="text-tertiary">{m.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
