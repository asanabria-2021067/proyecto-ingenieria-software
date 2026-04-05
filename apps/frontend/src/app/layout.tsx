import QueryProvider from '@/providers/QueryProvider';

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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
