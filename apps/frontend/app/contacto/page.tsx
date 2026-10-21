'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, ArrowLeft, CheckCircle, LifeBuoy } from 'lucide-react';
import { useCurrentUser, isAdminUser } from '@/hooks/use-current-user';
import { MENSAJE_CONTACTO_ENVIADO, mensajeErrorContacto, useEnviarContacto } from '@/hooks/use-enviar-contacto';
import { ContactForm, ContactFormSkeleton } from '@/components/contacto/contact-form';
import { contactFormDefaults } from '@/components/contacto/contact-form.schema';
import { ThemeToggle } from '@/components/theme-toggle';

import logo from '@/public/logo.png';
import img from '@/public/login-foto.jpg';

export default function ContactoPage() {
  const { data: user, isLoading } = useCurrentUser();
  const enviarContacto = useEnviarContacto();

  const volver = user
    ? { href: isAdminUser(user) ? '/dashboard/admin' : '/dashboard', label: 'Volver al panel' }
    : { href: '/', label: 'Volver al inicio' };

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body text-on-surface antialiased lg:flex-row">
      <div className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:w-1/2">
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
          <h2 className="mb-4 font-headline text-4xl font-extrabold text-white drop-shadow-lg">Estamos para ayudarte</h2>
          <p className="text-lg font-medium text-white/90 drop-shadow-md">
            Escribe a administración y te responderemos al correo que nos indiques.
          </p>
        </div>
      </div>

      <div className="relative flex w-full flex-col bg-surface lg:w-1/2">
        <header className="z-10 flex items-center justify-between px-8 py-6">
          <Link href={volver.href} className="flex items-center gap-2 text-outline transition-colors hover:text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">{volver.label}</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12 sm:px-12">
          <div className="w-full max-w-xl">
            <div className="mb-8 text-left">
              <Image src={logo} alt="UVGENIUS" className="mx-auto mb-4 h-28 w-auto" />
              <h1 className="flex items-center gap-3 font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                <LifeBuoy className="h-8 w-8 text-primary" aria-hidden="true" />
                Contacto y soporte
              </h1>
              <p className="mt-2 text-base text-tertiary">
                ¿Tienes un problema o una duda? Cuéntanos y administración te ayudará.
              </p>
            </div>

            {enviarContacto.isSuccess && (
              <div
                role="status"
                className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-on-surface"
              >
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-bold">Mensaje enviado</p>
                  <p className="text-tertiary">{MENSAJE_CONTACTO_ENVIADO}</p>
                </div>
              </div>
            )}

            {enviarContacto.isError && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-3 rounded-2xl border border-error/30 bg-error-container/40 p-4 text-sm text-on-surface"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
                <div>
                  <p className="font-bold">No se pudo enviar tu mensaje</p>
                  <p className="text-tertiary">{mensajeErrorContacto(enviarContacto.error)}</p>
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
        </main>

        <footer className="flex justify-between border-t border-surface-container-highest/50 px-8 py-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-outline">UVG 2025</span>
          <Link
            href="/"
            className="text-[10px] font-bold uppercase tracking-wider text-outline transition-colors hover:text-primary"
          >
            Inicio
          </Link>
        </footer>
      </div>
    </div>
  );
}
