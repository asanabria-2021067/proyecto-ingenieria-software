import { apiFetch } from '@/lib/api/client';

export interface ContactoPayload {
  nombre: string;
  correo: string;
  asunto: string;
  mensaje: string;
}

export function enviarContacto(payload: ContactoPayload): Promise<{ mensaje: string }> {
  return apiFetch<{ mensaje: string }>('/contacto', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
