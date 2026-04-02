import { GraduationCap, HeartHandshake, Network } from "lucide-react";

const features = [
  {
    icon: GraduationCap,
    title: "Oportunidades de boca en boca",
    description:
      "Actualmente, las oportunidades (horas beca, extensión y proyectos) se comparten principalmente por amistades y contactos. No todos se enteran a tiempo.",
    variant: "light" as const,
  },
  {
    icon: HeartHandshake,
    title: "Acceso desigual",
    description:
      "El acceso a oportunidades depende de a quién conocés, no de tu experiencia. La plataforma busca que la decisión se base en tu perfil y en el interés de cada proyecto.",
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
  return (
    <section id="el-problema" className="py-24 bg-surface-container-low px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <span className="text-primary font-bold tracking-widest text-xs uppercase">
            El problema hoy
          </span>
          <h2 className="font-headline font-bold text-4xl mt-2 text-on-surface">
            ¿Qué problema resolvemos?
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            const isPrimary = feature.variant === "primary";

            return (
              <div
                key={feature.title}
                className={`p-8 rounded-[2rem] space-y-6 flex flex-col justify-between h-full ${
                  isPrimary
                    ? "bg-primary text-on-primary shadow-xl"
                    : "bg-surface-container-lowest group hover:shadow-lg transition-all duration-300"
                }`}
              >
                <div className="space-y-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                      isPrimary
                        ? "bg-on-primary-container text-primary"
                        : "bg-surface-container-high text-on-surface"
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className={`font-headline font-bold text-2xl ${!isPrimary ? "text-on-surface" : ""}`}>
                    {feature.title}
                  </h3>
                  <p className={`leading-relaxed ${isPrimary ? "text-on-primary-container opacity-90" : "text-tertiary"}`}>
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
