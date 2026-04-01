export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-3xl font-bold text-blue-700">
          Iniciar sesión
        </h1>

        <form className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            className="rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="password"
            placeholder="Contraseña"
            className="rounded-lg border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            className="rounded-lg bg-blue-600 py-3 text-white transition hover:bg-blue-700"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
