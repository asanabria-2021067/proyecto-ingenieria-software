import Link from "next/link";

const features = [
  {
    title: "Proyectos centralizados",
    description:
      "Encuentra en un solo lugar iniciativas, asociaciones y oportunidades de colaboración dentro de la universidad.",
  },
  {
    title: "Colaboración interdisciplinaria",
    description:
      "Conecta estudiantes de distintas áreas para participar en proyectos con impacto académico y estudiantil.",
  },
  {
    title: "Acceso más claro",
    description:
      "Consulta información relevante de forma ordenada y accede rápidamente al sistema para explorar nuevas oportunidades.",
  },
];

const steps = [
  "Explora proyectos y asociaciones disponibles.",
  "Conoce los objetivos, requisitos y áreas involucradas.",
  "Inicia sesión para acceder al sistema y dar seguimiento a las oportunidades.",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-2xl font-bold text-blue-700">UVG Collab</p>
            <p className="text-sm text-gray-500">
              Plataforma de colaboración universitaria
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition hover:bg-blue-50"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Ir al sistema
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-12 px-6 py-16 md:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700">
              Colaboración interdisciplinaria
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-tight md:text-6xl">
              Conecta estudiantes, asociaciones e institutos en una sola
              plataforma
            </h1>

            <p className="mt-6 max-w-xl text-lg text-gray-600">
              UVG Collab centraliza proyectos universitarios para facilitar la
              participación estudiantil, mejorar la comunicación y dar mayor
              visibilidad a las oportunidades de colaboración.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700"
              >
                Comenzar ahora
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Ver panel principal
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold text-blue-700">+3</p>
                <p className="text-sm text-gray-600">Rutas principales base</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold text-blue-700">1</p>
                <p className="text-sm text-gray-600">Punto de acceso central</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-2xl font-bold text-blue-700">100%</p>
                <p className="text-sm text-gray-600">Enfoque en colaboración</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-white p-6 shadow-xl">
            <div className="rounded-2xl bg-blue-600 p-6 text-white">
              <p className="text-sm uppercase tracking-wide text-blue-100">
                Vista general
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Plataforma lista para descubrir oportunidades
              </h2>
              <p className="mt-3 text-sm text-blue-100">
                Accede a un entorno donde estudiantes y asociaciones pueden
                encontrarse, compartir proyectos y colaborar de forma más
                organizada.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-gray-200 p-4">
                <p className="font-semibold text-gray-800">
                  Explora proyectos universitarios
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Consulta iniciativas activas y conoce cómo integrarte a ellas.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4">
                <p className="font-semibold text-gray-800">
                  Accede al sistema fácilmente
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Ingresa desde la landing al login o navega al dashboard base.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4">
                <p className="font-semibold text-gray-800">
                  Impulsa la participación estudiantil
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Facilita el vínculo entre estudiantes, asociaciones e
                  institutos de forma más clara.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Beneficios
          </p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">
            Una experiencia más clara para descubrir y participar
          </h2>
          <p className="mt-4 text-gray-600">
            La plataforma busca resolver la dispersión de información y mejorar
            el acceso a proyectos universitarios mediante una experiencia más
            organizada y centralizada.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <h3 className="text-xl font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="mt-3 text-gray-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Cómo funciona
            </p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              Un flujo simple para empezar
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
                  {index + 1}
                </div>
                <p className="mt-4 text-gray-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="rounded-3xl bg-blue-600 px-8 py-12 text-center text-white shadow-lg">
          <h2 className="text-3xl font-bold md:text-4xl">
            Empieza a colaborar de forma más organizada
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100">
            Accede a la plataforma y explora una nueva forma de conectar
            proyectos, asociaciones y estudiantes dentro del entorno
            universitario.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-white px-6 py-3 font-medium text-blue-700 transition hover:bg-blue-50"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white px-6 py-3 font-medium text-white transition hover:bg-blue-700"
            >
              Ir al dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

