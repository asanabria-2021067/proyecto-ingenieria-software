import { notFound } from 'next/navigation';
import { ProvocarError } from './provocar-error';
import { rutaDePruebaActiva } from './ruta-de-prueba';

export const dynamic = 'force-dynamic';

export default function ErrorSimuladoPage() {
  if (!rutaDePruebaActiva()) notFound();
  return <ProvocarError />;
}
