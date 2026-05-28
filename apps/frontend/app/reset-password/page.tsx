'use client';

import { useState, type FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Lock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { apiFetch } from '@/lib/api/client';
import uvgSwal from '@/lib/swal';

import logo from '@/public/logo.png';
import img from '@/public/login-foto.jpg';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!token) {
      uvgSwal.fire({
        icon: 'error',
        title: 'Token inválido',
        text: 'No se encontró un token válido en la URL',
      });
      return;
    }

    if (nuevaContrasena !== confirmar) {
      uvgSwal.fire({
        icon: 'warning',
        title: 'Error',
        text: 'Las contraseñas no coinciden',
      });
      return;
    }

    if (nuevaContrasena.length < 8) {
      uvgSwal.fire({
        icon: 'warning',
        title: 'Error',
        text: 'La contraseña debe tener al menos 8 caracteres',
      });
      return;
    }

    setEnviando(true);

    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, nuevaContrasena }),
      });
      setExito(true);
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (error: any) {
      uvgSwal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo restablecer la contraseña. El token puede estar expirado.',
      });
    } finally {
      setEnviando(false);
    }
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
            Nueva contraseña
          </h2>
          <p className="text-lg font-medium text-white/90 drop-shadow-md">
            Establece una contraseña segura para tu cuenta
          </p>
        </div>
      </div>

      {/* Right Column */}
      <div className="relative flex w-full flex-col bg-surface lg:w-1/2">
        <header className="z-10 flex items-center justify-between px-8 py-6">
          <Link
            href="/login"
            className="flex items-center gap-2 text-outline transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Volver al login</span>
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 text-left">
              <Image src={logo} alt="UVGENIUS" className="h-40 w-auto mx-auto mb-4" />
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                Restablecer contraseña
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Ingresa tu nueva contraseña a continuación
              </p>
            </div>

            {!exito ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline-variant" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={nuevaContrasena}
                      onChange={(e) => setNuevaContrasena(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container pl-11 pr-4 py-4 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">
                    Confirmar Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline-variant" />
                    <input
                      type="password"
                      required
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      placeholder="Repite tu contraseña"
                      className="w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container pl-11 pr-4 py-4 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary dark:hover:bg-[#153e26] active:scale-[0.98] disabled:opacity-60"
                >
                  {enviando ? 'Restableciendo...' : 'Restablecer contraseña'}
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
                <h2 className="font-headline text-xl font-bold text-on-surface mb-2">
                  Contraseña restablecida
                </h2>
                <p className="text-sm text-tertiary mb-6">
                  Tu contraseña ha sido actualizada exitosamente. Redirigiendo al login...
                </p>
              </div>
            )}

            <p className="mt-10 text-center text-xs text-tertiary">
              ¿Recordaste tu contraseña?{' '}
              <Link href="/login" className="font-bold text-primary hover:underline">
                Inicia sesión
              </Link>
            </p>
          </div>
        </main>

        <footer className="flex justify-between border-t border-surface-container-highest/50 px-8 py-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
            UVG 2025
          </span>
          <div className="flex gap-4">
            <a href="#" className="text-[10px] font-bold uppercase tracking-wider text-outline transition-colors hover:text-primary">
              Privacidad
            </a>
            <a href="#" className="text-[10px] font-bold uppercase tracking-wider text-outline transition-colors hover:text-primary">
              Soporte
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
