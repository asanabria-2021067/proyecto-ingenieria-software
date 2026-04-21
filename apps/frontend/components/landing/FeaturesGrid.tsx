"use client";

import { useRef } from "react";
import { GraduationCap, HeartHandshake, Network } from "lucide-react";
import { Sparkles } from "@/components/ui/sparkles";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { TimelineContent } from "@/components/ui/timeline-animation";

const revealVariants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.12,
      duration: 0.5,
    },
  }),
  hidden: {
    filter: "blur(10px)",
    y: -20,
    opacity: 0,
  },
};

const features = [
  {
    icon: GraduationCap,
    title: "Oportunidades de boca en boca",
    description:
      "Actualmente, las oportunidades (horas beca, extension y proyectos) se comparten principalmente por amistades y contactos. No todos se enteran a tiempo.",
    variant: "light" as const,
  },
  {
    icon: HeartHandshake,
    title: "Acceso desigual",
    description:
      "El acceso a oportunidades depende de a quien conoces, no de tu experiencia. La plataforma busca que la decision se base en tu perfil y en el interes de cada proyecto.",
    variant: "primary" as const,
  },
  {
    icon: Network,
    title: "Sin seguimiento formal",
    description:
      "No hay una forma consistente de dar seguimiento a tareas, hitos y el progreso de los proyectos. Se pierde claridad y se dificulta la continuidad.",
    variant: "light" as const,
  },
];

export default function FeaturesGrid() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      id="el-problema"
      className="relative min-h-[110svh] scroll-mt-32 overflow-hidden bg-surface-container-low px-4 py-24 sm:px-6 md:min-h-[120svh] md:py-32 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-10 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--gradient-color)_0%,transparent_70%)] opacity-30 blur-2xl" />
        <Sparkles
          density={250}
          speed={0.8}
          minSpeed={0.2}
          opacity={0.8}
          color="var(--sparkles-color)"
          className="absolute inset-0 [mask-image:radial-gradient(55%_55%_at_50%_0%,black_35%,transparent_100%)]"
        />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-16 space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            El problema hoy
          </span>
          <h2 className="mt-2 font-headline text-4xl font-bold text-on-surface md:text-5xl">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.08}
              staggerFrom="first"
              containerClassName="items-start justify-start"
              transition={{
                type: "spring",
                stiffness: 250,
                damping: 36,
              }}
            >
              Que problema resolvemos?
            </VerticalCutReveal>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isPrimary = feature.variant === "primary";

            return (
              <TimelineContent
                key={feature.title}
                animationNum={index}
                timelineRef={sectionRef}
                customVariants={revealVariants}
                className={`flex h-full flex-col justify-between space-y-6 rounded-[2rem] p-8 transition-all duration-300 ${
                  isPrimary
                    ? "bg-primary text-on-primary shadow-xl hover:-translate-y-1 hover:shadow-2xl"
                    : "bg-surface-container-lowest hover:-translate-y-1 hover:shadow-xl"
                }`}
              >
                <div className="space-y-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 hover:scale-110 ${
                      isPrimary
                        ? "bg-on-primary-container text-primary"
                        : "bg-surface-container-high text-on-surface"
                    }`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3
                    className={`font-headline text-2xl font-bold ${!isPrimary ? "text-on-surface" : ""}`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`leading-relaxed ${isPrimary ? "text-on-primary-container opacity-90" : "text-tertiary"}`}
                  >
                    {feature.description}
                  </p>
                </div>
              </TimelineContent>
            );
          })}
        </div>
      </div>
    </section>
  );
}
