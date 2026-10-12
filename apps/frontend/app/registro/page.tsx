'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRegister } from '@/hooks/use-register';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import { z } from 'zod';
import { correoInstitucionalEsperado, FORMATO_CORREO_INSTITUCIONAL } from '@/lib/validators/correo-institucional';
import {
  AUTH_FIELD_ERROR,
  AUTH_INPUT_COMPACT,
  AUTH_LABEL,
  AUTH_PRIMARY_BUTTON,
  AuthSplitLayout,
} from '@/components/auth/auth-split-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import logo from '@/public/logo.png';

const registerSchema = z
  .object({
    nombre: z
      .string({ required_error: 'El nombre es obligatorio' })
      .trim()
      .min(1, 'El nombre es obligatorio'),
    apellido: z
      .string({ required_error: 'El apellido es obligatorio' })
      .trim()
      .min(1, 'El apellido es obligatorio'),
    carne: z
      .string({ required_error: 'El carnet es obligatorio' })
      .trim()
      .min(1, 'El carnet es obligatorio'),
    correo: z
      .string({ required_error: 'El correo es obligatorio' })
      .trim()
      .toLowerCase()
      .min(1, 'El correo es obligatorio')
      .email('El correo es inválido')
      .refine((value) => value.endsWith('@uvg.edu.gt'), {
        message: 'El correo debe ser institucional (@uvg.edu.gt)',
      }),
    contrasena: z
      .string({ required_error: 'La contraseña es obligatoria' })
      .min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z
      .string({ required_error: 'Debes confirmar la contraseña' })
      .min(8, 'Debes confirmar la contraseña'),
    idCarrera: z
      .number({ required_error: 'Selecciona una carrera' })
      .int({ message: 'Selecciona una carrera' })
      .positive('Selecciona una carrera'),
    semestre: z
      .number({ required_error: 'Selecciona tu semestre' })
      .int({ message: 'El semestre es inválido' })
      .min(1, 'El semestre es inválido')
      .max(12, 'El semestre es inválido'),
  })
  .refine((data) => data.contrasena === data.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  })
  .superRefine((data, ctx) => {
    const correoEsperado = correoInstitucionalEsperado(data.apellido, data.carne);
    if (data.correo === correoEsperado) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['correo'],
      message: FORMATO_CORREO_INSTITUCIONAL.test(correoEsperado)
        ? `Tu correo debería ser ${correoEsperado}`
        : 'Revisa tu apellido y tu carnet: el correo lleva las 3 primeras letras del apellido y el número de carnet',
    });
  });

// Mismo desplegable de los filtros de búsqueda (`components/ui/select`), con el
// aspecto del campo de Login. `data-[size=default]:h-[50px]` iguala el alto de
// los demás campos (el `h-9` del disparador base solo cede a su misma variante)
// y un nombre de carrera largo se corta con puntos suspensivos en una línea.
const selectClass =
  `${AUTH_INPUT_COMPACT} min-w-0 text-base text-left data-[size=default]:h-[50px] aria-invalid:border-error *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate`;

// T-274 (OWASP): mensaje neutro para cualquier fallo del backend. Antes se
// mostraba error.message crudo (p. ej. "El correo ya esta registrado"), lo
// que permitia enumerar cuentas existentes.
export function mensajeError(error: (Error & { statusCode?: number }) | null): string {
  if (!error) return '';
  if (error.statusCode === 429) {
    return 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.';
  }
  return 'No se pudo completar el registro. Intenta de nuevo.';
}

