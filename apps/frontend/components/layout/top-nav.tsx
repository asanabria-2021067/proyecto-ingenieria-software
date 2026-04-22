'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LayoutGrid } from 'lucide-react';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProjectSearchInput } from '@/components/layout/project-search-input';

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Projects', href: '/dashboard/projects' },
  { label: 'My Applications', href: '/dashboard/applications' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-stretch justify-between gap-6">

        {/* LEFT — logo + nav links */}
        <div className="flex items-stretch gap-8 flex-shrink-0">
          <Link
            href="/dashboard"
            className="text-[#006735] font-bold text-base tracking-tight whitespace-nowrap self-center"
          >
            UVGenius
          </Link>

          <NavigationMenu viewport={false}>
            <NavigationMenuList className="gap-0 h-full">
              {NAV_LINKS.map(({ label, href }) => {
                const isActive =
                  href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(href);

                return (
                  <NavigationMenuItem key={href} className="h-full">
                    <NavigationMenuLink asChild>
                      <Link
                        href={href}
                        className={[
                          'relative px-3 text-sm font-medium transition-colors',
                          'inline-flex items-center h-full',
                          isActive
                            ? 'text-[#006735] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#006735]'
                            : 'text-gray-600 hover:text-gray-900',
                        ].join(' ')}
                      >
                        {label}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* RIGHT — search + icons + avatar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Search */}
          <ProjectSearchInput />

          {/* Bell */}
          <button
            type="button"
            aria-label="Notificaciones"
            className="relative p-1.5 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Bell className="size-5" />
            <span className="absolute top-1 right-1 size-2 rounded-full bg-red-500 ring-1 ring-white" />
          </button>

          {/* Grid / apps */}
          <button
            type="button"
            aria-label="Aplicaciones"
            className="p-1.5 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <LayoutGrid className="size-5" />
          </button>

          {/* Avatar */}
          <Avatar className="size-8 cursor-pointer">
            <AvatarImage src="" alt="Usuario" />
            <AvatarFallback className="bg-gray-200 text-gray-600 text-xs font-semibold">
              U
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
