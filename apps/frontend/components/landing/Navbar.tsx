import Link from "next/link";
import logo from "@/public/Logo UVG-08.png";

const navLinks = [
  { label: "El Problema", href: "#el-problema" },
  { label: "La Solución", href: "#la-solucion" },
  { label: "Cómo Funciona", href: "#como-funciona" },
];

export default function Navbar() {
  return (
    <header className="bg-surface/80 backdrop-blur-xl shadow-sm sticky top-0 z-50">
      <nav className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <img
            src={logo.src}
            alt="UVG Scholar"
            className="h-10 w-auto brightness-0"
          />
          <div className="hidden md:flex gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-slate-600 font-medium hover:text-emerald-600 transition-colors duration-200 text-sm uppercase tracking-wider"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-emerald-800 text-sm uppercase tracking-wider font-semibold px-4 py-2 rounded-lg hover:bg-emerald-50 hover:text-emerald-900 transition-all duration-200"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/login"
            className="bg-primary text-on-primary px-6 py-2 rounded-xl text-sm uppercase tracking-wider font-bold shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-200"
          >
            Registrarse
          </Link>
        </div>
      </nav>
    </header>
  );
}
