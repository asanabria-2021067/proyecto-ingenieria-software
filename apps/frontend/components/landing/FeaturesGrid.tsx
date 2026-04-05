import { GraduationCap, HeartHandshake, Network } from 'lucide-react';

const features = [
  {
    icon: GraduationCap,
    title: 'Oportunidades de boca en boca',
    description:
      'Actualmente, las oportunidades (horas beca, extension y proyectos) se comparten principalmente por amistades y contactos. No todos se enteran a tiempo.',
    variant: 'light' as const,
  },
  {
    icon: HeartHandshake,
    title: 'Acceso desigual',
    description:
      'El acceso a oportunidades depende de a quien conoces, no de tu experiencia. La plataforma busca que la decision se base en tu perfil y en el interes de cada proyecto.',
    variant: 'primary' as const,
  },
  {
    icon: Network,
    title: 'Sin seguimiento formal',
    description:
      'No hay una forma consistente de dar seguimiento a tareas, hitos y el progreso de los proyectos. Se pierde claridad y se dificulta la continuidad.',
    variant: 'light' as const,
  },
];

export default function FeaturesGrid() {
  return (
    <section id="el-problema" className="scroll-mt-20 bg-surface-container-low px-8 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            El problema hoy
          </span>
          <h2 className="mt-2 font-headline text-4xl font-bold text-on-surface">
            Que problema resolvemos?
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            const isPrimary = feature.variant === 'primary';

            return (
              <div
                key={feature.title}
                className={`flex h-full flex-col justify-between space-y-6 rounded-[2rem] p-8 transition-all duration-300 ${
                  isPrimary
                    ? 'bg-primary text-on-primary shadow-xl hover:-translate-y-1 hover:shadow-2xl'
                    : 'bg-surface-container-lowest hover:-translate-y-1 hover:shadow-xl'
                }`}
              >
                <div className="space-y-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 hover:scale-110 ${
                      isPrimary
                        ? 'bg-on-primary-container text-primary'
                        : 'bg-surface-container-high text-on-surface'
                    }`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3
                    className={`font-headline text-2xl font-bold ${!isPrimary ? 'text-on-surface' : ''}`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`leading-relaxed ${isPrimary ? 'text-on-primary-container opacity-90' : 'text-tertiary'}`}
                  >
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
