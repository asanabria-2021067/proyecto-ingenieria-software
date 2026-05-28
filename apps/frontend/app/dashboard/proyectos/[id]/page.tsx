'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Clock, BookOpen, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch } from '@/lib/api/client';
import { Postulacion, Proyecto, TIPO_LABEL, MODALIDAD_LABEL, NIVEL_LABEL } from '@/types';

export default function ProyectoDetallePage() {
  const { id } = useParams<{ id: string }>();

  const { data: proyecto, isLoading, isError } = useQuery<Proyecto>({
    queryKey: ['proyecto', id],
    queryFn: () => apiFetch(`/proyectos/${id}`),
  });

  const {
    data: misPostulaciones = [],
    isLoading: isLoadingPostulaciones,
  } = useQuery<Postulacion[]>({
    queryKey: ['mis-postulaciones'],
    queryFn: () => apiFetch('/postulaciones/mis-postulaciones'),
  });

  const postulacionActiva =
    proyecto &&
    misPostulaciones.find(
      (p) =>
        p.rolProyecto.proyecto.idProyecto === proyecto.idProyecto &&
        p.estadoPostulacion !== 'RECHAZADA',
    );

  return (
    <DashboardLayout allowAdmin>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <Link
          href="/dashboard/proyectos"
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a proyectos
        </Link>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando...</div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudo cargar el proyecto.
          </div>
        )}

        {proyecto && (
          <div className="space-y-6">
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-7">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="font-headline font-extrabold text-2xl text-on-surface leading-tight">
                  {proyecto.tituloProyecto}
                </h1>
                <span className="shrink-0 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">
                  {TIPO_LABEL[proyecto.tipoProyecto]}
                </span>
              </div>

              {proyecto.organizaciones[0] && (
                <p className="text-primary font-semibold text-sm mb-4">
                  {proyecto.organizaciones[0].organizacion.nombreOrganizacion}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-tertiary mb-5">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  {proyecto.ubicacionProyecto && ` · ${proyecto.ubicacionProyecto}`}
                </span>
                {proyecto.fechaInicio && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    Inicio: {new Date(proyecto.fechaInicio).toLocaleDateString('es-GT')}
                  </span>
                )}
                {proyecto.fechaFinEstimada && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Fin est.: {new Date(proyecto.fechaFinEstimada).toLocaleDateString('es-GT')}
                  </span>
                )}
              </div>

              <p className="text-on-surface text-sm leading-relaxed mb-4">
                {proyecto.descripcionProyecto}
              </p>

              {proyecto.objetivosProyecto && (
                <div>
                  <h3 className="font-headline font-bold text-on-surface text-sm mb-1">
                    Objetivos
                  </h3>
                  <p className="text-on-surface text-sm leading-relaxed">
                    {proyecto.objetivosProyecto}
                  </p>
                </div>
              )}

              {proyecto.intereses.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {proyecto.intereses.map(({ interes }) => (
                    <span
                      key={interes.nombreInteres}
                      className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface text-xs"
                    >
                      {interes.nombreInteres}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-headline font-bold text-on-surface text-xl mb-4">
                Roles Disponibles ({proyecto.roles.length})
              </h2>

              {isLoadingPostulaciones && (
                <div className="mb-4 text-xs text-tertiary">
                  Verificando tus postulaciones activas...
                </div>
              )}

              {!isLoadingPostulaciones && postulacionActiva && (
                <div className="mb-4 bg-surface-container-low border border-outline-variant rounded-2xl p-4">
                  <p className="text-sm font-semibold text-on-surface">
                    Ya registraste una postulación para este proyecto.
                  </p>
                  <p className="text-xs text-tertiary mt-1">
                    Rol: {postulacionActiva.rolProyecto.nombreRol} · Estado:{' '}
                    {postulacionActiva.estadoPostulacion === 'PENDIENTE'
                      ? 'Pendiente'
                      : postulacionActiva.estadoPostulacion === 'ACEPTADA'
                      ? 'Aceptada'
                      : 'Rechazada'}
                  </p>
                  <Link
                    href="/dashboard/mis-postulaciones"
                    className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold text-primary border border-primary/40 hover:bg-primary/10 transition-colors mt-3"
                  >
                    Ver mi postulación
                  </Link>
                </div>
              )}

              <div className="space-y-4">
                {proyecto.roles.map((rol) => (
                  <div
                    key={rol.idRolProyecto}
                    className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-headline font-bold text-on-surface text-lg">
                        {rol.nombreRol}
                      </h3>
                      <span className="shrink-0 px-2.5 py-1 rounded-full bg-surface-container text-on-surface text-xs font-medium">
                        {rol.cupos} {rol.cupos === 1 ? 'cupo' : 'cupos'}
                      </span>
                    </div>

                    {rol.descripcionRolProyecto && (
                      <p className="text-on-surface text-sm leading-relaxed mb-3">
                        {rol.descripcionRolProyecto}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-4 text-xs text-tertiary mb-4">
                      {rol.carreraRequerida && (
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          {rol.carreraRequerida.nombreCarrera}
                        </span>
                      )}
                      {rol.horasSemanalesEstimadas && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {rol.horasSemanalesEstimadas} hrs/semana
                        </span>
                      )}
                    </div>

                    {rol.requisitos.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {rol.requisitos.map((req) => (
                          <span
                            key={req.habilidad.nombreHabilidad}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              req.obligatorio
                                ? 'bg-primary-container text-on-primary-container'
                                : 'bg-surface-container text-on-surface'
                            }`}
                          >
                            {req.habilidad.nombreHabilidad} · {NIVEL_LABEL[req.nivelMinimo]}
                          </span>
                        ))}
                      </div>
                    )}

                    {postulacionActiva ? (
                      <Link
                        href="/dashboard/mis-postulaciones"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-on-surface border border-outline-variant hover:bg-surface-container transition-all"
                      >
                        Ver postulación activa
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/proyectos/${id}/postular/${rol.idRolProyecto}`}
                        className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Postularme a este Rol
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
