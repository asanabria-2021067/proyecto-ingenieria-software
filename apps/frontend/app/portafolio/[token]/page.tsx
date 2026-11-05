import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortafolioPublicoVista } from '@/components/profile/portafolio-publico-vista';
import type { PortafolioPublico } from '@/lib/services/perfil-portafolio';

// Ruta pública (sin sesión): fuera de /dashboard, no se cachea para que desactivar el portafolio surta efecto al instante.
export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Props = { params: Promise<{ token: string }> };

/** Una sola petición por solicitud (metadatos y página comparten el resultado). Sin cookies ni credenciales. */
const cargar = cache(async (token: string): Promise<PortafolioPublico | null> => {
  if (!FORMATO_TOKEN.test(token)) return null;
  const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/publico/portafolio/${token}`, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('No se pudo cargar el portafolio');
  return res.json();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portafolio = await cargar((await params).token);
  if (!portafolio) return { title: 'Portafolio no encontrado', robots: { index: false, follow: false } };
  return {
    title: `Portafolio de ${portafolio.nombre}`,
    description: 'Habilidades y proyectos cerrados en UVGenius.',
    // Por defecto no se indexa: solo si la persona lo permitió.
    robots: portafolio.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PortafolioPublicoPage({ params }: Props) {
  const portafolio = await cargar((await params).token);
  if (!portafolio) notFound();
  return <PortafolioPublicoVista portafolio={portafolio} />;
}
