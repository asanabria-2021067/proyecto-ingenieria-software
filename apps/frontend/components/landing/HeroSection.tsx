import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-32 px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-8">
          <div className="inline-block px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold tracking-widest uppercase">
            Plataforma Universitaria UVG
          </div>
          <h1 className="font-headline font-extrabold text-5xl md:text-7xl text-on-surface leading-[1.1] tracking-tight">
            Todas las oportunidades universitarias en un solo lugar
          </h1>
          <p className="text-lg text-tertiary max-w-xl leading-relaxed">
            Actualmente, muchas oportunidades (horas beca, extensión y proyectos)
            se comparten principalmente boca en boca, por amistades y
            contactos. UVG Scholar formaliza el acceso para que puedas
            descubrir, crear y postular proyectos desde una plataforma.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link
              href="/login"
              className="bg-primary text-on-primary px-8 py-4 rounded-xl font-headline font-bold text-lg hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
            >
              Explorar Proyectos
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="bg-surface-container-high text-on-surface px-8 py-4 rounded-xl font-headline font-bold text-lg hover:bg-surface-container-highest hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
            >
              Crear mi Proyecto
            </Link>
          </div>
        </div>
        <div className="lg:col-span-5 relative">
          <div className="aspect-square rounded-[3rem] bg-surface-container-low overflow-hidden shadow-2xl relative z-10">
            <img
              alt="Estudiantes colaborando en la universidad"
              className="w-full h-full object-cover"
              src="https://res.cloudinary.com/uvggt/image/upload/q_auto:best,f_auto,w_1200/v1768599742/2026/01%20Enero/Induccion%20estudiantes/Induccion-2026-Portada.jpg"
            />
          </div>
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-secondary-container rounded-full mix-blend-multiply filter blur-2xl opacity-70" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary-container rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
        </div>
      </div>
    </section>
  );
}
