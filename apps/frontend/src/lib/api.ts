import { CreateProyectoDto, Proyecto } from '@/types/proyecto';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function getProyectos(): Promise<Proyecto[]> {
  const res = await fetch(`${API_URL}/proyectos`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Error al obtener proyectos (${res.status})`);
  }

  return res.json();
}

export async function getProyecto(id: number): Promise<Proyecto> {
  const res = await fetch(`${API_URL}/proyectos/${id}`, {
    cache: 'no-store',
  });

  if (res.status === 404) {
    throw new Error('Proyecto no encontrado');
  }
  if (!res.ok) {
    throw new Error(`Error al obtener el proyecto (${res.status})`);
  }

  return res.json();
}

export async function createProyecto(data: CreateProyectoDto): Promise<Proyecto> {
  const res = await fetch(`${API_URL}/proyectos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const message =
      (error as { message?: string }).message ?? `Error al crear el proyecto (${res.status})`;
    throw new Error(message);
  }

  return res.json();
}
