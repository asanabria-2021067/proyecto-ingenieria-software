import './global.css';
import { Inter, Manrope } from 'next/font/google';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata = {
  title: 'UVGENIUS | Excelencia Académica',
  description: 'Plataforma de colaboración y gestión académica de la Universidad del Valle de Guatemala.',
};

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
