import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

import img from '@/public/login-foto.jpg';

/**
 * Identidad visual compartida por las pantallas de autenticación (`/login`,
 * `/registro`): pantalla dividida 50/50 con la fotografía institucional y su
 * mensaje a la izquierda, y a la derecha «Volver», cambio de tema, el contenido
 * y el pie. Las clases de abajo son las de los controles de Login: Registro las
 * reutiliza para que ambas vistas sean el mismo sistema.
 */
export const AUTH_LABEL = 'font-label text-xs font-bold uppercase tracking-widest text-tertiary';

const AUTH_INPUT_BASE =
  'w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container px-4 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Control de Login (56 px de alto). */
export const AUTH_INPUT = `${AUTH_INPUT_BASE} py-4`;
/** Mismo control para formularios largos (48 px): solo cambia el relleno vertical. */
export const AUTH_INPUT_COMPACT = `${AUTH_INPUT_BASE} py-3`;

export const AUTH_FIELD_ERROR = 'text-xs text-error text-left';

export const AUTH_PRIMARY_BUTTON =
  'w-full rounded-md bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary dark:hover:bg-[#153e26] active:scale-[0.98] disabled:opacity-60';

interface AuthSplitLayoutProps {
  /** Mensaje institucional superpuesto sobre la fotografía. */
  titulo: string;
  descripcion: string;
  /**
   * Formularios más altos que la pantalla: en escritorio la fotografía queda
   * fija a la altura de la ventana y solo se desplaza el panel del formulario.
   * Sin esto (Login) la página crece con su contenido, como siempre.
   */
  panelDesplazable?: boolean;
  /** Contenido del panel derecho, dentro de `<main>`. */
  children: ReactNode;
}

export function AuthSplitLayout({ titulo, descripcion, panelDesplazable = false, children }: AuthSplitLayoutProps) {
  return (
    <div
      className={`flex min-h-screen flex-col overflow-hidden bg-surface font-body text-on-surface antialiased lg:flex-row ${
        panelDesplazable ? 'lg:h-screen' : ''
      }`}
    >
      {/* Left Column: Image */}
      <div className="relative hidden overflow-hidden lg:block lg:w-1/2">
        <Image
          alt="Estudiantes UVG"
          className="absolute inset-0 h-full w-full object-cover"
          src={img}
          fill
          sizes="(min-width: 1024px) 50vw, 0px"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <h2 className="font-headline text-4xl font-extrabold text-white drop-shadow-lg mb-4">{titulo}</h2>
          <p className="text-lg font-medium text-white/90 drop-shadow-md">{descripcion}</p>
        </div>
      </div>

      {/* Right Column */}
      <div className={`relative flex w-full flex-col bg-surface lg:w-1/2 ${panelDesplazable ? 'lg:overflow-y-auto' : ''}`}>
        {/* Top Bar */}
        <header className="z-10 flex items-center justify-between px-8 py-6">
          <Link href="/" className="flex items-center gap-2 text-outline transition-colors hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Volver</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">{children}</main>

        {/* Footer */}
        <footer className="flex justify-between border-t border-surface-container-highest/50 px-8 py-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">UVG 2025</span>
          <div className="flex gap-4">
            <a
              href="#"
              className="text-[10px] font-bold uppercase tracking-wider text-outline transition-colors hover:text-primary"
            >
              Privacidad
            </a>
            <a
              href="#"
              className="text-[10px] font-bold uppercase tracking-wider text-outline transition-colors hover:text-primary"
            >
              Soporte
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
