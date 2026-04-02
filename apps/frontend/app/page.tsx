import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Users,
  Lightbulb,
  Building2,
  Search,
  UserPlus,
  Rocket,
  ArrowRight,
  Menu,
  X,
} from "lucide-react"

function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">UC</span>
          </div>
          <span className="text-xl font-bold text-foreground">UVG Collab</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#caracteristicas"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Características
          </a>
          <a
            href="#como-funciona"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cómo Funciona
          </a>
          <a
            href="#para-quien"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Para Quién
          </a>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" asChild>
            <Link href="/login">Iniciar Sesión</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Comenzar</Link>
          </Button>
        </div>

        <MobileNav />
      </div>
    </header>
  )
}

function MobileNav() {
  return (
    <div className="md:hidden">
      <input type="checkbox" id="mobile-menu" className="peer hidden" />
      <label
        htmlFor="mobile-menu"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-accent peer-checked:[&>.menu-icon]:hidden peer-checked:[&>.close-icon]:block"
      >
        <Menu className="menu-icon h-5 w-5" />
        <X className="close-icon hidden h-5 w-5" />
      </label>
      <div className="invisible absolute left-0 top-16 w-full border-b border-border bg-background p-4 opacity-0 transition-all peer-checked:visible peer-checked:opacity-100">
        <nav className="flex flex-col gap-4">
          <a
            href="#caracteristicas"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Características
          </a>
          <a
            href="#como-funciona"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cómo Funciona
          </a>
          <a
            href="#para-quien"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Para Quién
          </a>
          <div className="flex flex-col gap-2 pt-4">
            <Button variant="outline" asChild className="w-full">
              <Link href="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild className="w-full">
              <Link href="/dashboard">Comenzar</Link>
            </Button>
          </div>
        </nav>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 sm:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Plataforma Universitaria
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Conecta, Colabora y Crea en
            <span className="text-primary"> UVG Collab</span>
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            La plataforma que centraliza la colaboración interdisciplinaria entre
            estudiantes, asociaciones estudiantiles e institutos académicos.
            Descubre proyectos, únete a iniciativas y transforma ideas en
            realidad.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/dashboard">
                Explorar Proyectos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/login">Iniciar Sesión</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <StatCard number="500+" label="Proyectos Activos" />
          <StatCard number="2,000+" label="Estudiantes Conectados" />
          <StatCard number="50+" label="Asociaciones e Institutos" />
        </div>
      </div>
    </section>
  )
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <div className="text-3xl font-bold text-primary">{number}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

function FeaturesSection() {
  const features = [
    {
      icon: Search,
      title: "Descubre Proyectos",
      description:
        "Explora una amplia variedad de proyectos interdisciplinarios. Filtra por área de interés, facultad o tipo de colaboración.",
    },
    {
      icon: Users,
      title: "Colaboración Real",
      description:
        "Conecta con estudiantes de diferentes carreras y forma equipos diversos para abordar desafíos complejos.",
    },
    {
      icon: Lightbulb,
      title: "Impulsa tus Ideas",
      description:
        "Publica tus propias iniciativas y encuentra colaboradores, mentores y recursos para hacerlas realidad.",
    },
    {
      icon: Building2,
      title: "Apoyo Institucional",
      description:
        "Accede a recursos de asociaciones estudiantiles e institutos académicos que respaldan la innovación.",
    },
  ]

  return (
    <section id="caracteristicas" className="bg-secondary/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Todo lo que necesitas para colaborar
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Herramientas diseñadas para facilitar la colaboración universitaria y
            maximizar el impacto de tus proyectos.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    {
      icon: UserPlus,
      step: "01",
      title: "Crea tu Perfil",
      description:
        "Regístrate con tu correo institucional y completa tu perfil con tus habilidades, intereses y experiencia.",
    },
    {
      icon: Search,
      step: "02",
      title: "Explora Oportunidades",
      description:
        "Navega por proyectos activos, convocatorias de asociaciones e iniciativas de institutos académicos.",
    },
    {
      icon: Rocket,
      step: "03",
      title: "Únete y Colabora",
      description:
        "Postúlate a proyectos que te interesen o crea el tuyo propio para encontrar colaboradores.",
    },
  ]

  return (
    <section id="como-funciona" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Cómo Funciona
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            En tres simples pasos estarás listo para comenzar tu próxima
            colaboración.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {steps.map((item, index) => (
            <div key={item.step} className="relative">
              {index < steps.length - 1 && (
                <div className="absolute left-1/2 top-12 hidden h-0.5 w-full bg-border lg:block" />
              )}
              <div className="relative flex flex-col items-center text-center">
                <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary bg-background">
                  <item.icon className="h-10 w-10 text-primary" />
                  <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ForWhoSection() {
  const audiences = [
    {
      title: "Estudiantes",
      description:
        "Encuentra proyectos que complementen tu formación, desarrolla habilidades prácticas y construye tu red profesional desde la universidad.",
      features: [
        "Explora proyectos por área",
        "Conecta con mentores",
        "Desarrolla tu portafolio",
      ],
    },
    {
      title: "Asociaciones Estudiantiles",
      description:
        "Publica convocatorias, gestiona proyectos y encuentra voluntarios comprometidos para tus iniciativas.",
      features: [
        "Gestiona convocatorias",
        "Recluta miembros",
        "Visibiliza tus proyectos",
      ],
    },
    {
      title: "Institutos Académicos",
      description:
        "Conecta con estudiantes talentosos, promueve oportunidades de investigación y fortalece la vinculación académica.",
      features: [
        "Publica oportunidades",
        "Encuentra asistentes",
        "Impulsa la investigación",
      ],
    },
  ]

  return (
    <section id="para-quien" className="bg-secondary/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Una plataforma para toda la comunidad
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            UVG Collab está diseñada para conectar a todos los actores de la vida
            universitaria.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {audiences.map((audience) => (
            <div
              key={audience.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-8 shadow-sm"
            >
              <h3 className="text-xl font-semibold text-foreground">
                {audience.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {audience.description}
              </p>
              <ul className="mt-6 space-y-3">
                {audience.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <svg
                        className="h-3 w-3 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="bg-primary py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
            Comienza a colaborar hoy
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Únete a la comunidad de estudiantes, asociaciones e institutos que ya
            están transformando la experiencia universitaria.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              asChild
              className="w-full sm:w-auto"
            >
              <Link href="/dashboard">
                Explorar Plataforma
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="w-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <Link href="/login">Ya tengo cuenta</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  UC
                </span>
              </div>
              <span className="text-xl font-bold text-foreground">UVG Collab</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Centralizando la colaboración interdisciplinaria en la universidad.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground">Plataforma</h4>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="#caracteristicas"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Características
                </a>
              </li>
              <li>
                <a
                  href="#como-funciona"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Cómo Funciona
                </a>
              </li>
              <li>
                <a
                  href="#para-quien"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Para Quién
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground">Recursos</h4>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Documentación
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Tutoriales
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Preguntas Frecuentes
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground">Legal</h4>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Términos de Uso
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Privacidad
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Contacto
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} UVG Collab. Todos los derechos
            reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ForWhoSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}

