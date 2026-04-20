"use client";

import Image from "next/image";
import { CheckCircle2, ClipboardCheck, Target } from "lucide-react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import HowItWorks from "@/components/landing/HowItWorks";

const bullets = [
  {
    icon: ClipboardCheck,
    title: "Flujo claro",
    text: "Postulaciones, revisiones y estados en un mismo flujo.",
  },
  {
    icon: Target,
    title: "Seguimiento real",
    text: "Hitos, tareas y horas con trazabilidad para cada equipo.",
  },
  {
    icon: CheckCircle2,
    title: "Resultados medibles",
    text: "Toda colaboracion queda registrada y verificable.",
  },
];

export default function FormalizaExperienceSection() {
  return (
    <div className="bg-surface">
      <ContainerScroll
        titleComponent={
          <>
            <h2 className="text-3xl font-bold text-on-surface md:text-5xl">
              Una plataforma que lo formaliza todo
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-tertiary md:text-lg">
              Descubrir, postular, colaborar y cerrar proyectos en una sola experiencia.
            </p>
          </>
        }
      >
        <div className="grid h-full w-full grid-cols-1 bg-surface-container-lowest md:grid-cols-2">
          <div className="relative min-h-[18rem] md:min-h-0">
            <Image
              src="/Foto-expereinincia-Portada.jpg"
              alt="Estudiantes colaborando"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/50 via-transparent to-transparent" />
          </div>

          <div className="flex flex-col justify-center gap-4 p-6 md:p-10">
            {bullets.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-outline-variant bg-surface p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-bold text-on-surface md:text-lg">{item.title}</h3>
                  </div>
                  <p className="text-sm text-tertiary">{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </ContainerScroll>

      <HowItWorks />
    </div>
  );
}
