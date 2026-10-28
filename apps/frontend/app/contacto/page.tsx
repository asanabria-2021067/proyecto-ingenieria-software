'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { AlertCircle, ArrowLeft, BellRing, CheckCircle, Clock, LifeBuoy, type LucideIcon } from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { MENSAJE_CONTACTO_ENVIADO, mensajeErrorContacto, useEnviarContacto } from '@/hooks/use-enviar-contacto';
import { ContactForm, ContactFormSkeleton } from '@/components/contacto/contact-form';
import { contactFormDefaults } from '@/components/contacto/contact-form.schema';
import { IlustracionUvg } from '@/components/contacto/ilustracion-uvg';
import { useAnimacionEntrada } from '@/components/contacto/use-animacion-entrada';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';

interface TarjetaInformativa {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  enlace?: { href: string; texto: string; antes: string };
}

const TARJETAS: TarjetaInformativa[] = [
  {
    icono: BellRing,
    titulo: 'Llega a administración',
    descripcion:
      'Tu mensaje le llega como notificación dentro de la plataforma a todo el equipo de administración. No se envía a ningún correo externo.',
  },
  {
    icono: Clock,
    titulo: 'Tiempo de respuesta',
    descripcion: 'Administración revisa los mensajes en días hábiles y se pondrá en contacto contigo usando el correo que indiques.',
  },
  {
    icono: LifeBuoy,
    titulo: '¿Para qué usarlo?',
    descripcion: 'Dudas sobre proyectos, horas o postulaciones, problemas con tu cuenta o errores que encuentres en la plataforma.',
    enlace: { antes: '¿Olvidaste tu contraseña? Usa la', href: '/recuperar-contrasena', texto: 'recuperación de contraseña' },
  },
];

export default function ContactoPage() {
  const { data: user, isLoading } = useCurrentUser();
  const enviarContacto = useEnviarContacto();
  const raiz = useRef<HTMLDivElement>(null);
  useAnimacionEntrada(raiz);

  const volver = user
    ? { href: isAdminUser(user) ? '/dashboard/admin' : '/dashboard', label: 'Volver al panel' }
    : { href: '/', label: 'Volver al inicio' };

  return (
    <div ref={raiz} className="flex min-h-screen flex-col overflow-x-hidden bg-page font-body text-text-primary antialiased">
      <header className="z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href={volver.href}
          className="flex items-center gap-2 rounded-control text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">{volver.label}</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-8">
          <div data-contacto-encabezado className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <span className="pill pill-success">Contacto</span>
            <h1 className="mt-4 font-headline text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
              Contacto y soporte
            </h1>
            <p className="mt-4 text-base text-text-secondary sm:text-lg">
              ¿Tienes un problema o una duda? Cuéntanos y administración te ayudará.
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-12">
            <div data-contacto-columna className="flex flex-col">
              <h2 className="font-headline text-2xl font-bold text-text-primary">Ponte en contacto</h2>
              <ul className="mt-6 space-y-4">
                {TARJETAS.map(({ icono: Icono, titulo, descripcion, enlace }) => (
                  <li
                    key={titulo}
                    data-contacto-tarjeta
                    className="flex gap-4 rounded-2xl border border-outline-variant bg-card p-4 shadow-sm"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icono className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-headline text-base font-bold text-text-primary">{titulo}</h3>
                      <p className="mt-1 text-sm text-text-secondary">{descripcion}</p>
                      {enlace && (
                        <p className="mt-2 text-sm text-text-secondary">
                          {enlace.antes}{' '}
                          <Link href={enlace.href} className="font-bold text-primary underline-offset-4 hover:underline">
                            {enlace.texto}
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="relative mt-8 overflow-hidden rounded-3xl">
                <IlustracionUvg className="max-w-sm py-4 sm:max-w-md" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-page via-page/70 to-transparent" />
              </div>
            </div>

            <div
              data-contacto-columna
              className="h-fit rounded-3xl border border-outline-variant bg-card p-6 shadow-card sm:p-8"
            >
              <h2 className="font-headline text-2xl font-bold text-text-primary">Envía un mensaje</h2>
              <p className="mt-1 text-sm text-text-secondary">Todos los campos son obligatorios.</p>
              <Separator className="my-6 bg-outline-variant" />

              {enviarContacto.isSuccess && (
                <div
                  role="status"
                  className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-text-primary"
                >
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Mensaje enviado</p>
                    <p className="text-text-secondary">{MENSAJE_CONTACTO_ENVIADO}</p>
                  </div>
                </div>
              )}

              {enviarContacto.isError && (
                <div
                  role="alert"
                  className="mb-6 flex items-start gap-3 rounded-2xl border border-error/40 bg-error-container/40 p-4 text-sm text-text-primary"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
                  <div>
                    <p className="font-bold">No se pudo enviar tu mensaje</p>
                    <p className="text-text-secondary">{mensajeErrorContacto(enviarContacto.error)}</p>
                  </div>
                </div>
              )}

              {isLoading ? (
                <ContactFormSkeleton />
              ) : (
                <ContactForm
                  key={user?.idUsuario ?? 'visitante'}
                  defaultValues={contactFormDefaults(user)}
                  onSubmit={enviarContacto.mutateAsync}
                  isPending={enviarContacto.isPending}
                />
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex w-full max-w-6xl justify-between px-4 py-6 sm:px-6 lg:px-8">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">UVG 2025</span>
          <Link
            href="/"
            className="text-[10px] font-bold uppercase tracking-wider text-text-secondary transition-colors hover:text-primary"
          >
            Inicio
          </Link>
        </div>
      </footer>
    </div>
  );
}
