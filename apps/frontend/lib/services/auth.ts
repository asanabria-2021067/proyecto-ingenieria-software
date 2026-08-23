import { apiFetch } from '@/lib/api/client';

export interface LoginPayload {
  correo: string;
  contrasena: string;
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

export interface AuthResponse {
  mensaje: string;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/logout', { method: 'POST' });
}

export async function forgotPassword(carne: string, correo: string): Promise<{ mensaje: string }> {
  return apiFetch<{ mensaje: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ carne, correo }),
  });
}

export async function resetPassword(token: string, nuevaContrasena: string): Promise<{ mensaje: string }> {
  return apiFetch<{ mensaje: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, nuevaContrasena }),
  });
}
