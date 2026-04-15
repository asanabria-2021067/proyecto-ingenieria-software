'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, MapPin, Users } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { apiFetch } from '@/lib/api/client';
import { ProyectoResumen, TIPO_LABEL, MODALIDAD_LABEL } from '@/types';

const ESTADO_STYLES: Record<string, string> = {
  PUBLICADO: 'bg-[#006735] text-white',
  EN_PROGRESO: 'bg-[#416900] text-white',
  BORRADOR: 'bg-gray-100 text-gray-600',
  EN_REVISION: 'bg-blue-100 text-blue-700',
  OBSERVADO: 'bg-amber-100 text-amber-700',
  EN_SOLICITUD_CIERRE: 'bg-purple-100 text-purple-700',
  CERRADO: 'bg-gray-200 text-gray-500',
  CANCELADO: 'bg-red-100 text-red-700',
};

export default function ProyectosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');

  const { data: proyectos = [], isLoading, isError } = useQuery<ProyectoResumen[]>({
    queryKey: ['proyectos'],
    queryFn: () => apiFetch('/proyectos'),
  });

  const filtrados = proyectos.filter((p) => {
    const coincideBusqueda =
      !busqueda ||
      p.tituloProyecto.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.descripcionProyecto.toLowerCase().includes(busqueda.toLowerCase());
    const coincideTipo = !tipoFiltro || p.tipoProyecto === tipoFiltro;
    return coincideBusqueda && coincideTipo;
  });

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface mb-1">
            Proyectos Disponibles
          </h1>
          <p className="text-tertiary text-sm">
            Explora las oportunidades publicadas y postúlate a los roles que más se ajusten a ti.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
            <input
              type="text"
              placeholder="Buscar proyectos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todos los tipos</option>
            <option value="ACADEMICO_HORAS_BECA">Horas Beca</option>
            <option value="ACADEMICO_EXPERIENCIA">Experiencia</option>
            <option value="EXTRACURRICULAR_EXTENSION">Extensión</option>
          </select>
        </div>

        {isLoading && (
          <div className="text-center py-16 text-tertiary text-sm">Cargando proyectos...</div>
        )}
        {isError && (
          <div className="text-center py-16 text-error text-sm">
            No se pudieron cargar los proyectos.
          </div>
        )}

        {!isLoading && !isError && filtrados.length === 0 && (
          <div className="text-center py-16 text-tertiary text-sm">
            No se encontraron proyectos con los filtros aplicados.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {filtrados.map((proyecto) => {
            const org = proyecto.organizaciones[0]?.organizacion.nombreOrganizacion;
            return (
              <div
                key={proyecto.idProyecto}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-headline font-bold text-on-surface text-lg leading-tight">
                    {proyecto.tituloProyecto}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">
                      {TIPO_LABEL[proyecto.tipoProyecto]}
                    </span>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                        ESTADO_STYLES[proyecto.estadoProyecto] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {proyecto.estadoProyecto}
                    </span>
                  </div>
                </div>

                {org && <p className="text-tertiary text-sm font-medium">{org}</p>}

                <p className="text-on-surface text-sm leading-relaxed line-clamp-2">
                  {proyecto.descripcionProyecto}
                </p>

                <div className="flex flex-wrap gap-2">
                  {proyecto.intereses.slice(0, 3).map(({ interes }) => (
                    <span
                      key={interes.nombreInteres}
                      className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-xs"
                    >
                      {interes.nombreInteres}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-xs text-tertiary">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {MODALIDAD_LABEL[proyecto.modalidadProyecto]}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {proyecto.roles.length} {proyecto.roles.length === 1 ? 'rol' : 'roles'}
                  </span>
                </div>

                <Link
                  href={`/dashboard/proyectos/${proyecto.idProyecto}`}
                  className="mt-auto inline-flex items-center justify-center bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Ver Proyecto
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
