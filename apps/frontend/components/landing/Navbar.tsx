'use client';

import Link, { useLinkStatus } from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Spinner } from '@/components/ui/spinner';
import logoLight from '@/public/Logo UVG-08.png';
import logoDark from '@/public/Logo claro.png';

const navLinks = [
  { label: 'El Problema', href: '#el-problema' },
  { label: 'La Solución', href: '#la-solucion' },
  { label: 'Cómo Funciona', href: '#como-funciona' },
  { label: 'Contacto', href: '/contacto' },
];

// NL-T2: /registro tarda en abrir (en desarrollo compila al primer clic) y sin
// señal visible el usuario volvía a hacer clic. `useLinkStatus` solo marca
// pendiente una navegación real (no Ctrl/Cmd/clic central) y se apaga solo.
function EtiquetaRegistro() {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <Spinner aria-label="Cargando" />
      Abriendo…
    </>
  ) : (
    'Registrarse'
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-[70] transition-all duration-300 ${
        scrolled
          ? 'bg-transparent backdrop-blur-xl'
          : 'bg-transparent backdrop-blur-sm'
      }`}
    >
      <nav className="mx-auto max-w-7xl px-3 py-3 sm:px-4 md:px-8">
        <div
          className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 transition-all sm:px-4 md:px-6 ${
            scrolled
              ? 'border-white/25 bg-white/10 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.45)]'
              : 'border-white/15 bg-white/5 shadow-none'
          }`}
        >
          <div className="flex items-center gap-8">
            <Image src={logoLight} alt="UVG Scholar" className="h-8 w-auto brightness-0 sm:h-9 dark:hidden" />
            <Image src={logoDark} alt="UVG Scholar" className="h-8 w-auto sm:h-9 hidden dark:block" />
            <div className="hidden gap-6 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="relative text-xs font-semibold uppercase tracking-[0.14em] text-on-surface transition-colors duration-200 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all after:duration-300 hover:text-primary hover:after:w-full"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wider text-on-surface transition-all duration-200 hover:bg-white/15"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold uppercase tracking-wider text-on-primary shadow-md transition-all duration-200 hover:brightness-110"
            >
              <EtiquetaRegistro />
            </Link>
            <ThemeToggle />
          </div>
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-on-surface"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Abrir menú"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mt-2 rounded-2xl border border-white/25 bg-white/15 p-4 shadow-lg backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-2 py-2 text-sm font-semibold uppercase tracking-wider text-tertiary hover:bg-surface-container-high hover:text-primary"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/login"
                className="rounded-lg px-2 py-2 text-sm font-semibold uppercase tracking-wider text-primary hover:bg-primary/10"
                onClick={() => setMenuOpen(false)}
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-center text-sm font-bold uppercase tracking-wider text-on-primary"
                // Sin cerrar el menú al hacer clic: así se ve «Abriendo…» hasta que cargue el formulario.
              >
                <EtiquetaRegistro />
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
