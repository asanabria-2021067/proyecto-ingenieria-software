export default function LandingComponent() {
  return (
    <section className="space-y-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-blue-700 md:text-5xl">
          UVG Collab
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          La plataforma que conecta estudiantes, asociaciones e institutos
          universitarios para colaborar en proyectos con impacto.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
            1
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            Descubre proyectos
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Explora iniciativas activas de distintas áreas académicas.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
            2
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            Conecta con equipos
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Únete a equipos interdisciplinarios y aporta tu conocimiento.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
            3
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            Colabora y crece
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Desarrolla habilidades mientras contribuyes a proyectos reales.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-blue-50 p-8 text-center">
        <h2 className="text-2xl font-bold text-blue-700">
          Más de 50 estudiantes ya colaboran en la plataforma
        </h2>
        <p className="mt-3 text-gray-600">
          Únete y descubre las oportunidades que UVG Collab tiene para ti.
        </p>
      </div>
    </section>
  );
}
