'use client';

import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useLogin } from '@/hooks/use-login';
import { z } from 'zod';
import { ThemeToggle } from '@/components/theme-toggle';

import img from '@/public/login-foto.jpg'
import logo from '@/public/logo.png';

const loginSchema = z.object({
  correo: z
    .string({ required_error: 'El correo es obligatorio' })
    .trim()
    .min(1, 'El correo es obligatorio')
    .email('El correo es inválido'),
  contrasena: z
    .string({ required_error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria'),
});

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ correo?: string; contrasena?: string }>({});
  const { mutate, isPending } = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const resultado = loginSchema.safeParse({ correo, contrasena });
    if (!resultado.success) {
      const fieldErrors = resultado.error.flatten().fieldErrors;
      setErrores({
        correo: fieldErrors.correo?.[0],
        contrasena: fieldErrors.contrasena?.[0],
      });
      return;
    }

    setErrores({});
    mutate(resultado.data);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface font-body text-on-surface antialiased lg:flex-row">
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
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-md">
            {/* Branding */}
            <div className="mb-10 text-left">
              <Image src={logo} alt="UVGENIUS" className="h-40 w-auto mx-auto mb-4" />
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
                  value={correo}
                  required
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    if (errores.correo) {
                      setErrores((prev) => ({ ...prev, correo: undefined }));
                    }
                  }}
                  placeholder="usuario@uvg.edu.gt"
                  className="w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container px-4 py-4 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  aria-invalid={errores.correo ? 'true' : 'false'}
                />
                {errores.correo && (
                  <p className="text-xs text-error text-left">{errores.correo}</p>
                )}
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
                  value={contrasena}
                  required
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    if (errores.contrasena) {
                      setErrores((prev) => ({ ...prev, contrasena: undefined }));
                    }
                  }}
                  placeholder="Minimo 8 caracteres"
                  className="w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container px-4 py-4 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  aria-invalid={errores.contrasena ? 'true' : 'false'}
                />
                {errores.contrasena && (
                  <p className="text-xs text-error text-left">{errores.contrasena}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary dark:hover:bg-[#153e26] active:scale-[0.98] disabled:opacity-60"
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
            <button className="flex w-full items-center justify-center gap-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest py-4 font-headline font-bold text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-[0.98]">
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
