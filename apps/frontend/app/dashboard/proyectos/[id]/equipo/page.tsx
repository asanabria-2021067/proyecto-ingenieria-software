import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Legacy — reemplazada por HU-123 (`/miembros`, T-106). Se mantiene como
 * redirect en vez de dos vistas administrativas equivalentes en paralelo.
 */
export default async function EquipoProyectoPage({ params }: Props) {
  const { id } = await params;
  redirect(`/dashboard/proyectos/${id}/miembros`);
}
