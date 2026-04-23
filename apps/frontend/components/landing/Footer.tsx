import Image from 'next/image';
import logo from '@/public/Logo UVG-08.png';

const platformLinks = [
  { label: 'Proyectos', href: '#la-solucion' },
  { label: 'Organizaciones', href: '#como-funciona' },
  { label: 'Soporte', href: '#' },
];

const legalLinks = [
  { label: 'Politica de Privacidad', href: '#' },
  { label: 'Terminos de Servicio', href: '#' },
];

export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-slate-100 px-8 py-12">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-4">
        <div className="col-span-1 space-y-4">
          <Image src={logo} alt="UVGenius" className="h-15 w-auto brightness-0" />
          <p className="text-sm text-slate-500">
            Impulsando la excelencia academica y el compromiso social de la Universidad del
            Valle de Guatemala.
          </p>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-primary">Plataforma</h4>
          <ul className="space-y-2 text-sm">
            {platformLinks.map((link) => (
              <li key={link.label}>
                <a
                  className="text-slate-500 underline-offset-4 transition-all duration-200 hover:text-primary hover:underline"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-primary">Legal</h4>
          <ul className="space-y-2 text-sm">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <a
                  className="text-slate-500 underline-offset-4 transition-all duration-200 hover:text-primary hover:underline"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-1 space-y-4">
          <h4 className="font-headline font-semibold text-primary">Universidad</h4>
          <p className="text-sm text-slate-500">
            Avenida La Reforma, Zona 10
            <br />
            Guatemala City, Guatemala
          </p>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-slate-200 pt-8">
        <p className="text-center text-sm text-slate-500">
          2025 Universidad del Valle de Guatemala. Academic Excellence.
        </p>
      </div>
    </footer>
  );
}
