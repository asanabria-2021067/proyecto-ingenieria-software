'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { aviso } from '@/lib/mensajes';
import {
  actualizarPortafolio,
  aplicarRestriccion,
  confirmarHabilidad,
  getAsistenteReuniones,
  getBienvenida,
  getDisponibilidad,
  getEnlacesPerfil,
  getHabilidadesConfirmables,
  getPersonasParecidas,
  getPortafolioEstado,
  getResumenSemestre,
  getRestricciones,
  guardarBienvenida,
  guardarDisponibilidad,
  guardarEnlacesPerfil,
  listarReportesPerfil,
  quitarRestriccion,
  regenerarPortafolio,
  reportarPerfil,
  resolverReportePerfil,
  retirarConfirmacion,
  type BloqueDisponible,
  type EstadoReportePerfil,
  type TipoRestriccion,
} from '@/lib/services/perfil-portafolio';

const portafolioKey = ['perfil-portafolio', 'estado'] as const;
const habilidadesKey = (id: number) => ['perfil-portafolio', id, 'habilidades'] as const;
const disponibilidadKey = (id: number) => ['perfil-portafolio', id, 'disponibilidad'] as const;
const enlacesKey = (id: number) => ['perfil-portafolio', id, 'enlaces'] as const;

const falla = (titulo: string) => (error: unknown) => aviso.error(titulo, mensajeErrorOrganizacion(error));

export function usePortafolioEstado() {
  return useQuery({ queryKey: portafolioKey, queryFn: getPortafolioEstado });
}

export function usePortafolioAcciones() {
  const qc = useQueryClient();
  const guardar = (estado: unknown) => qc.setQueryData(portafolioKey, estado);
  return {
    actualizar: useMutation({
      mutationFn: (cambios: Parameters<typeof actualizarPortafolio>[0]) => actualizarPortafolio(cambios),
      onSuccess: guardar,
      onError: falla('No se pudo actualizar el portafolio'),
    }),
    regenerar: useMutation({
      mutationFn: () => regenerarPortafolio(),
      onSuccess: (estado) => {
        guardar(estado);
        aviso.exito('Enlace nuevo generado', 'El enlace anterior ya no funciona.');
      },
      onError: falla('No se pudo generar el enlace nuevo'),
    }),
  };
}

export function useHabilidadesConfirmables(id: number) {
  return useQuery({ queryKey: habilidadesKey(id), queryFn: () => getHabilidadesConfirmables(id), enabled: id > 0 });
}

export function useConfirmarHabilidad(id: number) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: habilidadesKey(id) });
  return {
    confirmar: useMutation({
      mutationFn: (idHabilidad: number) => confirmarHabilidad(id, idHabilidad),
      onSuccess: refrescar,
      onError: falla('No se pudo confirmar la habilidad'),
    }),
    retirar: useMutation({
      mutationFn: (idHabilidad: number) => retirarConfirmacion(id, idHabilidad),
      onSuccess: refrescar,
      onError: falla('No se pudo retirar la confirmación'),
    }),
  };
}

export function useDisponibilidad(id: number) {
  return useQuery({ queryKey: disponibilidadKey(id), queryFn: () => getDisponibilidad(id), enabled: id > 0 });
}

export function useGuardarDisponibilidad(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bloques: BloqueDisponible[]) => guardarDisponibilidad(bloques),
    onSuccess: (data) => {
      qc.setQueryData(disponibilidadKey(id), data);
      aviso.exito('Disponibilidad guardada');
    },
    onError: falla('No se pudo guardar la disponibilidad'),
  });
}

export function useEnlacesPerfil(id: number) {
  return useQuery({ queryKey: enlacesKey(id), queryFn: () => getEnlacesPerfil(id), enabled: id > 0 });
}

export function useGuardarEnlaces(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => guardarEnlacesPerfil(urls),
    onSuccess: (data) => {
      qc.setQueryData(enlacesKey(id), data);
      aviso.exito('Enlaces guardados');
    },
    onError: falla('No se pudieron guardar los enlaces'),
  });
}

export function useResumenSemestre() {
  return useQuery({ queryKey: ['perfil-portafolio', 'semestre'], queryFn: getResumenSemestre });
}

const restriccionesKey = ['perfil-portafolio', 'restricciones'] as const;

export function useAsistenteReuniones(params: { invitados: number[]; desde?: string; dias?: number; horas?: number }) {
  return useQuery({
    queryKey: ['perfil-portafolio', 'asistente', params],
    queryFn: () => getAsistenteReuniones(params),
    enabled: params.invitados.length > 0,
  });
}

export function usePersonasParecidas(id: number) {
  return useQuery({ queryKey: ['perfil-portafolio', id, 'parecidas'], queryFn: () => getPersonasParecidas(id), enabled: id > 0 });
}

export function useRestricciones() {
  return useQuery({ queryKey: restriccionesKey, queryFn: getRestricciones });
}

export function useAccionesRestriccion() {
  const qc = useQueryClient();
  const guardar = (r: unknown) => {
    qc.setQueryData(restriccionesKey, r);
    // Bloquear cambia amistades, directorio y mensajes directos.
    void qc.invalidateQueries();
  };
  return {
    aplicar: useMutation({
      mutationFn: (v: { tipo: TipoRestriccion; idObjetivo: number }) => aplicarRestriccion(v.tipo, v.idObjetivo),
      onSuccess: guardar,
      onError: falla('No se pudo aplicar'),
    }),
    quitar: useMutation({
      mutationFn: (v: { tipo: TipoRestriccion; idObjetivo: number }) => quitarRestriccion(v.tipo, v.idObjetivo),
      onSuccess: guardar,
      onError: falla('No se pudo quitar'),
    }),
  };
}

export function useReportarPerfil() {
  return useMutation({ mutationFn: (p: Parameters<typeof reportarPerfil>[0]) => reportarPerfil(p) });
}

export function useReportesPerfil(estado: EstadoReportePerfil) {
  return useQuery({ queryKey: ['admin', 'reportes-perfil', estado], queryFn: () => listarReportesPerfil(estado) });
}

export function useResolverReportePerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { idReporte: number; accion: 'descartar' | 'actuar'; nota?: string }) => resolverReportePerfil(v.idReporte, v.accion, v.nota),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reportes-perfil'] }),
  });
}

export function useBienvenida(idProyecto: number) {
  return useQuery({ queryKey: ['bienvenida', idProyecto], queryFn: () => getBienvenida(idProyecto), enabled: idProyecto > 0 });
}

export function useGuardarBienvenida(idProyecto: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mensaje: string | null) => guardarBienvenida(idProyecto, mensaje),
    onSuccess: (data) => {
      qc.setQueryData(['bienvenida', idProyecto], data);
      aviso.exito('Mensaje de bienvenida guardado');
    },
    onError: falla('No se pudo guardar el mensaje'),
  });
}
