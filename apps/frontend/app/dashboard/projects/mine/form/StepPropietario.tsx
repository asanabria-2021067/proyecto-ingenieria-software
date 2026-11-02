'use client';

import Link from 'next/link';
import { Building2, Landmark, User } from 'lucide-react';
import { OrgAvatar } from '@/components/organizations/org-avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CARGO_LABEL } from '@/lib/asociaciones/vista';
import { ROL_LABEL } from '@/lib/organizations/roles';
import type { MiJunta } from '@/lib/services/asociaciones';
import type { MiOrganizacion } from '@/lib/types/organizations';

type Props = {
  /** Organizaciones donde puedo publicar (Propietario, Administrador o Editor). */
  organizaciones: MiOrganizacion[];
  cargando: boolean;
  idOrganizacion: number | null;
  onChange: (idOrganizacion: number | null) => void;
  /** Asociaciones a cuyo nombre puedo publicar (Presidente y Editores de la junta). */
  asociaciones?: MiJunta[];
  idAsociacion?: number | null;
  onChangeAsociacion?: (idAsociacion: number | null) => void;
};

const opcion = (activa: boolean) =>
  `flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
    activa ? 'border-primary bg-primary/5' : 'border-outline-variant/40 hover:border-outline'
  }`;

/** Primer paso al crear: Personal o a nombre de una organización. */
export function StepPropietario({
  organizaciones,
  cargando,
  idOrganizacion,
  onChange,
  asociaciones = [],
  idAsociacion = null,
  onChangeAsociacion,
}: Props) {
  const valor = idAsociacion !== null ? `asociacion-${idAsociacion}` : idOrganizacion === null ? 'personal' : String(idOrganizacion);

  const elegir = (v: string) => {
    if (v.startsWith('asociacion-')) onChangeAsociacion?.(Number(v.slice('asociacion-'.length)));
    else onChange(v === 'personal' ? null : Number(v));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-tertiary">
        Elige a nombre de quién se publica el proyecto. Un proyecto de organización la muestra como «Publicado por» y
        permite sumar a sus miembros directamente. Uno de asociación lo publicas como Presidente o Editor de la junta.
      </p>

      <RadioGroup
        value={valor}
        onValueChange={elegir}
        aria-label="¿A nombre de quién?"
        className="grid gap-3"
      >
        <label htmlFor="propietario-personal" className={opcion(valor === 'personal')}>
          <RadioGroupItem id="propietario-personal" value="personal" className="mt-1" />
          <span className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-on-surface">Personal</span>
              <span className="block text-xs text-on-surface-variant">Un proyecto tuyo, sin organización.</span>
            </span>
          </span>
        </label>

        {organizaciones.map((org) => (
          <label key={org.idOrganizacion} htmlFor={`propietario-${org.idOrganizacion}`} className={opcion(valor === String(org.idOrganizacion))}>
            <RadioGroupItem id={`propietario-${org.idOrganizacion}`} value={String(org.idOrganizacion)} className="mt-1" />
            <span className="flex min-w-0 items-start gap-3">
              <OrgAvatar nombre={org.nombreOrganizacion} logoUrl={org.logoUrl} className="size-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-on-surface">{org.nombreOrganizacion}</span>
                <span className="block text-xs text-on-surface-variant">
                  Tu rol: {org.miRol ? ROL_LABEL[org.miRol] : ''} - {org.totalMiembros === 1 ? '1 miembro' : `${org.totalMiembros} miembros`}
                </span>
              </span>
            </span>
          </label>
        ))}

        {asociaciones.map((j) => (
          <label key={j.idAsociacion} htmlFor={`propietario-asociacion-${j.idAsociacion}`} className={opcion(valor === `asociacion-${j.idAsociacion}`)}>
            <RadioGroupItem id={`propietario-asociacion-${j.idAsociacion}`} value={`asociacion-${j.idAsociacion}`} className="mt-1" />
            <span className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Landmark aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-on-surface">A nombre de la asociación {j.nombre}</span>
                <span className="block text-xs text-on-surface-variant">Tu cargo: {CARGO_LABEL[j.cargo]}</span>
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {!cargando && organizaciones.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Building2 aria-hidden="true" className="size-4 shrink-0" />
          <span>
            No eres Propietario, Administrador ni Editor de ninguna organización.{' '}
            <Link href="/dashboard/organizaciones/nueva" className="font-semibold text-primary hover:underline">
              Crear una
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
