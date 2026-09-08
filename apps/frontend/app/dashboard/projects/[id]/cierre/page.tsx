import ClosurePreparationClient from './closure-preparation-client';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * VIEW-13 (F005) — preparación y envío del cierre del proyecto. Ruta del
 * árbol del LÍDER (`/dashboard/projects/[id]/cierre`); no confundir con
 * `salida/preparacion`, que es la preparación de salida de rol (VIEW-10).
 */
export default async function ClosurePreparationPage({ params }: Props) {
  const { id } = await params;
  return <ClosurePreparationClient id={Number(id)} />;
}
