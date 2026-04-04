import './global.css';
import { Providers } from './providers';

export const metadata = {
  title: 'UVG Collab',
  description: 'UVG Collaboration Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
