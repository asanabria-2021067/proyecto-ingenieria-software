import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="w-full border-b border-gray-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-blue-700">UVG Collab</h1>

          <div className="flex gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition hover:bg-blue-50"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto flex min-h-[80vh] max-w-6xl flex-col items-center justify-center px-6 text-center">
        <h2 className="max-w-4xl text-4xl font-bold leading-tight md:text-5xl">
          Plataforma para la colaboración interdisciplinaria entre asociaciones
          estudiantiles universitarias
        </h2>

        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          Centraliza proyectos, facilita la comunicación entre estudiantes,
          asociaciones e institutos, y permite acceder de forma clara a nuevas
          oportunidades de colaboración.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
          >
            Ir al login
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg border border-blue-600 px-6 py-3 text-blue-600 transition hover:bg-blue-50"
          >
            Explorar sistema
          </Link>
        </div>
      </section>
    </main>
  );
}
