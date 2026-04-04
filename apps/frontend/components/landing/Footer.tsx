import logo from "@/public/Logo UVG-08.png";

const platformLinks = [
  { label: "Proyectos", href: "#la-solucion" },
  { label: "Organizaciones", href: "#como-funciona" },
  { label: "Soporte", href: "#" },
];

const legalLinks = [
  { label: "Política de Privacidad", href: "#" },
  { label: "Términos de Servicio", href: "#" },
];

export default function Footer() {
  return (
    <footer className="bg-slate-100 w-full py-12 px-8 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
        <div className="col-span-1 space-y-4">
          <img
            src={logo.src}
            alt="UVG Scholar"
            className="h-15 w-auto brightness-0"
          />
          <p className="text-sm text-slate-500">
            Impulsando la excelencia académica y el compromiso social de la
            Universidad del Valle de Guatemala.
          </p>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-emerald-800">
            Plataforma
          </h4>
          <ul className="space-y-2 text-sm">
            {platformLinks.map((link) => (
              <li key={link.label}>
                <a
                  className="text-slate-500 hover:text-emerald-600 underline transition-all duration-300"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-emerald-800">
            Legal
          </h4>
          <ul className="space-y-2 text-sm">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <a
                  className="text-slate-500 hover:text-emerald-600 underline transition-all duration-300"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-emerald-800">
            Universidad
          </h4>
          <p className="text-sm text-slate-500">
            Avenida La Reforma, Zona 10
            <br />
            Guatemala City, Guatemala
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-200">
        <p className="text-sm text-slate-500 text-center">
          © {new Date().getFullYear()} Universidad del Valle de Guatemala.
          Academic Excellence.
        </p>
      </div>
    </footer>
  );
}
