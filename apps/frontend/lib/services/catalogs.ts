import { apiFetch } from '@/lib/api/client';

export interface Carrera {
  idCarrera: number;
  nombreCarrera: string;
  facultad: string | null;
}

export interface Habilidad {
  idHabilidad: number;
  nombreHabilidad: string;
  categoriaHabilidad: string | null;
}

export interface Interes {
  idInteres: number;
  nombreInteres: string;
}

export interface Cualidad {
  idCualidad: number;
  nombreCualidad: string;
}

export function getCarreras(): Promise<Carrera[]> {
  return apiFetch<Carrera[]>('/carreras');
}

export function getHabilidades(): Promise<Habilidad[]> {
  return apiFetch<Habilidad[]>('/habilidades');
}

export function getIntereses(): Promise<Interes[]> {
  return apiFetch<Interes[]>('/intereses');
}

export function getCualidades(): Promise<Cualidad[]> {
  return apiFetch<Cualidad[]>('/cualidades');
}

export function createHabilidad(nombre: string, categoriaHabilidad?: string | null): Promise<Habilidad> {
  return apiFetch<Habilidad>('/habilidades', {
    method: 'POST',
    body: JSON.stringify({ nombre, categoria: categoriaHabilidad ?? undefined }),
  });
}

export function createInteres(nombre: string): Promise<Interes> {
  return apiFetch<Interes>('/intereses', {
    method: 'POST',
    body: JSON.stringify({ nombre }),
  });
}

export function createCualidad(nombre: string): Promise<Cualidad> {
  return apiFetch<Cualidad>('/cualidades', {
    method: 'POST',
    body: JSON.stringify({ nombre }),
  });
}
