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
    horasBecaRequeridas: number | null;
    horasExtensionRequeridas: number | null;
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
  roles?: string[];
}

export interface DashboardStats {
  horasBeca: number;
  horasBecaRequeridas: number | null;
  horasExtension: number;
  horasExtensionRequeridas: number | null;
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

export function replaceExperiencias(
  experiencias: {
    tituloProyectoExperiencia: string;
    rolDesempenado?: string;
    tipoExperiencia?: string;
  }[],
) {
  return apiFetch('/usuarios/me/experiencias', {
    method: 'PUT',
    body: JSON.stringify({ experiencias }),
  });
}

export interface ProfileBootstrap {
  profile: {
    nombreCompleto: string;
    correoInstitucional: string;
    idCarrera: number | null;
    carrera: string;
    anioAcademico: string;
    semestre: number | null;
    biografia: string;
    disponibilidad: string;
    modalidadPreferida: string;
    horarioDisponible: string;
    objetivoColaboracion: string;
    fotoUrl: string;
    enlacePortafolio: string;
    githubUrl: string;
    linkedinUrl: string;
    urlCv: string;
    disponibilidadHorasSemana: number;
    horasBecaRequeridas: number | null;
    horasExtensionRequeridas: number | null;
    habilidades: {
      idHabilidad: number;
      nivelHabilidad: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
      aniosExperiencia: number;
      nombre: string;
    }[];
    intereses: number[];
    cualidades: number[];
  };
  catalogs: {
    carreras: { id: string; nombre: string }[];
    habilidades: { id: string; nombre: string }[];
    intereses: { id: string; nombre: string }[];
    cualidades: { id: string; nombre: string }[];
    disponibilidades: { id: string; nombre: string }[];
    modalidades: { value: string; label: string }[];
  };
}

export function getProfileBootstrap(): Promise<ProfileBootstrap> {
  return apiFetch<ProfileBootstrap>('/usuarios/me/perfil/bootstrap');
}

/** Tarea asignada al usuario, con los datos del proyecto al que pertenece */
export interface MiTareaDTO {
  idTarea: number;
  tituloTarea: string;
  descripcionTarea: string | null;
  estadoTarea: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA';
  fechaLimite: string | null;
  idHito: number | null;
  proyecto: {
    idProyecto: number;
    tituloProyecto: string;
    estadoProyecto: string;
  };
}

/** Tareas asignadas al usuario en todos sus proyectos — GET /usuarios/me/tareas */
export function getMisTareas(opts: {
  estado?: string;
  orden?: 'asc' | 'desc';
} = {}): Promise<MiTareaDTO[]> {
  const params = new URLSearchParams();
  if (opts.estado) params.set('estado', opts.estado);
  if (opts.orden) params.set('orden', opts.orden);
  const query = params.toString();
  return apiFetch<MiTareaDTO[]>(`/usuarios/me/tareas${query ? `?${query}` : ''}`);
}
