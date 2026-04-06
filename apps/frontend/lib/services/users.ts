import { apiFetch } from '@/lib/api/client';

export interface UserProfile {
  idUsuario: number;
  correo: string;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  estado: string;
  perfil: {
    carne: string;
    idCarrera: number | null;
    semestre: number | null;
    biografia: string | null;
    enlacePortafolio: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
    disponibilidadHorasSemana: number | null;
    urlCv: string | null;
    carrera: { idCarrera: number; nombreCarrera: string } | null;
  } | null;
  habilidades: {
    idUsuarioHabilidad: number;
    idHabilidad: number;
    nivelHabilidad: string;
    habilidad: { idHabilidad: number; nombreHabilidad: string; categoriaHabilidad: string | null };
  }[];
  intereses: {
    idUsuarioInteres: number;
    idInteres: number;
    interes: { idInteres: number; nombreInteres: string };
  }[];
  cualidades: {
    idUsuarioCualidad: number;
    idCualidad: number;
    cualidad: { idCualidad: number; nombreCualidad: string };
  }[];
  experiencias: {
    idExperiencia: number;
    tituloProyectoExperiencia: string;
    rolDesempenado: string | null;
    tipoExperiencia: string;
  }[];
}

export interface DashboardStats {
  horasBeca: number;
  horasExtension: number;
  horasTotal: number;
  proyectosActivos: number;
  postulacionesRecientes: {
    idPostulacion: number;
    estadoPostulacion: string;
    fechaPostulacion: string;
    rolProyecto: {
      proyecto: { tituloProyecto: string; tipoProyecto: string };
    };
  }[];
}

export function getMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/usuarios/me');
}

export function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/usuarios/me/dashboard');
}

export function updateProfile(data: Record<string, unknown>) {
  return apiFetch('/usuarios/me/perfil', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function replaceHabilidades(
  habilidades: { idHabilidad: number; nivelHabilidad: string }[],
) {
  return apiFetch('/usuarios/me/habilidades', {
    method: 'PUT',
    body: JSON.stringify({ habilidades }),
  });
}

export function replaceIntereses(intereses: number[]) {
  return apiFetch('/usuarios/me/intereses', {
    method: 'PUT',
    body: JSON.stringify({ intereses }),
  });
}

export function replaceCualidades(cualidades: number[]) {
  return apiFetch('/usuarios/me/cualidades', {
    method: 'PUT',
    body: JSON.stringify({ cualidades }),
  });
}

export function addExperiencia(data: {
  tituloProyectoExperiencia: string;
  rolDesempenado?: string;
  tipoExperiencia?: string;
}) {
  return apiFetch('/usuarios/me/experiencias', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
