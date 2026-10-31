'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLogin } from '@/hooks/use-login';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { z } from 'zod';
import { aviso } from '@/lib/mensajes';
import { MOTIVO_SESION_EXPIRADA, readNextFromLocation } from '@/lib/api/session';
import { AUTH_INPUT, AUTH_LABEL, AUTH_PRIMARY_BUTTON, AuthFieldError, AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

import logo from '@/public/logo.png';

const loginSchema = z.object({
  correo: z
    .string({ required_error: 'El correo es obligatorio' })
    .trim()
    .min(1, 'El correo es obligatorio')
    .email('El correo es inválido. Ejemplo: usuario@uvg.edu.gt')
    // Mismo dominio que exige el registro: cualquier otro nunca tiene cuenta.
    .refine((value) => value.toLowerCase().endsWith('@uvg.edu.gt'), {
      message: 'Usa tu correo institucional, que termina en @uvg.edu.gt',
    }),
  contrasena: z
    .string({ required_error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria'),
});

type ErrorLogin = Error & { statusCode?: number; body?: { intentosRestantes?: unknown } };

// T-274 (OWASP): un solo mensaje para credenciales invalidas, nunca se dice
// si el correo o la contraseña fallaron ni si la cuenta existe. El limite de
// intentos (5/60s, ver auth.controller.ts) se explica aparte para que el
// bloqueo se sienta como un estado temporal y no como otro error de credenciales.
export function mensajeError(error: ErrorLogin | null): string {
  if (!error) return '';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de inicio de sesión. Espera un minuto antes de volver a intentarlo.';
  }
  if (error.statusCode === 403) {
    return 'Tu cuenta está pendiente de verificación por administración.';
  }
  if (error.statusCode === 401) return 'Correo o contraseña incorrectos';
  return 'No se pudo iniciar sesión. Inténtalo de nuevo en unos minutos.';
}

/**
 * NL-T1: «Te quedan N intentos» solo cuando quedan 2 o menos. El backend lo
 * calcula con el contador correo+IP, igual para cuentas que existen y que no.
 */
export function avisoIntentos(error: ErrorLogin | null): string | null {
  const restantes = error?.statusCode === 401 ? error.body?.intentosRestantes : undefined;
  if (typeof restantes !== 'number' || restantes > 2) return null;
  if (restantes <= 0) {
    return 'Por seguridad, bloqueamos temporalmente los intentos de inicio de sesión. Espera unos 15 minutos antes de volver a intentarlo.';
  }
  return `Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`} antes de un bloqueo temporal.`;
}

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ correo?: string; contrasena?: string }>({});
  const { mutate, reset, isPending, isSuccess: loginOk, isError, error } = useLogin();
  const correoRef = useRef<HTMLInputElement>(null);
  const contrasenaRef = useRef<HTMLInputElement>(null);
  const errorLogin = isError ? (error as ErrorLogin) : null;
  // Credenciales incorrectas: no se dice cuál falló (T-274), se marcan ambos campos.
  const credencialesInvalidas = errorLogin?.statusCode === 401;
  // También tras el éxito: el panel tarda en abrirse y no debe poder reenviarse.
  const enviando = isPending || loginOk;
  // Sesión ya válida (cookie refresh_token de hasta 30 días todavía viva):
  // no tiene sentido pedir credenciales de nuevo, se manda directo al panel.
  const { data: user, isSuccess } = useCurrentUser();

  useEffect(() => {
    if (isSuccess) {
      router.replace(readNextFromLocation() ?? (isAdminUser(user) ? '/dashboard/admin' : '/dashboard'));
    }
  }, [isSuccess, user, router]);

  // T-221: `apiFetch` redirige aquí con `motivo` cuando la sesión venció.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('motivo') === MOTIVO_SESION_EXPIRADA) {
      aviso.advertencia('Tu sesión expiró', 'Inicia sesión nuevamente para continuar donde te quedaste.');
    }
  }, []);

  // Tras un 401 el foco vuelve al primer campo para corregir de inmediato.
  useEffect(() => {
    if (credencialesInvalidas) correoRef.current?.focus();
  }, [credencialesInvalidas, error]);

  function limpiarError(campo: 'correo' | 'contrasena') {
    if (errores[campo]) setErrores((prev) => ({ ...prev, [campo]: undefined }));
    if (isError) reset();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const resultado = loginSchema.safeParse({ correo, contrasena });
    if (!resultado.success) {
      const fieldErrors = resultado.error.flatten().fieldErrors;
      setErrores({
        correo: fieldErrors.correo?.[0],
        contrasena: fieldErrors.contrasena?.[0],
      });
      (fieldErrors.correo ? correoRef : contrasenaRef).current?.focus();
      return;
    }

    setErrores({});
    reset();
    mutate(resultado.data);
  }

  return (
    <AuthSplitLayout
      titulo="Excelencia que trasciende"
      descripcion="Únete a la comunidad académica líder en ciencia y tecnología de Guatemala."
    >
          <div className="w-full max-w-md">
            {/* Branding */}
            <div className="mb-10 text-left">
              <Image src={logo} alt="UVGENIUS" className="mx-auto mb-4 h-28 w-auto" />
              <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
                Bienvenido de nuevo
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Inicia sesión con tu correo institucional
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <label htmlFor="correo" className={AUTH_LABEL}>
                  Correo Institucional
                </label>
                <input
                  id="correo"
                  ref={correoRef}
                  type="email"
                  value={correo}
                  required
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    limpiarError('correo');
                  }}
                  placeholder="usuario@uvg.edu.gt"
                  className={AUTH_INPUT}
                  aria-invalid={errores.correo || credencialesInvalidas ? 'true' : 'false'}
                  aria-describedby={errores.correo ? 'correo-error' : credencialesInvalidas ? 'login-error' : undefined}
                />
                {errores.correo && <AuthFieldError id="correo-error">{errores.correo}</AuthFieldError>}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <label htmlFor="contrasena" className={AUTH_LABEL}>
                    Contraseña
                  </label>
                  <Link
                    href="/recuperar-contrasena"
                    className="font-label text-xs font-bold uppercase tracking-widest text-primary transition-all hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <input
                  id="contrasena"
                  ref={contrasenaRef}
                  type="password"
                  value={contrasena}
                  required
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    limpiarError('contrasena');
                  }}
                  placeholder="Mínimo 8 caracteres"
                  className={AUTH_INPUT}
                  aria-invalid={errores.contrasena || credencialesInvalidas ? 'true' : 'false'}
                  aria-describedby={errores.contrasena ? 'contrasena-error' : credencialesInvalidas ? 'login-error' : undefined}
                />
                {errores.contrasena && <AuthFieldError id="contrasena-error">{errores.contrasena}</AuthFieldError>}
              </div>

              {/* NL-T1: el error del servidor va aquí, junto al formulario. El éxito sí
                  se avisa por SweetAlert (ver useLogin). */}
              {errorLogin && (
                <Alert variant="destructive" id="login-error">
                  <AlertDescription className="space-y-1">
                    <p className="font-semibold">{mensajeError(errorLogin)}</p>
                    {avisoIntentos(errorLogin) && <p>{avisoIntentos(errorLogin)}</p>}
                    {credencialesInvalidas && (
                      <Link href="/recuperar-contrasena" className="font-bold underline">
                        ¿Olvidaste tu contraseña?
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Submit: deshabilitado mientras la petición está en curso */}
              <button type="submit" disabled={enviando} aria-busy={enviando} className={AUTH_PRIMARY_BUTTON}>
                {enviando && <Spinner aria-label="Cargando" />}
                {enviando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </form>

            {/* Divider */}
            <div className="my-8 flex w-full items-center">
              <div className="h-px flex-1 bg-surface-container-highest" />
              <span className="px-4 font-label text-[10px] font-bold uppercase tracking-widest text-outline-variant">
                O continúa con
              </span>
              <div className="h-px flex-1 bg-surface-container-highest" />
            </div>

            {/* Microsoft Login */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-surface-container-highest bg-surface-container-lowest py-4 font-headline font-bold text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-[0.98]"
            >
              {/* Colores de marca de Microsoft: fijos por identidad visual. */}
              <svg className="h-5 w-5" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span>Microsoft</span>
            </button>

            <p className="mt-10 text-center text-xs text-tertiary">
              ¿No tienes cuenta?{' '}
              <Link href="/registro" className="font-bold text-primary motion-link">
                Regístrate aquí
              </Link>
            </p>
          </div>
    </AuthSplitLayout>
  );
}
