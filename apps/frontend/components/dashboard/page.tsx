export default function DashboardComponent() {
  const stats = [
    { label: "Proyectos activos", value: "12" },
    { label: "Colaboradores", value: "48" },
    { label: "Asociaciones", value: "6" },
    { label: "Solicitudes pendientes", value: "3" },
  ];

  const recentActivity = [
    "Se unió un nuevo miembro al proyecto 'App de Tutorías'.",
    "El proyecto 'Sistema de Riego' actualizó su estado a Activo.",
    "Nueva solicitud de colaboración en 'Campaña de Reforestación'.",
  ];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-blue-700">Dashboard</h1>
        <p className="text-gray-600">
          Resumen general de la actividad en la plataforma.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-2xl font-bold text-blue-700">{stat.value}</p>
            <p className="mt-1 text-sm text-gray-600">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Actividad reciente
        </h2>
        <ul className="space-y-3">
          {recentActivity.map((activity) => (
            <li
              key={activity}
              className="flex items-start gap-3 text-sm text-gray-700"
            >
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
              {activity}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
