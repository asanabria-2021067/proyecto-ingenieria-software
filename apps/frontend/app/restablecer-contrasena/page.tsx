'use client';

import { useState, useEffect, type FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

import logo from '@/public/logo.png';
import img from '@/public/login-foto.jpg';
import { resetPassword } from '@/lib/services/auth';

function RestablecerContrasenaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      router.push('/recuperar-contrasena');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams, router]);

  function validatePasswords(): boolean {
    if (password.length < 8) {
      setValidationError('La contraseña debe tener al menos 8 caracteres');
      return false;
    }
    if (password !== confirmPassword) {
      setValidationError('Las contraseñas no coinciden');
      return false;
    }
    setValidationError('');
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validatePasswords() || !token) return;

    setLoading(true);
    setError('');

    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      const errorMsg = err.message || 'Ocurrió un error al restablecer la contraseña';
      if (errorMsg.includes('expirado')) {
        setError('El enlace ha expirado. Solicita uno nuevo.');
      } else if (errorMsg.includes('inválido')) {
        setError('El enlace es inválido. Verifica que hayas copiado la URL completa.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return null;
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
            Crea una contraseña segura para proteger tu cuenta.
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
              <Image src={logo} alt="UVG Scholar" className="h-40 w-auto mx-auto mb-4" />
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                Restablecer contraseña
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Ingresa tu nueva contraseña
              </p>
            </div>

            {!success ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {validationError && (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">{validationError}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="font-label text-xs font-bold uppercase tracking-widest text-tertiary">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline-variant" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      disabled={loading}
                      className="w-full rounded-xl border border-surface-container-highest bg-white pl-11 pr-4 py-4 font-body text-on-surface shadow-sm placeholder:text-outline-variant transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite la contraseña"
                      disabled={loading}
                      className="w-full rounded-xl border border-surface-container-highest bg-white pl-11 pr-4 py-4 font-body text-on-surface shadow-sm placeholder:text-outline-variant transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-container disabled:active:scale-100"
                >
                  {loading ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
                <h2 className="font-headline text-xl font-bold text-on-surface mb-2">
                  Contraseña actualizada
                </h2>
                <p className="text-sm text-tertiary mb-6">
                  Tu contraseña ha sido actualizada exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.
                </p>
                <Link
                  href="/login"
                  className="inline-block rounded-xl bg-primary-container px-8 py-3 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary active:scale-[0.98]"
                >
                  Ir al login
                </Link>
              </div>
            )}

            <p className="mt-10 text-center text-xs text-tertiary">
              Recordaste tu contraseña?{' '}
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

export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <RestablecerContrasenaContent />
    </Suspense>
  );
}
