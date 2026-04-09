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
