import TareasExplorerClient from './tareas-explorer-client';

interface Props {
  params: Promise<{ id: string }>;
}

// T-182 — vista de solo lectura de todas las tareas del proyecto.
export default async function TareasExplorerPage({ params }: Props) {
  const { id } = await params;
  return <TareasExplorerClient idProyecto={Number(id)} />;
}
