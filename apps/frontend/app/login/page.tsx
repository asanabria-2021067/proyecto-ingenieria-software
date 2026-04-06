'use client';

import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLogin } from '@/hooks/use-login';

import img from '@/public/login-foto.jpg'
import logo from '@/public/logo.png';

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const { mutate, isPending } = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutate({ correo, contrasena });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface font-body text-on-surface antialiased lg:flex-row">
      {/* Left Column: Image */}
      <div className="relative hidden overflow-hidden lg:block lg:w-1/2">
        <img
          alt="Estudiantes UVG"
          className="absolute inset-0 h-full w-full object-cover"
          src={img.src}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <h2 className="font-headline text-4xl font-extrabold text-white drop-shadow-lg mb-4">
            Excelencia que trasciende
          </h2>
          <p className="text-lg font-medium text-white/90 drop-shadow-md">
            Unete a la comunidad academica lider en ciencia y tecnologia de Guatemala.
          </p>
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="relative flex w-full flex-col bg-surface lg:w-1/2">
        {/* Top Bar */}
        <header className="z-10 flex items-center justify-between px-8 py-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-outline transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Volver</span>
          </Link>

        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-md">
            {/* Branding */}
            <div className="mb-10 text-left">
              <img src={logo.src} alt="UVG Scholar" className='h-40 w-auto mx-auto mb-4' />
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                Bienvenido de nuevo
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Inicia sesion con tu correo institucional
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <label className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">
                  Correo Institucional
                </label>
                <input
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="usuario@uvg.edu.gt"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-4 font-body text-on-surface shadow-sm placeholder:text-outline-variant transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <label className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">
                    Contraseña
                  </label>
                  <Link
                    href="/recuperar-contrasena"
                    className="font-label text-xs font-bold uppercase tracking-widest text-primary transition-all hover:underline"
                  >
                    Olvide mi contraseña
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="--------"
                  className="w-full rounded-xl border border-surface-container-highest bg-white px-4 py-4 font-body text-on-surface shadow-sm placeholder:text-outline-variant transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary active:scale-[0.98] disabled:opacity-60"
              >
                {isPending ? 'Iniciando sesion...' : 'Iniciar Sesion'}
              </button>
            </form>

            {/* Divider */}
            <div className="my-8 flex w-full items-center">
              <div className="h-px flex-1 bg-surface-container-highest" />
              <span className="px-4 font-label text-[10px] font-bold uppercase tracking-widest text-outline-variant">
                O continua con
              </span>
              <div className="h-px flex-1 bg-surface-container-highest" />
            </div>

            {/* Microsoft Login */}
            <button className="flex w-full items-center justify-center gap-3 rounded-xl border border-surface-container-highest bg-white py-4 font-headline font-bold text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-[0.98]">
              <svg className="h-5 w-5" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span>Microsoft</span>
            </button>

            <p className="mt-10 text-center text-xs text-tertiary">
              No tienes cuenta?{' '}
              <Link href="/registro" className="font-bold text-primary hover:underline">
                Registrate aqui
              </Link>
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="flex justify-between border-t border-surface-container-highest/50 px-8 py-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            UVG 2025
          </span>
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
