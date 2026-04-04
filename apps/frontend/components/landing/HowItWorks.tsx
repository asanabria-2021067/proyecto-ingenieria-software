const steps = [
  {
    number: "01",
    title: "Descubrí o Creá",
    description:
      "Explorá los proyectos disponibles o creá el tuyo. Podés crear proyectos individuales o una organización con miembros fijos (como GitHub).",
    style: "bg-surface-container-low text-primary",
    offset: "",
  },
  {
    number: "02",
    title: "Postulate",
    description:
      "Aplicá a los proyectos que te interesen. Los dueños del proyecto revisan postulaciones y aceptan colaboradores.",
    style: "bg-primary text-on-primary shadow-lg",
    offset: "md:mt-16",
  },
  {
    number: "03",
    title: "Gestioná y Da Seguimiento",
    description:
      "Creá hitos, asigná tareas y llevá el control del progreso del proyecto de forma organizada.",
    style: "bg-secondary-container text-on-secondary-container",
    offset: "md:mt-32",
  },
];

export default function HowItWorks() {
  return (
    <section id="la-solucion" className="py-24 px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-headline font-extrabold text-4xl text-on-surface tracking-tight">
            Una plataforma que lo formaliza todo
          </h2>
          <p className="text-tertiary mt-4 max-w-2xl mx-auto">
            Pasá de la improvisación al orden: descubrí proyectos, postulá y gestioná el progreso con hitos y tareas.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`relative flex flex-col items-center text-center space-y-6 ${step.offset}`}
            >
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center relative z-10 ${step.style}`}
              >
                <span className="font-headline font-black text-2xl">
                  {step.number}
                </span>
              </div>
              <div className="space-y-2">
                <h4 className="font-headline font-bold text-xl uppercase tracking-tighter">
                  {step.title}
                </h4>
                <p className="text-sm text-tertiary px-4">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
