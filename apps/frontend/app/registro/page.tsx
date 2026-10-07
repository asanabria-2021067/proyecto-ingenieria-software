'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRegister } from '@/hooks/use-register';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import { z } from 'zod';
import { correoInstitucionalEsperado, FORMATO_CORREO_INSTITUCIONAL } from '@/lib/validators/correo-institucional';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

import img from '@/public/login-foto.jpg';
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

const selectClass =
  'w-full rounded-control border border-outline-variant bg-card px-inline py-tight type-body transition-colors focus-visible:border-primary';

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
    <main className="relative flex min-h-screen items-center justify-center bg-page p-stack sm:p-section">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-card bg-card shadow-raised lg:grid-cols-2">
        {/* Branding panel: mismo patron que /login (bg-primary text-on-primary,
            foto del campus desvanecida detras via gradiente). */}
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
            <h2 className="type-display mt-tight text-on-primary">Comienza tu camino</h2>
            <p className="type-body mt-tight text-on-primary/85">
              Registrate y accede a oportunidades de beca, extension y experiencia academica.
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

          <div className="mb-stack">
            <Image src={logo} alt="UVGENIUS" className="mb-tight h-14 w-auto" />
            <h1 className="type-section">Crear cuenta</h1>
            <p className="type-body mt-micro text-text-secondary">
              Usa tu correo institucional para registrarte
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-tight">
            <div className="grid grid-cols-1 gap-tight sm:grid-cols-2">
              <div className="flex flex-col gap-tight">
                <Label htmlFor="nombre" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                  Nombre
                </Label>
                <Input
                  id="nombre"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    if (errores.nombre) setErrores((prev) => ({ ...prev, nombre: undefined }));
                  }}
                  placeholder="Juan"
                  aria-invalid={errores.nombre ? 'true' : 'false'}
                  aria-describedby={errores.nombre ? 'nombre-error' : undefined}
                />
                {errores.nombre && (
                  <p id="nombre-error" role="alert" className="type-meta text-on-status-error">
                    {errores.nombre}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-tight">
                <Label htmlFor="apellido" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                  Apellido
                </Label>
                <Input
                  id="apellido"
                  type="text"
                  required
                  value={apellido}
                  onChange={(e) => {
                    setApellido(e.target.value);
                    if (errores.apellido) setErrores((prev) => ({ ...prev, apellido: undefined }));
                  }}
                  placeholder="Perez"
                  aria-invalid={errores.apellido ? 'true' : 'false'}
                  aria-describedby={errores.apellido ? 'apellido-error' : undefined}
                />
                {errores.apellido && (
                  <p id="apellido-error" role="alert" className="type-meta text-on-status-error">
                    {errores.apellido}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-tight">
              <Label htmlFor="carne" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                Carnet
              </Label>
              <Input
                id="carne"
                type="text"
                required
                value={carne}
                onChange={(e) => {
                  setCarne(e.target.value);
                  if (errores.carne) setErrores((prev) => ({ ...prev, carne: undefined }));
                }}
                placeholder="24000"
                aria-invalid={errores.carne ? 'true' : 'false'}
                aria-describedby={errores.carne ? 'carne-error' : undefined}
              />
              {errores.carne && (
                <p id="carne-error" role="alert" className="type-meta text-on-status-error">
                  {errores.carne}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-tight">
              <Label htmlFor="correo" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                Correo institucional
              </Label>
              <Input
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
                aria-invalid={errores.correo ? 'true' : 'false'}
                aria-describedby={errores.correo ? 'correo-error' : undefined}
              />
              {!correoEditadoManualmente && correo && (
                <p className="type-meta text-primary">
                  Correo generado automaticamente. Puedes editarlo si lo necesitas.
                </p>
              )}
              {errores.correo && (
                <p id="correo-error" role="alert" className="type-meta text-on-status-error">
                  {errores.correo}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-tight md:grid-cols-3">
              <div className="flex flex-col gap-tight md:col-span-2">
                <Label htmlFor="carrera" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                  Carrera
                </Label>
                <select
                  id="carrera"
                  data-testid="registro-carrera-select"
                  required
                  value={idCarrera}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setIdCarrera(value);
                    if (errores.idCarrera) setErrores((prev) => ({ ...prev, idCarrera: undefined }));
                  }}
                  className={selectClass}
                  aria-invalid={errores.idCarrera ? 'true' : 'false'}
                  aria-describedby={errores.idCarrera ? 'carrera-error' : undefined}
                >
                  <option value={0}>Seleccionar...</option>
                  {carreras.map((c) => (
                    <option key={c.idCarrera} value={c.idCarrera} title={c.nombreCarrera}>
                      {c.nombreCarrera}
                    </option>
                  ))}
                </select>
                {errores.idCarrera && (
                  <p id="carrera-error" role="alert" className="type-meta text-on-status-error">
                    {errores.idCarrera}
                  </p>
                )}
                {selectedCarreraName && (
                  <p className="type-meta break-words leading-snug text-text-secondary">{selectedCarreraName}</p>
                )}
              </div>
              <div className="flex flex-col gap-tight">
                <Label htmlFor="semestre" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                  Semestre
                </Label>
                <select
                  id="semestre"
                  required
                  value={semestre}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setSemestre(value);
                    if (errores.semestre) setErrores((prev) => ({ ...prev, semestre: undefined }));
                  }}
                  className={selectClass}
                  aria-invalid={errores.semestre ? 'true' : 'false'}
                  aria-describedby={errores.semestre ? 'semestre-error' : undefined}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {errores.semestre && (
                  <p id="semestre-error" role="alert" className="type-meta text-on-status-error">
                    {errores.semestre}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-tight">
              <Label htmlFor="contrasena" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                Contrasena
              </Label>
              <Input
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
                aria-invalid={errores.contrasena ? 'true' : 'false'}
                aria-describedby={errores.contrasena ? 'contrasena-error' : undefined}
              />
              {passwordStrength && (
                <div className="flex flex-col gap-micro">
                  <div className="flex items-center justify-between type-meta font-bold text-text-secondary">
                    <span>Fuerza de la contraseña:</span>
                    <span
                      className={
                        passwordStrength.variant === 'error'
                          ? 'text-on-status-error'
                          : passwordStrength.variant === 'warning'
                            ? 'text-on-status-warning'
                            : 'text-primary'
                      }
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                  {/* T-251: relleno con los tokens vivos (no -container) de cada
                      familia, que sí contrastan >=3:1 contra la pista en oscuro. */}
                  <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-container-highest">
                    <div
                      className={`h-full rounded-pill transition-all duration-500 ${
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
                <p id="contrasena-error" role="alert" className="type-meta text-on-status-error">
                  {errores.contrasena}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-tight">
              <Label htmlFor="confirmar" className="type-meta font-bold uppercase tracking-widest text-text-secondary">
                Confirmar Contrasena
              </Label>
              <Input
                id="confirmar"
                type="password"
                required
                value={confirmar}
                onChange={(e) => {
                  setConfirmar(e.target.value);
                  if (errores.confirmar) setErrores((prev) => ({ ...prev, confirmar: undefined }));
                }}
                placeholder="••••••••"
                aria-invalid={errores.confirmar ? 'true' : 'false'}
                aria-describedby={errores.confirmar ? 'confirmar-error' : undefined}
              />
              {confirmar && (
                <p className={`type-meta font-semibold ${passwordsMatch ? 'text-primary' : 'text-on-status-error'}`}>
                  {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                </p>
              )}
              {errores.confirmar && (
                <p id="confirmar-error" role="alert" className="type-meta text-on-status-error">
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
                    ? 'Cuenta creada. Redirigiendo…'
                    : isError
                      ? mensajeError(error as (Error & { statusCode?: number }) | null)
                      : 'Creando tu cuenta…'}
                </AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isPending} className="mt-tight w-full">
              Crear Cuenta
            </Button>
          </form>

          <p className="mt-stack text-center type-meta text-text-secondary">
            Ya tienes cuenta?{' '}
            <Link href="/login" className="font-bold text-primary hover:underline">
              Inicia sesion
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
