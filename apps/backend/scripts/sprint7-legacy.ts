/**
 * CLI administrativa de conciliación legacy de Sprint 7 (06 v2 §14, D1).
 *
 * NO es un endpoint público y nunca debe convertirse en uno: la conciliación
 * de datos históricos exige un administrador real, un manifiesto revisado y
 * una ejecución deliberada fuera del ciclo de request/response.
 *
 * Modos:
 *   diagnose            clasifica P-01…P-07 sin escribir absolutamente nada
 *   apply --manifest    aplica el efecto inequívoco descrito por un manifiesto
 *   verify              comprueba que lo aplicado sigue siendo coherente
 *
 * C148 crea únicamente el esqueleto: parseo, ayuda y resolución del actor.
 * `apply` y `verify` todavía no están implementados y salen con código
 * distinto de cero para que no puedan confundirse con una conciliación real.
 */
import { PrismaClient } from '@prisma/client';

export type LegacyMode = 'diagnose' | 'apply' | 'verify';

export interface LegacyCliOptions {
  mode: LegacyMode;
  adminId: number;
  manifestPath: string | null;
  projectId: number | null;
  json: boolean;
}

export class LegacyCliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = 2,
  ) {
    super(message);
    this.name = 'LegacyCliError';
  }
}

const MODES: readonly LegacyMode[] = ['diagnose', 'apply', 'verify'];

export const HELP_TEXT = `sprint7-legacy — conciliación de horas legacy (Sprint 7, 06 v2 §14)

USO
  npm run legacy:s7 -- <modo> --admin <idUsuario> [opciones]

MODOS
  diagnose            Clasifica P-01…P-07 y los tramos por procedencia.
                      Solo lectura: no escribe ninguna fila.
  apply --manifest    Aplica el efecto descrito por un manifiesto revisado.
                      Rechaza cualquier divergencia con 409 y rollback total.
  verify              Comprueba que un manifiesto ya aplicado sigue vigente.
                      No corrige nada: informar es su único efecto.

OPCIONES
  --admin <id>        Obligatorio. Usuario que debe ser administrador real en
                      la base de datos; sin él ningún modo se ejecuta.
  --manifest <ruta>   Obligatorio para apply y verify.
  --project <id>      Limita el diagnóstico a un proyecto concreto.
  --json              Emite el resultado como JSON en vez de texto.
  --help, -h          Muestra esta ayuda.

NOTAS
  Esta herramienta no expone ninguna ruta HTTP. Un manifiesto no sustituye a
  la evidencia: apply solo escribe cuando el estado leído bajo lock coincide
  exactamente con lo que el manifiesto declara.`;

/** Parsea argv sin dependencias externas. No toca la base de datos. */
export function parseArgs(argv: readonly string[]): LegacyCliOptions {
  const args = [...argv];
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    throw new LegacyCliError('__HELP__', 0);
  }

  const mode = args.shift() as LegacyMode;
  if (!MODES.includes(mode)) {
    throw new LegacyCliError(
      `Modo desconocido "${mode}". Modos válidos: ${MODES.join(', ')}.`,
    );
  }

  let adminId: number | null = null;
  let manifestPath: string | null = null;
  let projectId: number | null = null;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const readValue = (): string => {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new LegacyCliError(`La opción ${flag} requiere un valor.`);
      }
      index += 1;
      return value;
    };

    switch (flag) {
      case '--admin':
        adminId = parsePositiveInt(readValue(), '--admin');
        break;
      case '--manifest':
        manifestPath = readValue();
        break;
      case '--project':
        projectId = parsePositiveInt(readValue(), '--project');
        break;
      case '--json':
        json = true;
        break;
      default:
        throw new LegacyCliError(`Opción desconocida "${flag}".`);
    }
  }

  if (adminId === null) {
    throw new LegacyCliError('Falta --admin <idUsuario>: ningún modo se ejecuta sin actor.');
  }
  if ((mode === 'apply' || mode === 'verify') && manifestPath === null) {
    throw new LegacyCliError(`El modo ${mode} requiere --manifest <ruta>.`);
  }

  return { mode, adminId, manifestPath, projectId, json };
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new LegacyCliError(`${flag} debe ser un entero positivo, no "${raw}".`);
  }
  return value;
}

/**
 * Resuelve al actor contra la base: mismo criterio que
 * `ProjectPolicyService.assertAdmin` (usuarioRolAcceso → 'administrador').
 * Una lectura, cero escrituras.
 */
export async function resolveAdmin(
  prisma: Pick<PrismaClient, 'usuarioRolAcceso'>,
  adminId: number,
): Promise<{ idUsuario: number; nombre: string; apellido: string; correo: string }> {
  const record = await prisma.usuarioRolAcceso.findFirst({
    where: { idUsuario: adminId, rolAcceso: { nombrePerfil: 'administrador' } },
    select: {
      usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } },
    },
  });
  if (!record) {
    throw new LegacyCliError(
      `El usuario ${adminId} no es administrador en esta base de datos.`,
      3,
    );
  }
  return record.usuario;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  let options: LegacyCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof LegacyCliError && error.message === '__HELP__') {
      process.stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${HELP_TEXT}\n`);
    return error instanceof LegacyCliError ? error.exitCode : 2;
  }

  const prisma = new PrismaClient();
  try {
    const admin = await resolveAdmin(prisma, options.adminId);
    process.stderr.write(
      `Actor: ${admin.nombre} ${admin.apellido} <${admin.correo}> (id ${admin.idUsuario})\n`,
    );

    switch (options.mode) {
      case 'diagnose':
        process.stderr.write('El modo diagnose todavía no está implementado.\n');
        return 4;
      case 'apply':
        process.stderr.write('El modo apply todavía no está implementado.\n');
        return 4;
      case 'verify':
        process.stderr.write('El modo verify todavía no está implementado.\n');
        return 4;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return error instanceof LegacyCliError ? error.exitCode : 1;
  } finally {
    await prisma.$disconnect();
  }
}

/* c8 ignore start -- arranque del proceso, no parte del contrato verificable */
if (process.argv[1] && process.argv[1].endsWith('sprint7-legacy.ts')) {
  void runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
/* c8 ignore stop */
