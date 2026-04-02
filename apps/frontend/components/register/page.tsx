export default function RegisterComponent() {
  return (
    <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-2 text-center text-3xl font-bold text-blue-700">
        Crear cuenta
      </h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        Completa el formulario para unirte a UVG Collab.
      </p>

      <form className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nombre completo
          </label>
          <input
            type="text"
            placeholder="Juan Pérez"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Correo electrónico
          </label>
          <input
            type="email"
            placeholder="usuario@uvg.edu.gt"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Carrera
          </label>
          <select className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Selecciona tu carrera</option>
            <option value="cs">Ciencias de la Computación</option>
            <option value="se">Ingeniería de Software</option>
            <option value="me">Ingeniería Mecatrónica</option>
            <option value="env">Ciencias Ambientales</option>
            <option value="bio">Biología</option>
            <option value="other">Otra</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Confirmar contraseña
          </label>
          <input
            type="password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700"
        >
          Registrarse
        </button>

        <p className="text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{" "}
          <span className="cursor-pointer font-medium text-blue-600 hover:underline">
            Inicia sesión
          </span>
        </p>
      </form>
    </div>
  );
}
