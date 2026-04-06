'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import logo from '@/public/Logo UVG-08.png';

const navLinks = [
  { label: 'El Problema', href: '#el-problema' },
  { label: 'La Solucion', href: '#la-solucion' },
  { label: 'Como Funciona', href: '#como-funciona' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-surface/95 backdrop-blur-xl shadow-md'
          : 'bg-surface/80 backdrop-blur-xl'
      }`}
    >
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-8 py-4">
        <div className="flex items-center gap-8">
          <img src={logo.src} alt="UVG Scholar" className="h-10 w-auto brightness-0" />
          <div className="hidden gap-6 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative text-sm font-medium uppercase tracking-wider text-slate-600 transition-colors duration-200 after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-primary after:transition-all after:duration-300 hover:text-primary hover:after:w-full"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary transition-all duration-200 hover:bg-primary/5"
          >
            Iniciar Sesion
          </Link>
          <Link
            href="/registro"
            className="rounded-xl bg-primary px-6 py-2 text-sm font-bold uppercase tracking-wider text-on-primary shadow-md transition-all duration-200 hover:shadow-lg hover:brightness-110 active:scale-95"
          >
            Registrarse
          </Link>
        </div>
      </nav>
    </header>
  );
}
