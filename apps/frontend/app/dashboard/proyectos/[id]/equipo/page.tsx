'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Users, Briefcase } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';

interface Colaborador {
  idParticipacionProyecto: number;
  fechaInicio: string;
  rolProyecto: {
    idRolProyecto: number;
    nombreRol: string;
  };
  usuario: {
    idUsuario: number;
    nombre: string;
    apellido: string;
    correo: string;
    perfil: {
      carrera: {
        nombreCarrera: string;
      } | null;
    } | null;
    habilidades: Array<{
      habilidad: {
        idHabilidad: number;
        nombreHabilidad: string;
      };
    }>;
  };
}

export default function EquipoProyectoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: equipo = [], isLoading, isError } = useQuery<Colaborador[]>({
    queryKey: ['proyecto-equipo', id],
    queryFn: () => apiFetch(`/proyectos/${id}/equipo`),
  });

  return (
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <Link
          href={`/dashboard/proyectos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-tertiary hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proyecto
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface">
              Equipo del Proyecto
            </h1>
          </div>
          <p className="text-tertiary text-sm">
            Colaboradores activos en este proyecto
          </p>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">
            Cargando equipo...
          </div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudo cargar el equipo del proyecto.
          </div>
        )}

        {!isLoading && !isError && equipo.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-tertiary mx-auto mb-4 opacity-50" />
            <p className="text-tertiary text-sm">
              Aún no hay colaboradores en este proyecto.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {equipo.map((participacion) => (
            <div
              key={participacion.idParticipacionProyecto}
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-headline font-bold text-lg text-on-surface">
                    {participacion.usuario.nombre} {participacion.usuario.apellido}
                  </h3>
                  <p className="text-xs text-tertiary">
                    {participacion.usuario.correo}
                  </p>
                </div>
                <Briefcase className="w-5 h-5 text-primary shrink-0" />
              </div>

              <div className="mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-container text-on-primary-container text-xs font-bold">
                  {participacion.rolProyecto.nombreRol}
                </span>
              </div>

              {participacion.usuario.perfil?.carrera && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-0.5">
                    Carrera
                  </p>
                  <p className="text-sm text-on-surface">
                    {participacion.usuario.perfil.carrera.nombreCarrera}
                  </p>
                </div>
              )}

              {participacion.usuario.habilidades.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-tertiary uppercase tracking-wide mb-1.5">
                    Habilidades
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {participacion.usuario.habilidades.map((h) => (
                      <span
                        key={h.habilidad.idHabilidad}
                        className="px-2 py-0.5 rounded-full bg-secondary-container/30 text-secondary text-xs"
                      >
                        {h.habilidad.nombreHabilidad}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-outline-variant">
                <p className="text-xs text-tertiary">
                  Desde: {new Date(participacion.fechaInicio).toLocaleDateString('es-GT')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
