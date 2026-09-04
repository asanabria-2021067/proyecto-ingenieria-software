import './global.css';
import { Inter, Manrope } from 'next/font/google';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata = {
  title: 'UVGENIUS | Excelencia Académica',
  description: 'Plataforma de colaboración y gestión académica de la Universidad del Valle de Guatemala.',
};

// `crypto.randomUUID()` solo existe en contextos seguros (HTTPS/localhost);
// en despliegues servidos por HTTP plano lanza `crypto.randomUUID is not a
// function`. Se parchea antes de que corra cualquier otro script (nuestro
// código o bundles de terceros como socket.io) para no tener que blindar
// cada call site por separado.
const RANDOM_UUID_POLYFILL = `
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = function randomUUID() {
    var bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  };
}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${manrope.variable} font-body`}
      >
        <script dangerouslySetInnerHTML={{ __html: RANDOM_UUID_POLYFILL }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
