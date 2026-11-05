import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export const ROL_COORDINADOR = 'coordinador_academico';

/** Texto de ayuda para la vista del coordinador (misma regla que `carrerasDelProyecto`). */
export const REGLA_ALCANCE_COORDINADOR =
  'Un proyecto pertenece a la carrera que tenga asignada. Si no tiene una, a las carreras de su asociación; ' +
  'y si no hay asociación o no tiene carreras, a la carrera de su líder. ' +
  'Un estudiante pertenece a la carrera de su perfil. Una facultad asignada cubre todas sus carreras.';

export const FUERA_DE_ALCANCE_MESSAGE =
  'No puedes revisar este proyecto: está fuera de tu alcance o participas en él';
const ROL_FORBIDDEN_MESSAGE = 'Acceso restringido a administradores y coordinadores académicos';

export interface ProyectoParaAlcance {
  idCarrera: number | null;
  carreraLider: number | null;
  carrerasAsociacion: readonly number[];
}

/**
 * Regla de pertenencia: carrera propia del proyecto; si no tiene, las de la
 * asociación dueña; si tampoco, la del líder. Sin ninguna, nadie lo cubre salvo el admin.
 */
export function carrerasDelProyecto(p: ProyectoParaAlcance): number[] {
  if (p.idCarrera !== null) return [p.idCarrera];
  if (p.carrerasAsociacion.length > 0) return [...p.carrerasAsociacion];
  return p.carreraLider === null ? [] : [p.carreraLider];
}

/** Carreras que cubren las asignaciones: las carreras sueltas más todas las de cada facultad asignada. */
export function carrerasCubiertas(
  asignaciones: readonly { idCarrera: number | null; facultad: string | null }[],
  catalogo: readonly { idCarrera: number; facultad: string | null }[],
): number[] {
  const ids = new Set<number>();
  for (const a of asignaciones) {
    if (a.idCarrera !== null) ids.add(a.idCarrera);
    if (a.facultad !== null) catalogo.filter((c) => c.facultad === a.facultad).forEach((c) => ids.add(c.idCarrera));
  }
  return [...ids];
}

/** ¿Alguna de las carreras del objetivo está entre las cubiertas? */
export const cubre = (cubiertas: readonly number[], carreras: readonly number[]): boolean =>
  carreras.some((c) => cubiertas.includes(c));

/** Carreras que cubre el coordinador; vacío si no tiene el rol o no tiene alcance asignado. */
export async function carrerasDeCoordinador(db: Db, idUsuario: number): Promise<number[]> {
  const rol = await db.usuarioRolAcceso.findFirst({
    where: { idUsuario, rolAcceso: { nombrePerfil: ROL_COORDINADOR } },
    select: { idUsuarioRolAcceso: true },
  });
  if (!rol) return [];
  const asignaciones = await db.alcanceCoordinador.findMany({
    where: { idUsuario },
    select: { idCarrera: true, facultad: true },
  });
  const facultades = asignaciones.flatMap((a) => (a.facultad === null ? [] : [a.facultad]));
  const catalogo = facultades.length
    ? await db.carrera.findMany({ where: { facultad: { in: facultades } }, select: { idCarrera: true, facultad: true } })
    : [];
  return carrerasCubiertas(asignaciones, catalogo);
}

/** `undefined`: administrador, sin restricción. Lista: alcance del coordinador. Cualquier otro: 403. */
export async function alcanceDelActor(db: Db, idUsuario: number): Promise<number[] | undefined> {
  const admin = await db.usuarioRolAcceso.findFirst({
    where: { idUsuario, rolAcceso: { nombrePerfil: 'administrador' } },
    select: { idUsuarioRolAcceso: true },
  });
  if (admin) return undefined;
  const rol = await db.usuarioRolAcceso.findFirst({
    where: { idUsuario, rolAcceso: { nombrePerfil: ROL_COORDINADOR } },
    select: { idUsuarioRolAcceso: true },
  });
  if (!rol) throw new ForbiddenException(ROL_FORBIDDEN_MESSAGE);
  return carrerasDeCoordinador(db, idUsuario);
}

/**
 * Cubre el proyecto si su carrera está en el alcance Y el coordinador no es su líder ni participa en
 * él (nadie revisa lo propio). `cubiertas` evita recalcular el alcance si el llamador ya lo tiene.
 */
export async function coordinadorCubreProyecto(
  db: Db,
  idUsuario: number,
  idProyecto: number,
  cubiertas?: readonly number[],
): Promise<boolean> {
  const alcance = cubiertas ?? (await carrerasDeCoordinador(db, idUsuario));
  if (alcance.length === 0) return false;
  const p = await db.proyecto.findUnique({
    where: { idProyecto },
    select: {
      creadoPor: true,
      idCarrera: true,
      creador: { select: { perfil: { select: { idCarrera: true } } } },
      asociacion: { select: { carreras: { select: { idCarrera: true } } } },
    },
  });
  if (!p || p.creadoPor === idUsuario) return false;
  const participa = await db.participacionProyecto.findFirst({
    where: { idUsuario, rolProyecto: { idProyecto } },
    select: { idParticipacion: true },
  });
  if (participa) return false;
  return cubre(
    alcance,
    carrerasDelProyecto({
      idCarrera: p.idCarrera,
      carreraLider: p.creador.perfil?.idCarrera ?? null,
      carrerasAsociacion: p.asociacion?.carreras.map((c) => c.idCarrera) ?? [],
    }),
  );
}

export async function coordinadorCubreEstudiante(db: Db, idUsuario: number, idEstudiante: number): Promise<boolean> {
  const cubiertas = await carrerasDeCoordinador(db, idUsuario);
  if (cubiertas.length === 0) return false;
  const perfil = await db.perfilEstudiante.findUnique({ where: { idUsuario: idEstudiante }, select: { idCarrera: true } });
  return perfil?.idCarrera != null && cubiertas.includes(perfil.idCarrera);
}

/** Misma regla que `carrerasDelProyecto`, como filtro de Prisma para listas. */
export function proyectoEnAlcanceWhere(carreraIds: readonly number[], idCoordinador?: number): Prisma.ProyectoWhereInput {
  const en = { in: [...carreraIds] };
  return {
    ...(idCoordinador === undefined
      ? {}
      : { creadoPor: { not: idCoordinador }, roles: { none: { participaciones: { some: { idUsuario: idCoordinador } } } } }),
    OR: [
      { idCarrera: en },
      { idCarrera: null, asociacion: { carreras: { some: { idCarrera: en } } } },
      {
        idCarrera: null,
        creador: { perfil: { idCarrera: en } },
        OR: [{ idAsociacion: null }, { asociacion: { carreras: { none: {} } } }],
      },
    ],
  };
}
