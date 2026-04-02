export default function ProjectsPage() {
  const projects = [
    {
      name: "Sistema de Riego Inteligente",
      area: "Ingeniería Mecatrónica",
      status: "Activo",
      members: 5,
    },
    {
      name: "App de Tutorías entre Pares",
      area: "Ciencias de la Computación",
      status: "Activo",
      members: 3,
    },
    {
      name: "Campaña de Reforestación UVG",
      area: "Ciencias Ambientales",
      status: "En pausa",
      members: 8,
    },
    {
      name: "Plataforma de Donaciones Estudiantiles",
      area: "Ingeniería de Software",
      status: "Activo",
      members: 4,
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <h1 className="mb-2 text-3xl font-bold text-blue-700">Proyectos</h1>
      <p className="mb-8 text-gray-600">
        Explora los proyectos universitarios disponibles y encuentra
        oportunidades de colaboración.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <div
            key={project.name}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {project.name}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  project.status === "Activo"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {project.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">Área: {project.area}</p>
            <p className="text-sm text-gray-600">
              Miembros: {project.members}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
