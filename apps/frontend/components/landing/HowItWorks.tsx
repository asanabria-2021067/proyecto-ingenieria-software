import { useRef } from "react";
import { TimelineContent } from "@/components/ui/timeline-animation";

const steps = [
  {
    number: '01',
    title: 'Descubre o Crea',
    description:
      'Explora los proyectos disponibles o crea el tuyo. Podes crear proyectos individuales o una organizacion con miembros fijos (como GitHub).',
    style: 'bg-surface text-primary',
    offset: '',
  },
  {
    number: '02',
    title: 'Postulate',
    description:
      'Aplica a los proyectos que te interesen. Los duenos del proyecto revisan postulaciones y aceptan colaboradores.',
    style: 'bg-on-primary text-primary shadow-lg',
    offset: 'md:mt-16',
  },
  {
    number: '03',
    title: 'Gestiona y Da Seguimiento',
    description:
      'Crea hitos, asigna tareas y lleva el control del progreso del proyecto de forma organizada.',
    style: 'bg-surface text-primary',
    offset: 'md:mt-32',
  },
];

const revealVariants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.14,
      duration: 0.5,
    },
  }),
  hidden: {
    filter: "blur(10px)",
    y: -20,
    opacity: 0,
  },
};

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      id="como-funciona"
      ref={sectionRef}
      className="scroll-mt-32 overflow-hidden px-0 py-0"
    >
      <div className="bg-primary px-4 py-20 text-on-primary sm:px-6 md:px-10 md:py-28 lg:px-8">
        <div className="mb-20 text-center">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-primary">
            Como funciona paso a paso
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-on-primary">
            Pasa de la improvisacion al orden: descubri proyectos, postula y gestiona el
            progreso con hitos y tareas.
          </p>
        </div>
        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
          {steps.map((step, index) => (
            <TimelineContent
              key={step.number}
              animationNum={index}
              timelineRef={sectionRef}
              customVariants={revealVariants}
              className={`group relative flex flex-col items-center space-y-6 text-center ${step.offset}`}
            >
              <div
                className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-xl ${step.style}`}
              >
                <span className="font-headline text-2xl font-black">{step.number}</span>
              </div>
              <div className="space-y-2">
                <h4 className="font-headline text-xl font-bold uppercase tracking-tighter text-on-primary">
                  {step.title}
                </h4>
                <p className="px-4 text-sm text-on-primary/90">{step.description}</p>
              </div>
            </TimelineContent>
          ))}
        </div>
      </div>
    </section>
  );
}
