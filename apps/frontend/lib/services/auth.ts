import { apiFetch } from '@/lib/api/client';

export interface LoginPayload {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  accessToken: string;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
