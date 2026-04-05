import { CheckCircle2 } from 'lucide-react';

const benefits = [
  'Miembros automaticos en cada proyecto de la org',
  'Gestion centralizada de multiples proyectos',
  'Control de hitos y tareas por proyecto',
];

export default function OrganizationsSection() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-20 bg-on-primary-fixed px-8 py-24 text-on-primary"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 lg:flex-row">
        <div className="space-y-8 lg:w-1/2">
          <span className="text-xs font-bold uppercase tracking-widest text-secondary-fixed">
            Modelo tipo GitHub
          </span>
          <h2 className="font-headline text-4xl font-extrabold leading-tight md:text-5xl">
            Organizaciones: tu equipo, tus proyectos
          </h2>
          <p className="text-lg leading-relaxed text-surface-variant opacity-80">
            Creas una organizacion, agregas miembros y los proyectos que se creen dentro ya
            incluyen automaticamente a todo el equipo. Es ideal para asociaciones estudiantiles
            con un grupo fijo.
          </p>
          <ul className="space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-secondary-fixed" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="pt-4">
            <button className="rounded-xl bg-secondary-fixed px-10 py-4 font-headline text-lg font-bold text-on-secondary-fixed shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-secondary-fixed-dim hover:shadow-xl active:scale-95">
              Crear organizacion
            </button>
          </div>
        </div>
        <div className="lg:w-1/2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4 pt-8">
              <div className="group overflow-hidden rounded-3xl h-48">
                <img
                  alt="Impacto social"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  src="https://res.cloudinary.com/uvggt/image/upload/q_auto:best,f_auto,w_800/v1734455717/2025/01%20Enero/Innovacion%20e%20ingenio/Innovaci%C3%B3n-e-ingenio-Portada.jpg"
                />
              </div>
              <div className="rounded-3xl bg-secondary-container p-6 text-on-secondary-container transition-transform duration-300 hover:scale-[1.02]">
                <span className="block font-headline text-4xl font-black">Equipos</span>
                <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                  Miembros en cada proyecto
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-surface-container-high/10 p-6 backdrop-blur-md transition-transform duration-300 hover:scale-[1.02]">
                <span className="block font-headline text-4xl font-black text-white">
                  Seguimiento
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-white opacity-80">
                  por hitos y tareas
                </span>
              </div>
              <div className="group h-64 overflow-hidden rounded-3xl">
                <img
                  alt="Colaboracion"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  src="https://res.cloudinary.com/uvggt/image/upload/q_auto:best,f_auto,w_800/v1701711361/2023/12%20Diciembre/Proyectos%20Ingenieria%20Mecanica/Proyectos-Ingenieria-Mecanica.jpg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
