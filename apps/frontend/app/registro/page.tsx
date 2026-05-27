'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRegister } from '@/hooks/use-register';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import uvgSwal from '@/lib/swal';
import { z } from 'zod';
import { ThemeToggle } from '@/components/theme-toggle';

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
  });

export default function RegistroPage() {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [carne, setCarne] = useState('');
  const [idCarrera, setIdCarrera] = useState<number>(0);
  const [semestre, setSemestre] = useState<number>(1);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const { mutate, isPending } = useRegister();

  const passwordStrength = useMemo(() => {
    if (!contrasena) return null;
    let score = 0;
    if (contrasena.length >= 8) score += 1;
    if (/[0-9]/.test(contrasena)) score += 1;
    if (/[A-Z]/.test(contrasena) && /[a-z]/.test(contrasena)) score += 1;
    if (/[^A-Za-z0-9]/.test(contrasena)) score += 1;

    if (contrasena.length < 6) {
      return { score: 1, label: 'Muy débil ⚠️', color: 'bg-red-500', width: '33%' };
    }
    if (score <= 2) {
      return { score: 1, label: 'Débil ⚠️', color: 'bg-red-500', width: '33%' };
    }
    if (score === 3) {
      return { score: 2, label: 'Media 🔑', color: 'bg-amber-500', width: '66%' };
    }
    return { score: 3, label: 'Fuerte 🔒', color: 'bg-green-600', width: '100%' };
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
    if (apellido && carne) {
      const apellidoTrimmed = apellido.trim();
      const carneTrimmed = carne.trim();
      if (apellidoTrimmed && carneTrimmed) {
        const firstThreeLetters = apellidoTrimmed.substring(0, 3).toLowerCase();
        const generatedEmail = `${firstThreeLetters}${carneTrimmed}@uvg.edu.gt`;
        setCorreo(generatedEmail);
      }
    }
  }, [apellido, carne]);

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
      const formErrors = resultado.error.flatten().formErrors;
      if (formErrors.length) {
        uvgSwal.fire({ icon: 'warning', title: 'Error', text: formErrors[0] });
      }
      return;
    }

    setErrores({});

    const { confirmar: _omit, ...payload } = resultado.data;
    mutate(payload);
  }

  const inputClass =
    'w-full rounded-xl border border-surface-container-highest bg-white dark:bg-surface-container px-4 py-3 font-body text-on-surface shadow-sm placeholder:text-tertiary/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
  const labelClass =
    'font-label text-xs font-bold uppercase tracking-widest text-tertiary';

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-surface font-body text-on-surface antialiased lg:flex-row">
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
            Comienza tu camino
          </h2>
          <p className="text-lg font-medium text-white/90 drop-shadow-md">
            Registrate y accede a oportunidades de beca, extension y experiencia academica.
          </p>
        </div>
      </div>

      {/* Right Column: Form */}
      <div className="relative flex w-full flex-col bg-surface lg:w-1/2">
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
          <div className="w-full max-w-lg">
            <div className="mb-8 text-left">
              <Image src={logo} alt="UVGENIUS" className="h-28 w-auto mx-auto mb-4" />
              <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                Crear cuenta
              </h1>
              <p className="mt-2 text-base text-tertiary">
                Usa tu correo institucional para registrarte
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value);
                      if (errores.nombre) {
                        setErrores((prev) => ({ ...prev, nombre: undefined }));
                      }
                    }}
                    placeholder="Juan"
                    className={inputClass}
                  />
                  {errores.nombre && <p className="text-xs text-error">{errores.nombre}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Apellido</label>
                  <input
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => {
                      setApellido(e.target.value);
                      if (errores.apellido) {
                        setErrores((prev) => ({ ...prev, apellido: undefined }));
                      }
                    }}
                    placeholder="Perez"
                    className={inputClass}
                  />
                  {errores.apellido && <p className="text-xs text-error">{errores.apellido}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Carnet</label>
                <input
                  type="text"
                  required
                  value={carne}
                  onChange={(e) => {
                    setCarne(e.target.value);
                    if (errores.carne) {
                      setErrores((prev) => ({ ...prev, carne: undefined }));
                    }
                  }}
                  placeholder="24000"
                  className={inputClass}
                />
                {errores.carne && <p className="text-xs text-error">{errores.carne}</p>}
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Correo Institucional</label>
                <input
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => {
                    setCorreo(e.target.value);
                    if (errores.correo) {
                      setErrores((prev) => ({ ...prev, correo: undefined }));
                    }
                  }}
                  placeholder="usuario@uvg.edu.gt"
                  className={`${inputClass} ${correo && apellido && carne ? 'bg-green-50 dark:bg-green-950/20' : ''}`}
                  readOnly={!!(apellido && carne && correo)}
                />
                {correo && apellido && carne && (
                  <p className="text-xs text-green-600">
                    ✓ Correo generado automáticamente
                  </p>
                )}
                {errores.correo && <p className="text-xs text-error">{errores.correo}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <label className={labelClass}>Carrera</label>
                  <select
                    required
                    value={idCarrera}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setIdCarrera(value);
                      if (errores.idCarrera) {
                        setErrores((prev) => ({ ...prev, idCarrera: undefined }));
                      }
                    }}
                    className={`${inputClass} pr-10`}
                  >
                    <option value={0}>Seleccionar...</option>
                    {carreras.map((c) => (
                      <option key={c.idCarrera} value={c.idCarrera} title={c.nombreCarrera}>
                        {c.nombreCarrera}
                      </option>
                    ))}
                  </select>
                  {errores.idCarrera && <p className="text-xs text-error">{errores.idCarrera}</p>}
                  {selectedCarreraName && (
                    <p className="text-xs text-tertiary break-words leading-snug">
                      {selectedCarreraName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Semestre</label>
                  <select
                    required
                    value={semestre}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setSemestre(value);
                      if (errores.semestre) {
                        setErrores((prev) => ({ ...prev, semestre: undefined }));
                      }
                    }}
                    className={inputClass}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {errores.semestre && <p className="text-xs text-error">{errores.semestre}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Contrasena</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={contrasena}
                  onChange={(e) => {
                    setContrasena(e.target.value);
                    if (errores.contrasena) {
                      setErrores((prev) => ({ ...prev, contrasena: undefined }));
                    }
                  }}
                  placeholder="Minimo 8 caracteres"
                  className={inputClass}
                />
                {passwordStrength && (
                  <div className="mt-2 space-y-1.5 transition-all duration-300">
                    <div className="flex items-center justify-between text-[11px] font-bold text-tertiary">
                      <span>Fuerza de la contraseña:</span>
                      <span className={passwordStrength.score === 1 ? 'text-red-500' : passwordStrength.score === 2 ? 'text-amber-600' : 'text-green-600'}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${passwordStrength.color}`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                  </div>
                )}
                {errores.contrasena && <p className="text-xs text-error">{errores.contrasena}</p>}
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Confirmar Contrasena</label>
                <input
                  type="password"
                  required
                  value={confirmar}
                  onChange={(e) => {
                    setConfirmar(e.target.value);
                    if (errores.confirmar) {
                      setErrores((prev) => ({ ...prev, confirmar: undefined }));
                    }
                  }}
                  placeholder="••••••••"
                  className={inputClass}
                />
                {confirmar && (
                  <p className={`mt-1.5 text-xs font-semibold ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordsMatch ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                  </p>
                )}
                {errores.confirmar && <p className="text-xs text-error">{errores.confirmar}</p>}
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary dark:hover:bg-[#153e26] active:scale-[0.98] disabled:opacity-60"
              >
                {isPending ? 'Creando cuenta...' : 'Crear Cuenta'}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-tertiary">
              Ya tienes cuenta?{' '}
              <Link href="/login" className="font-bold text-primary hover:underline">
                Inicia sesion
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
