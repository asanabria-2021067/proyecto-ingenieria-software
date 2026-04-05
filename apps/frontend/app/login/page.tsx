'use client';

import { useState, type FormEvent } from 'react';
import { GraduationCap, Globe } from 'lucide-react';
import { useLogin } from '@/hooks/use-login';

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const { mutate, isPending, isError, error } = useLogin();

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
          src="https://lh3.googleusercontent.com/aida/ADBb0uhrP-Bv8w-f34VZ7Lz2kZcth5c33xQXhod16cWPSI59r3PMKa9Oba3xh0Ey5TU7BnRMT-lj_qbKJJakO4KmPE2wa0PR_Cx5bxtKfIbJ55lEyLRuN4Xc9Mc0YMNlYU3kK7WNIumHf1dpPLB3_FfAW9FbRK2D_0fC3Uopnvf2kSTlkPaxwwffDCZGIbpOrix4EXnW1xZMiBEF2nadW-aYnQk8PGU1yV3iy9D9BsP_AWU35hqRc2_mzt48tJtpIIRlgyFP9M4Etoo0"
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
          <span className="font-headline text-xl font-bold uppercase tracking-wider text-primary">
            UVG Scholar
          </span>
          <button className="text-outline transition-colors hover:text-on-surface">
            <Globe className="h-5 w-5" />
          </button>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-md">
            {/* Branding */}
            <div className="mb-10 text-left">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container shadow-lg shadow-green-900/10">
                <GraduationCap className="h-8 w-8 text-white" />
              </div>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                Bienvenido de nuevo
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Portal academico de la Universidad del Valle
              </p>
            </div>

            {/* Error message */}
            {isError && (
              <div className="mb-6 rounded-xl border border-error/30 bg-error-container px-4 py-3 text-sm text-error">
                {(error as { message?: string })?.message ?? 'Credenciales invalidas'}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
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
                    Contrasena
                  </label>
                  <a
                    href="#"
                    className="font-label text-xs font-bold uppercase tracking-widest text-primary transition-all hover:underline"
                  >
                    Olvide mi contrasena
                  </a>
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
              Necesitas acceso? Contacta a{' '}
              <a href="#" className="font-bold text-primary hover:underline">
                Soporte Tecnico IT
              </a>
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
