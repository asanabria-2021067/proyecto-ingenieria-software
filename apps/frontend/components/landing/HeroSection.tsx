import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

import img1 from '@/public/Foto-expereinincia-Portada.jpg'

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden px-8 pb-32 pt-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <div className="inline-block rounded-full bg-secondary-container px-3 py-1 text-xs font-bold uppercase tracking-widest text-on-secondary-container">
            Plataforma Universitaria UVG
          </div>
          <h1 className="font-headline text-5xl font-extrabold leading-[1.1] tracking-tight text-on-surface md:text-7xl">
            Todas las oportunidades universitarias en un solo lugar
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-tertiary">
            Actualmente, muchas oportunidades (horas beca, extension y proyectos) se comparten
            principalmente boca en boca, por amistades y contactos. UVG Scholar formaliza el
            acceso para que puedas descubrir, crear y postular proyectos desde una plataforma.
          </p>
          <div className="flex flex-col gap-4 pt-4 sm:flex-row">
            <Link
              href="/login"
              className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-headline text-lg font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              Explorar Proyectos
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center rounded-xl bg-surface-container-high px-8 py-4 font-headline text-lg font-bold text-on-surface transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface-container-highest hover:shadow-lg active:scale-95"
            >
              Crear mi Proyecto
            </Link>
          </div>
        </div>
        <div className="relative lg:col-span-5">
          <div className="relative z-10 aspect-square overflow-hidden rounded-[3rem] bg-surface-container-low shadow-2xl transition-transform duration-700 hover:scale-[1.02]">
            <Image
              alt="Estudiantes colaborando en la universidad"
              className="h-full w-full object-cover"
              src={img1}
              fill
            />
          </div>
          <div className="absolute -right-6 -top-6 h-32 w-32 animate-pulse rounded-full bg-secondary-container opacity-70 mix-blend-multiply blur-2xl" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 animate-pulse rounded-full bg-primary-container opacity-30 mix-blend-multiply blur-3xl [animation-delay:1s]" />
        </div>
      </div>
    </section>
  );
}
