const steps = [
  {
    number: '01',
    title: 'Descubre o Crea',
    description:
      'Explora los proyectos disponibles o crea el tuyo. Podes crear proyectos individuales o una organizacion con miembros fijos (como GitHub).',
    style: 'bg-surface-container-low text-primary',
    offset: '',
  },
  {
    number: '02',
    title: 'Postulate',
    description:
      'Aplica a los proyectos que te interesen. Los duenos del proyecto revisan postulaciones y aceptan colaboradores.',
    style: 'bg-primary text-on-primary shadow-lg',
    offset: 'md:mt-16',
  },
  {
    number: '03',
    title: 'Gestiona y Da Seguimiento',
    description:
      'Crea hitos, asigna tareas y lleva el control del progreso del proyecto de forma organizada.',
    style: 'bg-secondary-container text-on-secondary-container',
    offset: 'md:mt-32',
  },
];

export default function HowItWorks() {
  return (
    <section className="scroll-mt-20 overflow-hidden px-8 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-20 text-center">
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
            Una plataforma que lo formaliza todo
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-tertiary">
            Pasa de la improvisacion al orden: descubri proyectos, postula y gestiona el
            progreso con hitos y tareas.
          </p>
        </div>
        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Connector line */}
          {steps.map((step) => (
            <div
              key={step.number}
              className={`group relative flex flex-col items-center space-y-6 text-center ${step.offset}`}
            >
              <div
                className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-xl ${step.style}`}
              >
                <span className="font-headline text-2xl font-black">{step.number}</span>
              </div>
              <div className="space-y-2">
                <h4 className="font-headline text-xl font-bold uppercase tracking-tighter">
                  {step.title}
                </h4>
                <p className="px-4 text-sm text-tertiary">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
