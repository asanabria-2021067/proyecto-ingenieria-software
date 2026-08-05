'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Users, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  useProjectMembersAdmin,
  type EstadoParticipacion,
} from '@/hooks/use-project-members-admin';

const ESTADO_PARTICIPACION_CONFIG: Record<
  EstadoParticipacion,
  { label: string; classes: string }
> = {
  ACTIVO: { label: 'Activo', classes: 'bg-primary/10 text-primary' },
  RETIRADO: { label: 'Retirado', classes: 'bg-error-container text-error' },
  COMPLETADO: { label: 'Completado', classes: 'bg-surface-container-high text-tertiary' },
};

function EstadoParticipacionBadge({ estado }: { estado: EstadoParticipacion }) {
  const config = ESTADO_PARTICIPACION_CONFIG[estado] ?? {
    label: estado,
    classes: 'bg-surface-container-high text-on-surface',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (n + a).toUpperCase() || 'U';
}

function formatHoras(horas: number): string {
  return `${horas.toFixed(1)} h`;
}

const COLUMN_COUNT = 4;

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="border-outline-variant/40">
          <TableCell className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-surface-container-high" />
              <Skeleton className="h-4 w-32 rounded bg-surface-container-high" />
            </div>
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-28 rounded bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-5 w-16 rounded-full bg-surface-container-high" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-16 rounded bg-surface-container-high" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function MiembrosProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const idProyecto = Number(id);
  const { members, isLoading, isError } = useProjectMembersAdmin(idProyecto);

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
            Miembros del Proyecto
          </h1>
        </div>
        <p className="text-tertiary text-sm">
          Integrantes del proyecto, su rol y su estado de participación
        </p>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-low">
              <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                Integrante
              </TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                Rol
              </TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                Estado
              </TableHead>
              <TableHead className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-tertiary">
                Horas registradas
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows />}

            {isError && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6 text-error" />
                    <p className="text-sm font-medium text-on-surface">
                      No se pudieron cargar los miembros del proyecto.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && members.length === 0 && (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-10 text-center">
                  <p className="text-sm text-tertiary">
                    Este proyecto todavía no tiene integrantes.
                  </p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              members.map((miembro) => (
                <TableRow
                  key={miembro.idParticipacion}
                  className="border-outline-variant/40 hover:bg-surface-container-low transition-colors"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-outline-variant/30">
                        {miembro.usuario.fotoUrl ? (
                          <Image
                            src={miembro.usuario.fotoUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-primary-container text-xs font-bold text-on-primary-container">
                            {getInitials(miembro.usuario.nombre, miembro.usuario.apellido)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-on-surface">
                        {miembro.usuario.nombre} {miembro.usuario.apellido}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-on-surface">
                      {miembro.rolProyecto.nombreRol}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <EstadoParticipacionBadge estado={miembro.estadoParticipacion} />
                  </TableCell>

                  <TableCell className="px-4 py-3">
                    <span className="text-sm text-tertiary">
                      {formatHoras(miembro.horasRegistradas)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
