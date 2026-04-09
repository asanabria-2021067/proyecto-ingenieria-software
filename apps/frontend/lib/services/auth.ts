import { apiFetch } from '@/lib/api/client';

export interface LoginPayload {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface RegisterPayload {
  correo: string;
  contrasena: string;
  nombre: string;
  apellido: string;
  carne: string;
  idCarrera: number;
  semestre: number;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