export default function RegistroPage() {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [correoEditadoManualmente, setCorreoEditadoManualmente] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [carne, setCarne] = useState('');
  const [idCarrera, setIdCarrera] = useState<number>(0);
  const [semestre, setSemestre] = useState<number>(1);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const { mutate, isPending, isError, isSuccess: registroOk, error } = useRegister();

  const passwordStrength = useMemo(() => {
    if (!contrasena) return null;
    let score = 0;
    if (contrasena.length >= 8) score += 1;
    if (/[0-9]/.test(contrasena)) score += 1;
    if (/[A-Z]/.test(contrasena) && /[a-z]/.test(contrasena)) score += 1;
    if (/[^A-Za-z0-9]/.test(contrasena)) score += 1;

    if (contrasena.length < 6 || score <= 2) {
      return { variant: 'error' as const, label: 'Débil', width: '33%' };
    }
    if (score === 3) {
      return { variant: 'warning' as const, label: 'Media', width: '66%' };
    }
    return { variant: 'success' as const, label: 'Fuerte', width: '100%' };
  }, [contrasena]);

  const passwordsMatch = useMemo(() => {
    if (!confirmar) return null;
    return contrasena === confirmar;
  }, [contrasena, confirmar]);

  const selectedCarreraName =
    carreras.find((carrera) => carrera.idCarrera === idCarrera)?.nombreCarrera ?? '';

  useEffect(() => {
    getCarreras().then(setCarreras).catch(() => {});
  }, []);

  useEffect(() => {
    if (correoEditadoManualmente) return;
    if (apellido.trim() && carne.trim()) {
      const correoSugerido = correoInstitucionalEsperado(apellido, carne);
      const timeoutId = window.setTimeout(() => setCorreo(correoSugerido), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [apellido, carne, correoEditadoManualmente]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const resultado = registerSchema.safeParse({
      nombre,
      apellido,
      carne,
      correo,
      contrasena,
      confirmar,
      idCarrera,
      semestre,
    });

    if (!resultado.success) {
      const fieldErrors = resultado.error.flatten().fieldErrors;
      setErrores({
        nombre: fieldErrors.nombre?.[0],
        apellido: fieldErrors.apellido?.[0],
        carne: fieldErrors.carne?.[0],
        correo: fieldErrors.correo?.[0],
        contrasena: fieldErrors.contrasena?.[0],
        confirmar: fieldErrors.confirmar?.[0],
        idCarrera: fieldErrors.idCarrera?.[0],
        semestre: fieldErrors.semestre?.[0],
      });
      return;
    }

    setErrores({});

    const { confirmar: _omit, ...payload } = resultado.data;
    mutate(payload);
  }

  return (
    <AuthSplitLayout
      titulo="Comienza tu camino"
      descripcion="Registrate y accede a oportunidades de beca, extension y experiencia academica."
      panelDesplazable
    >
          <div className="w-full max-w-lg">
            {/* Branding */}
            <div className="mb-8 text-left">
              <Image src={logo} alt="UVGENIUS" className="mx-auto mb-4 h-28 w-auto" />
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Crear cuenta</h1>
              <p className="mt-2 text-base text-tertiary">Usa tu correo institucional para registrarte</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="nombre" className={AUTH_LABEL}>
                    Nombre
                  </label>
                  <input
                    id="nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      if (errores.nombre) setErrores((prev) => ({ ...prev, nombre: undefined }));
                    }}
                    placeholder="Juan"
                    className={AUTH_INPUT_COMPACT}
                    aria-invalid={errores.nombre ? 'true' : 'false'}
                    aria-describedby={errores.nombre ? 'nombre-error' : undefined}
                  />
                  {errores.nombre && (
                    <p id="nombre-error" role="alert" className={AUTH_FIELD_ERROR}>
                      {errores.nombre}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="apellido" className={AUTH_LABEL}>
                    Apellido
                  </label>
                  <input
                    id="apellido"
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => {
                      setApellido(e.target.value);
                      if (errores.apellido) setErrores((prev) => ({ ...prev, apellido: undefined }));
                    }}
                    placeholder="Perez"
                    className={AUTH_INPUT_COMPACT}
                    aria-invalid={errores.apellido ? 'true' : 'false'}
                    aria-describedby={errores.apellido ? 'apellido-error' : undefined}
                  />
                  {errores.apellido && (
                    <p id="apellido-error" role="alert" className={AUTH_FIELD_ERROR}>
                      {errores.apellido}
                    </p>
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label htmlFor="carne" className={AUTH_LABEL}>
                  Carnet
                </label>
                <input
                  id="carne"
                  type="text"
                  required
                  value={carne}
                  onChange={(e) => {
                    setCarne(e.target.value);
                    if (errores.carne) setErrores((prev) => ({ ...prev, carne: undefined }));
                  }}
                  placeholder="24000"
                  className={AUTH_INPUT_COMPACT}
                  aria-invalid={errores.carne ? 'true' : 'false'}
                  aria-describedby={errores.carne ? 'carne-error' : undefined}
                />
                {errores.carne && (
                  <p id="carne-error" role="alert" className={AUTH_FIELD_ERROR}>
                    {errores.carne}
                  </p>
                )}
              </div>

              <div className="min-w-0 space-y-1.5">
                <label htmlFor="correo" className={AUTH_LABEL}>
                  Correo institucional
                </label>
                <input
                  id="correo"
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCorreo(value);
                    setCorreoEditadoManualmente(value !== '');
                    if (errores.correo) setErrores((prev) => ({ ...prev, correo: undefined }));
                  }}
                  placeholder="usuario@uvg.edu.gt"
                  className={AUTH_INPUT_COMPACT}
                  aria-invalid={errores.correo ? 'true' : 'false'}
                  aria-describedby={errores.correo ? 'correo-error' : undefined}
                />
                {!correoEditadoManualmente && correo && (
                  <p className="text-xs text-primary">
                    Correo generado automaticamente. Puedes editarlo si lo necesitas.
                  </p>
                )}
                {errores.correo && (
                  <p id="correo-error" role="alert" className={AUTH_FIELD_ERROR}>
                    {errores.correo}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <label htmlFor="carrera" className={AUTH_LABEL}>
                    Carrera
                  </label>
                  <Select
                    value={idCarrera ? String(idCarrera) : ''}
                    onValueChange={(v) => {
                      setIdCarrera(Number(v));
                      if (errores.idCarrera) setErrores((prev) => ({ ...prev, idCarrera: undefined }));
                    }}
                  >
                    <SelectTrigger
                      id="carrera"
                      data-testid="registro-carrera-select"
                      className={selectClass}
                      aria-required="true"
                      aria-invalid={errores.idCarrera ? 'true' : 'false'}
                      aria-describedby={errores.idCarrera ? 'carrera-error' : undefined}
                    >
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {carreras.map((c) => (
                        <SelectItem key={c.idCarrera} value={String(c.idCarrera)} className="whitespace-normal">
                          {c.nombreCarrera}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores.idCarrera && (
                    <p id="carrera-error" role="alert" className={AUTH_FIELD_ERROR}>
                      {errores.idCarrera}
                    </p>
                  )}
                  {selectedCarreraName && (
                    <p className="break-words text-xs leading-snug text-tertiary">{selectedCarreraName}</p>
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label htmlFor="semestre" className={AUTH_LABEL}>
                    Semestre
                  </label>
                  <Select
                    value={String(semestre)}
                    onValueChange={(v) => {
                      setSemestre(Number(v));
                      if (errores.semestre) setErrores((prev) => ({ ...prev, semestre: undefined }));
                    }}
                  >
                    <SelectTrigger
                      id="semestre"
                      className={selectClass}
                      aria-required="true"
                      aria-invalid={errores.semestre ? 'true' : 'false'}
                      aria-describedby={errores.semestre ? 'semestre-error' : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores.semestre && (
                    <p id="semestre-error" role="alert" className={AUTH_FIELD_ERROR}>
                      {errores.semestre}
                    </p>
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label htmlFor="contrasena" className={AUTH_LABEL}>
                  Contraseña
                </label>
                <input
                  id="contrasena"
                  type="password"
                  required
                  minLength={8}
                  value={contrasena}
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    if (errores.contrasena) setErrores((prev) => ({ ...prev, contrasena: undefined }));
                  }}
                  placeholder="Minimo 8 caracteres"
                  className={AUTH_INPUT_COMPACT}
                  aria-invalid={errores.contrasena ? 'true' : 'false'}
                  aria-describedby={errores.contrasena ? 'contrasena-error' : undefined}
                />
                {passwordStrength && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-tertiary">
                      <span>Fuerza de la contraseña:</span>
                      <span
                        className={
                          passwordStrength.variant === 'error'
                            ? 'text-error'
                            : passwordStrength.variant === 'warning'
                              ? 'text-attention-strong dark:text-on-tag-amber'
                              : 'text-primary'
                        }
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    {/* T-251: relleno con los tokens vivos (no -container) de cada
                        familia, que sí contrastan >=3:1 contra la pista en oscuro. */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          passwordStrength.variant === 'error'
                            ? 'bg-error'
                            : passwordStrength.variant === 'warning'
                              ? 'bg-secondary'
                              : 'bg-primary'
                        }`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                  </div>
                )}
                {errores.contrasena && (
                  <p id="contrasena-error" role="alert" className={AUTH_FIELD_ERROR}>
                    {errores.contrasena}
                  </p>
                )}
              </div>

              <div className="min-w-0 space-y-1.5">
                <label htmlFor="confirmar" className={AUTH_LABEL}>
                  Confirmar contraseña
                </label>
                <input
                  id="confirmar"
                  type="password"
                  required
                  value={confirmar}
                  onChange={(e) => {
                    setConfirmar(e.target.value);
                    if (errores.confirmar) setErrores((prev) => ({ ...prev, confirmar: undefined }));
                  }}
                  placeholder="••••••••"
                  className={AUTH_INPUT_COMPACT}
                  aria-invalid={errores.confirmar ? 'true' : 'false'}
                  aria-describedby={errores.confirmar ? 'confirmar-error' : undefined}
                />
                {confirmar && (
                  <p className={`text-xs font-semibold ${passwordsMatch ? 'text-primary' : 'text-error'}`}>
                    {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                  </p>
                )}
                {errores.confirmar && (
                  <p id="confirmar-error" role="alert" className={AUTH_FIELD_ERROR}>
                    {errores.confirmar}
                  </p>
                )}
              </div>

              {/* T-219: un solo componente para carga/error/exito, sin popups. */}
              {(isPending || isError || registroOk) && (
                <Alert variant={registroOk ? 'success' : isError ? 'destructive' : 'default'}>
                  {isPending && <Spinner />}
                  <AlertDescription>
                    {registroOk
                      ? 'Cuenta creada. Administración debe verificarla antes de que puedas iniciar sesión.'
                      : isError
                        ? mensajeError(error as (Error & { statusCode?: number }) | null)
                        : 'Creando tu cuenta…'}
                  </AlertDescription>
                </Alert>
              )}

              <button type="submit" disabled={isPending} className={AUTH_PRIMARY_BUTTON}>
                Crear Cuenta
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-tertiary">
              Ya tienes cuenta?{' '}
              <Link href="/login" className="font-bold text-primary hover:underline">
                Inicia sesion
              </Link>
            </p>
          </div>
    </AuthSplitLayout>
  );
}
