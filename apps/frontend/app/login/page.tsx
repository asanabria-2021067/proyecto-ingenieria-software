'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useLogin } from '@/hooks/use-login';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { z } from 'zod';
import { aviso } from '@/lib/mensajes';
import { MOTIVO_SESION_EXPIRADA, readNextFromLocation } from '@/lib/api/session';
import { AUTH_FIELD_ERROR, AUTH_INPUT, AUTH_LABEL, AUTH_PRIMARY_BUTTON, AuthSplitLayout } from '@/components/auth/auth-split-layout';

import logo from '@/public/logo.png';

/**
 * IESUC-568 (B4): borde y halo de error del campo con aria-invalid="true". Va en
 * el contenedor para que el input conserve las clases que comparte con Registro.
 */
const CAMPO_CON_ERROR =
  '[&_input[aria-invalid=true]]:border-error [&_input[aria-invalid=true]]:ring-2 [&_input[aria-invalid=true]]:ring-error/20';

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
/** Único mensaje para credenciales inválidas: no revela si falló el correo o la contraseña. */
export const MENSAJE_CREDENCIALES = 'No se pudo iniciar sesion. Verifica tu correo y contraseña.';

export function mensajeError(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return '';
  if (error.statusCode === 429) {
    return 'Demasiados intentos de inicio de sesion. Espera un minuto antes de volver a intentarlo.';
  }
  if (error.statusCode === 403) {
    return 'Tu cuenta está pendiente de verificación por administración.';
  }
  return MENSAJE_CREDENCIALES;
}

export default function LoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<{ correo?: string; contrasena?: string }>({});
  // IESUC-568 (B4): el 401 se muestra junto a los campos, sin decir cuál falló.
  const [credencialesInvalidas, setCredencialesInvalidas] = useState(false);
  const { mutate, isPending } = useLogin({ onCredencialesInvalidas: () => setCredencialesInvalidas(true) });
  const correoInvalido = Boolean(errores.correo) || credencialesInvalidas;
  const contrasenaInvalida = Boolean(errores.contrasena) || credencialesInvalidas;
  const describirCampo = (idErrorCampo: string, tieneErrorCampo: boolean) =>
    [tieneErrorCampo ? idErrorCampo : null, credencialesInvalidas ? 'login-error' : null].filter(Boolean).join(' ') ||
    undefined;
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
    setCredencialesInvalidas(false);
    mutate(resultado.data);
  }

  return (
    <AuthSplitLayout
      titulo="Excelencia que trasciende"
      descripcion="Unete a la comunidad academica lider en ciencia y tecnologia de Guatemala."
    >
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

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email */}
              <div className={`space-y-2 ${CAMPO_CON_ERROR}`}>
                <label htmlFor="correo" className={AUTH_LABEL}>
                  Correo Institucional
                </label>
                <input
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
                  className={AUTH_INPUT}
                  aria-invalid={correoInvalido ? 'true' : 'false'}
                  aria-describedby={describirCampo('correo-error', Boolean(errores.correo))}
                />
                {errores.correo && (
                  <p id="correo-error" role="alert" className={AUTH_FIELD_ERROR}>{errores.correo}</p>
                )}
              </div>

              {/* Password */}
              <div className={`space-y-2 ${CAMPO_CON_ERROR}`}>
                <div className="flex items-end justify-between">
                  <label htmlFor="contrasena" className={AUTH_LABEL}>
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
                  className={AUTH_INPUT}
                  aria-invalid={contrasenaInvalida ? 'true' : 'false'}
                  aria-describedby={describirCampo('contrasena-error', Boolean(errores.contrasena))}
                />
                {errores.contrasena && (
                  <p id="contrasena-error" role="alert" className={AUTH_FIELD_ERROR}>{errores.contrasena}</p>
                )}
              </div>

              {/* T-274: el éxito, el bloqueo por intentos (429) y la cuenta pendiente
                  (403) siguen en SweetAlert (ver useLogin). IESUC-568 (B4): las
                  credenciales inválidas se explican aquí, junto a los dos campos, con
                  el mismo mensaje neutro (nunca se dice si falló el correo o la clave). */}
              {credencialesInvalidas && (
                <div
                  id="login-error"
                  role="alert"
                  className="space-y-1.5 rounded-xl border-2 border-error px-4 py-3 text-left text-sm text-on-surface"
                >
                  <p className="font-bold text-error">{MENSAJE_CREDENCIALES}</p>
                  <p>
                    Revisa que sea tu correo institucional completo y que la contraseña esté bien escrita
                    (distingue mayúsculas y minúsculas). Si no la recuerdas, puedes crear una nueva.
                  </p>
                  <Link href="/recuperar-contrasena" className="inline-block font-bold text-primary underline">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isPending}
                className={AUTH_PRIMARY_BUTTON}
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
              No tienes cuenta?{' '}
              <Link href="/registro" className="font-bold text-primary hover:underline">
                Registrate aqui
              </Link>
            </p>
          </div>
    </AuthSplitLayout>
  );
}
