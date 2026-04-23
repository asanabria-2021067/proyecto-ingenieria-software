import { GraduationCap, Clock, HeartHandshake, Briefcase, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const projectTypes = [
  {
    icon: GraduationCap,
    title: 'Horas Beca',
    description:
      'Postulate a proyectos academicos que te permiten cumplir tus horas beca mientras ganas experiencia real.',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: HeartHandshake,
    title: 'Extension',
    description:
      'Participa en proyectos de servicio comunitario y extension universitaria con impacto social.',
    color: 'bg-secondary/10 text-secondary',
  },
  {
    icon: Briefcase,
    title: 'Experiencia Academica',
    description:
      'Colabora en investigaciones, laboratorios o proyectos de catedra que fortalecen tu perfil profesional.',
    color: 'bg-tertiary/10 text-tertiary',
  },
];

export default function IndividualProjectsSection() {
  return (
    <section
      id="proyectos-individuales"
      className="min-h-[102svh] bg-surface-container-low px-4 py-24 sm:px-6 md:min-h-[112svh] md:py-32 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left: Content */}
          <div className="space-y-8">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Para cada estudiante
          </span>
            <h2 className="font-headline text-4xl font-extrabold leading-tight md:text-5xl">
              Tu proyecto, tu ritmo
            </h2>
            <p className="text-lg leading-relaxed ">
              No necesitas pertenecer a una organizacion. Cualquier estudiante puede crear un
              proyecto propio o postularse a los que ya existen. Explora oportunidades de horas
              beca, extension o experiencia academica desde tu perfil.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/login"
                className="group flex items-center gap-2 rounded-xl bg-primary px-8 py-4 font-headline font-bold text-on-primary shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
              >
                Explorar oportunidades
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Right: Project type cards */}
          <div className="space-y-4">
            {projectTypes.map((type) => {
              const Icon = type.icon;
              return (
                <div
                  key={type.title}
                  className="group flex items-start gap-5 rounded-2xl bg-surface-container-lowest p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${type.color}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-headline text-lg font-bold text-on-surface">
                      {type.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-tertiary">
                      {type.description}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Small stat strip */}
            <div className="flex gap-4 pt-2">
              <div className="flex-1 rounded-xl bg-primary/5 px-4 py-3 text-center">
                <span className="block font-headline text-2xl font-black text-primary">3</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">
                  Tipos de proyecto
                </span>
              </div>
              <div className="flex-1 rounded-xl bg-secondary/5 px-4 py-3 text-center">
                <span className="block font-headline text-2xl font-black text-secondary">
                  <Clock className="mx-auto h-6 w-6" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">
                  Seguimiento de horas
                </span>
              </div>
              <div className="flex-1 rounded-xl bg-tertiary/5 px-4 py-3 text-center">
                <span className="block font-headline text-2xl font-black text-on-surface">
                  1-click
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">
                  Postulacion rapida
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
