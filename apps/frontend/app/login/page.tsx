'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useLogin } from '@/hooks/use-login';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { z } from 'zod';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

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

// T-274 (OWASP): un solo mensaje para credenciales invalidas, nunca se dice
// si el correo existe o no. El limite de intentos (5/60s, ver
// auth.controller.ts) se explica aparte para que el bloqueo se sienta como
// un estado temporal y no como otro error de credenciales.
function mensajeError(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return '';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de inicio de sesion. Espera un minuto antes de volver a intentarlo.';
  }
  return 'No se pudo iniciar sesion. Verifica tu correo y contraseña.';
}

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ correo?: string; contrasena?: string }>({});
  const { mutate, isPending, isError, isSuccess: loginOk, error } = useLogin();
  // Sesión ya válida (cookie refresh_token de hasta 30 días todavía viva):
  // no tiene sentido pedir credenciales de nuevo, se manda directo al panel.
  const { data: user, isSuccess } = useCurrentUser();

  useEffect(() => {
    if (isSuccess) {
      router.replace(isAdminUser(user) ? '/dashboard/admin' : '/dashboard');
    }
  }, [isSuccess, user, router]);

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
    <main className="relative flex min-h-screen items-center justify-center bg-page p-stack sm:p-section">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-card bg-card shadow-raised lg:grid-cols-2">
        {/* Branding panel: mismo patron que el hero de /dashboard (bg-primary
            text-on-primary rounded-card shadow-card), con la foto del campus
            desvanecida detras via gradiente ("Auth Card Desvanecido"). */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-section text-on-primary lg:flex">
          <Image
            alt=""
            src={img}
            fill
            className="object-cover opacity-25"
            sizes="(min-width: 1024px) 50vw, 0px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/85 to-primary/50" />

          <Link
            href="/"
            className="relative z-10 flex items-center gap-tight self-start text-on-primary/80 transition-colors hover:text-on-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="type-meta font-bold uppercase tracking-wider">Volver</span>
          </Link>

          <div className="relative z-10">
            <span className="type-meta font-bold uppercase tracking-widest text-on-primary/80">
              Portal institucional · UVG
            </span>
            <h2 className="type-display mt-tight text-on-primary">Excelencia que trasciende</h2>
            <p className="type-body mt-tight text-on-primary/85">
              Unete a la comunidad academica lider en ciencia y tecnologia de Guatemala.
            </p>
          </div>

          <span className="relative z-10 type-meta text-on-primary/80">UVG 2025</span>
        </div>

        {/* Form panel */}
        <div className="flex flex-col p-section">
          <header className="mb-stack flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-tight text-text-secondary transition-colors hover:text-text-primary lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="type-meta font-bold uppercase tracking-wider">Volver</span>
            </Link>
            <span className="hidden lg:block" />
            <ThemeToggle />
          </header>

          <div className="mb-section">
            <Image src={logo} alt="UVGENIUS" className="mb-stack h-16 w-auto" />
            <h1 className="type-section">Bienvenido de nuevo</h1>
            <p className="type-body mt-micro text-text-secondary">
              Inicia sesion con tu correo institucional
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-stack">
            <div className="flex flex-col gap-tight">
              <Label
                htmlFor="correo"
                className="type-meta font-bold uppercase tracking-widest text-text-secondary"
              >
                Correo institucional
              </Label>
              <Input
                id="correo"
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
                aria-invalid={errores.correo ? 'true' : 'false'}
                aria-describedby={errores.correo ? 'correo-error' : undefined}
              />
              {errores.correo && (
                <p id="correo-error" role="alert" className="type-meta text-on-status-error">
                  {errores.correo}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-tight">
              <div className="flex items-end justify-between gap-tight">
                <Label
                  htmlFor="contrasena"
                  className="type-meta font-bold uppercase tracking-widest text-text-secondary"
                >
                  Contraseña
                </Label>
                <Link
                  href="/recuperar-contrasena"
                  className="type-meta font-bold uppercase tracking-widest text-primary hover:underline"
                >
                  Olvide mi contraseña
                </Link>
              </div>
              <Input
                id="contrasena"
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
                aria-invalid={errores.contrasena ? 'true' : 'false'}
                aria-describedby={errores.contrasena ? 'contrasena-error' : undefined}
              />
              {errores.contrasena && (
                <p id="contrasena-error" role="alert" className="type-meta text-on-status-error">
                  {errores.contrasena}
                </p>
              )}
            </div>

            {/* T-219: un solo componente para carga/error/exito, sin popups. */}
            {(isPending || isError || loginOk) && (
              <Alert variant={loginOk ? 'success' : isError ? 'destructive' : 'default'}>
                {isPending && <Spinner />}
                <AlertDescription>
                  {loginOk
                    ? 'Inicio de sesion exitoso. Redirigiendo…'
                    : isError
                      ? mensajeError(error as (Error & { statusCode?: number }) | null)
                      : 'Verificando tus credenciales…'}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              Iniciar Sesion
            </Button>
          </form>

          <div className="my-section flex w-full items-center gap-tight">
            <div className="h-px flex-1 bg-outline-variant" />
            <span className="type-meta font-bold uppercase tracking-widest text-text-secondary">
              O continua con
            </span>
            <div className="h-px flex-1 bg-outline-variant" />
          </div>

          <Button type="button" variant="outline" className="w-full">
            {/* Colores de marca de Microsoft: fijos por identidad visual, no
                tokens del sistema de diseño de UVGenius. */}
            <svg className="h-4 w-4" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Microsoft
          </Button>

          <p className="mt-section text-center type-meta text-text-secondary">
            No tienes cuenta?{' '}
            <Link href="/registro" className="font-bold text-primary hover:underline">
              Registrate aqui
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
