import { CheckCircle2 } from "lucide-react";

const benefits = [
  "Miembros automáticos en cada proyecto de la org",
  "Gestión centralizada de múltiples proyectos",
  "Control de hitos y tareas por proyecto",
];

export default function OrganizationsSection() {
  return (
    <section id="como-funciona" className="py-24 bg-on-primary-fixed text-on-primary px-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        <div className="lg:w-1/2 space-y-8">
          <span className="text-secondary-fixed font-bold tracking-widest text-xs uppercase">
            Modelo tipo GitHub
          </span>
          <h2 className="font-headline font-extrabold text-4xl md:text-5xl leading-tight">
            Organizaciones: tu equipo, tus proyectos
          </h2>
          <p className="text-surface-variant opacity-80 text-lg leading-relaxed">
            Creás una organización, agregás miembros y los proyectos que se creen
            dentro ya incluyen automáticamente a todo el equipo. Es ideal para
            asociaciones estudiantiles con un grupo fijo.
          </p>
          <ul className="space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-secondary-fixed flex-shrink-0" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="pt-4">
            <button className="bg-secondary-fixed text-on-secondary-fixed px-10 py-4 rounded-xl font-headline font-bold text-lg hover:bg-secondary-fixed-dim hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200">
              Crear organización
            </button>
          </div>
        </div>
        <div className="lg:w-1/2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4 pt-8">
              <div className="rounded-3xl overflow-hidden h-48">
                <img
                  alt="Impacto social"
                  className="w-full object-cover"
                  src="https://res.cloudinary.com/uvggt/image/upload/q_auto:best,f_auto,w_800/v1734455717/2025/01%20Enero/Innovacion%20e%20ingenio/Innovaci%C3%B3n-e-ingenio-Portada.jpg"
                />
              </div>
              <div className="bg-secondary-container p-6 rounded-3xl text-on-secondary-container">
                <span className="font-headline font-black text-4xl block">
                  Equipos
                </span>
                <span className="text-xs uppercase font-bold tracking-widest opacity-80">
                  Miembros en cada proyecto
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-surface-container-high/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
                <span className="font-headline font-black text-4xl block text-white">
                  Seguimiento
                </span>
                <span className="text-xs uppercase font-bold tracking-widest opacity-80 text-white">
                  por hitos y tareas
                </span>
              </div>
              <div className="rounded-3xl overflow-hidden h-64">
                <img
                  alt="Colaboración"
                  className="w-full h-full object-cover"
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
