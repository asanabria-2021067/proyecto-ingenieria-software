'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { getIniciales } from '@/components/projects/available-project-card';
import { ROL_LABEL } from '@/lib/organizations/roles';
import { cuposLibres, primerRolConCupo, type ParticipanteForm } from '@/lib/organizations/proyecto';
import { Input } from '@/components/ui/input';
import type { MiembroOrganizacion } from '@/lib/types/organizations';
import type { RolFormItem } from './types';

/** De una asociación no hay rol de organización: la etiqueta es el cargo en la junta o «Estudiante». */
export type CandidatoVista = Pick<MiembroOrganizacion, 'idUsuario' | 'nombre' | 'apellido' | 'fotoUrl'> & {
  rolOrganizacion?: MiembroOrganizacion['rolOrganizacion'];
  etiqueta?: string;
};

type Props = {
  miembros: CandidatoVista[];
  roles: RolFormItem[];
  participantes: ParticipanteForm[];
  error: string | null;
  cargando: boolean;
  onChange: (participantes: ParticipanteForm[]) => void;
  /** Si se pasa, los candidatos son de una asociación (junta y estudiantes de sus carreras) y se pueden buscar. */
  asociacion?: { busqueda: string; onBuscar: (q: string) => void };
};

/** Miembros que entran directo como participantes activos, con su rol de proyecto; ocupan los cupos de ese rol. */
export function StepParticipantes({ miembros, roles, participantes, error, cargando, onChange, asociacion }: Props) {
  const libres = cuposLibres(roles, participantes);

  const alternar = (idUsuario: number, marcado: boolean) => {
    if (!marcado) return onChange(participantes.filter((p) => p.idUsuario !== idUsuario));
    const idRol = primerRolConCupo(roles, participantes) ?? roles[0]?.id;
    if (idRol) onChange([...participantes, { idUsuario, idRol }]);
  };

  const cambiarRol = (idUsuario: number, idRol: string) =>
    onChange(participantes.map((p) => (p.idUsuario === idUsuario ? { ...p, idRol } : p)));

  if (roles.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-outline-variant py-10 text-center text-sm text-tertiary">
        Define al menos un rol en el paso anterior para poder sumar participantes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-tertiary">
        {asociacion
          ? 'Elige qué integrantes de la junta o estudiantes de las carreras de la asociación participan y con qué rol. Entran directo, sin postularse, y ocupan cupos.'
          : 'Elige qué miembros de la organización participan y con qué rol. Entran directo, sin postularse, y ocupan cupos. Los demás miembros verán el proyecto en solo lectura.'}
      </p>

      {asociacion && (
        <Input
          type="search"
          value={asociacion.busqueda}
          onChange={(e) => asociacion.onBuscar(e.target.value)}
          placeholder="Buscar por nombre o carné"
          aria-label="Buscar participantes"
        />
      )}

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      {cargando && <p className="text-sm text-tertiary">Cargando {asociacion ? 'candidatos' : 'miembros'}...</p>}
      {!cargando && miembros.length === 0 && (
        <p className="text-sm text-tertiary">
          {asociacion
            ? 'No hay integrantes de la junta ni estudiantes activos que coincidan.'
            : 'No hay otros miembros con rol de Propietario, Administrador o Editor.'}
        </p>
      )}

      <ul className="divide-y divide-outline-variant/40 rounded-xl border border-outline-variant">
        {miembros.map((m) => {
          const actual = participantes.find((p) => p.idUsuario === m.idUsuario);
          const nombre = `${m.nombre} ${m.apellido}`;
          return (
            <li key={m.idUsuario} className="flex flex-wrap items-center gap-3 p-3">
              <Checkbox
                id={`participante-${m.idUsuario}`}
                checked={!!actual}
                onCheckedChange={(v) => alternar(m.idUsuario, v === true)}
                aria-label={`Sumar a ${nombre}`}
              />
              <Avatar className="size-8">
                {m.fotoUrl && <AvatarImage src={m.fotoUrl} alt="" />}
                <AvatarFallback className="text-xs">{getIniciales(m.nombre, m.apellido)}</AvatarFallback>
              </Avatar>
              <label htmlFor={`participante-${m.idUsuario}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block truncate text-sm font-semibold text-on-surface">{nombre}</span>
                <Tag size="sm" tone="neutral">
                  {m.etiqueta ?? (m.rolOrganizacion ? ROL_LABEL[m.rolOrganizacion] : '')}
                </Tag>
              </label>
              {actual && (
                <Select value={actual.idRol} onValueChange={(v) => cambiarRol(m.idUsuario, v)}>
                  <SelectTrigger aria-label={`Rol de proyecto de ${nombre}`} className="h-9 w-full sm:w-56">
                    <SelectValue placeholder="Rol de proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombreRol || 'Rol sin nombre'} ({Math.max(0, libres.get(r.id) ?? 0)} libres)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-tertiary">
        {participantes.length === 1 ? '1 participante elegido' : `${participantes.length} participantes elegidos`}. Los
        cupos que no ocupes quedan abiertos para postulaciones.
      </p>
    </div>
  );
}
