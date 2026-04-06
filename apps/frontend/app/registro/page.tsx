'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRegister } from '@/hooks/use-register';
import { getCarreras, type Carrera } from '@/lib/services/catalogs';
import uvgSwal from '@/lib/swal';

import img from '@/public/login-foto.jpg';
import logo from '@/public/logo.png';

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
  const { mutate, isPending } = useRegister();

  useEffect(() => {
    getCarreras().then(setCarreras).catch(() => {});
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (contrasena !== confirmar) {
      uvgSwal.fire({ icon: 'warning', title: 'Error', text: 'Las contrasenas no coinciden' });
      return;
    }
    if (!correo.endsWith('@uvg.edu.gt')) {
      uvgSwal.fire({ icon: 'warning', title: 'Error', text: 'El correo debe ser @uvg.edu.gt' });
      return;
    }
    if (idCarrera === 0) {
      uvgSwal.fire({ icon: 'warning', title: 'Error', text: 'Selecciona una carrera' });
      return;
    }

    mutate({ correo, contrasena, nombre, apellido, carne, idCarrera, semestre });
  }

  const inputClass =
    'w-full rounded-xl border border-surface-container-highest bg-white px-4 py-3 font-body text-on-surface shadow-sm placeholder:text-outline-variant transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
  const labelClass =
    'font-label text-xs font-bold uppercase tracking-widest text-tertiary';

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-surface font-body text-on-surface antialiased lg:flex-row">
      {/* Left Column: Image */}
      <div className="relative hidden overflow-hidden lg:block lg:w-1/2">
        <img
          alt="Estudiantes UVG"
          className="absolute inset-0 h-full w-full object-cover"
          src={img.src}
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
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-left">
              <img src={logo.src} alt="UVG Scholar" className="h-28 w-auto mx-auto mb-4" />
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
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Juan"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Apellido</label>
                  <input
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    placeholder="Perez"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Correo Institucional</label>
                <input
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="usuario@uvg.edu.gt"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Carne</label>
                <input
                  type="text"
                  required
                  value={carne}
                  onChange={(e) => setCarne(e.target.value)}
                  placeholder="24000"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={labelClass}>Carrera</label>
                  <select
                    required
                    value={idCarrera}
                    onChange={(e) => setIdCarrera(Number(e.target.value))}
                    className={inputClass}
                  >
                    <option value={0}>Seleccionar...</option>
                    {carreras.map((c) => (
                      <option key={c.idCarrera} value={c.idCarrera}>
                        {c.nombreCarrera}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Semestre</label>
                  <select
                    required
                    value={semestre}
                    onChange={(e) => setSemestre(Number(e.target.value))}
                    className={inputClass}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Contrasena</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="Minimo 8 caracteres"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Confirmar Contrasena</label>
                <input
                  type="password"
                  required
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="--------"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-primary-container py-4 font-headline font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-primary active:scale-[0.98] disabled:opacity-60"
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
