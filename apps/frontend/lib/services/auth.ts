import { apiFetch } from '@/lib/api/client';

export interface LoginPayload {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
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

export async function refreshAccessToken(refreshToken: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}
