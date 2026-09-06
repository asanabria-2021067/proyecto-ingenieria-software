import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Sprint 7 (06 v2 §32): fuente enumerada del identificador de proyecto de
 * una ruta de escritura. El resolutor solo establece IDENTIDAD (a qué
 * proyecto pertenece la operación) leyendo el mínimo de columnas; nunca
 * autoriza, nunca bloquea filas y nunca sustituye al actor. El service
 * repite la pertenencia real dentro de la transacción.
 *
 * Fuentes: `param(projectId|id|idProyecto)`, `task`, `comment`,
 * `application`, `hito` y `body(projectId|idProyecto|idRolProyecto)`. Las
 * entidades pueden identificarse desde `params` (por defecto) o desde
 * `body`, indicando el nombre del campo. Cualquier otra fuente se rechaza.
 */
export type ProjectIdSource =
  | { kind: 'param'; name: 'projectId' | 'id' | 'idProyecto' }
  | { kind: 'task'; from?: 'params' | 'body'; name?: string }
  | { kind: 'comment'; from?: 'params' | 'body'; name?: string }
  | { kind: 'application'; from?: 'params' | 'body'; name?: string }
  | { kind: 'hito'; from?: 'params' | 'body'; name?: string }
  | { kind: 'body'; field: 'projectId' | 'idProyecto' | 'idRolProyecto' };

export const DEFAULT_ENTITY_PARAM: Record<'task' | 'comment' | 'application' | 'hito', string> = {
  task: 'taskId',
  comment: 'idComentario',
  application: 'id',
  hito: 'idHito',
};

export interface ProjectIdRequestLike {
  params?: Record<string, unknown> | undefined;
  body?: unknown;
}

export type ResolvedProjectEntity =
  | { type: 'task'; idTarea: number; idProyecto: number; idSprint: number; eliminadoEn: Date | null }
  | {
      type: 'comment';
      idComentario: number;
      idAutor: number;
      idProyecto: number | null;
      idTarea: number | null;
      idHito: number | null;
      eliminadoEn: Date | null;
      tarea: { idProyecto: number; idSprint: number } | null;
      hito: { idProyecto: number } | null;
    }
  | {
      type: 'application';
      idPostulacion: number;
      idUsuarioPostulante: number;
      idRolProyecto: number;
      estadoPostulacion: string;
      rolProyecto: { idProyecto: number };
    }
  | { type: 'hito'; idHito: number; idProyecto: number }
  | { type: 'role'; idRolProyecto: number; idProyecto: number };

export interface ResolvedProjectId {
  projectId: number;
  source: ProjectIdSource;
  entity: ResolvedProjectEntity | null;
}

export const INVALID_PROJECT_ID_MESSAGE = 'projectId debe ser un número entero';

function parseIdentifier(raw: unknown, message: string): number {
  if (raw === undefined || raw === null || raw === '') {
    throw new BadRequestException(message);
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || (typeof raw === 'string' && raw.trim() === '')) {
    throw new BadRequestException(message);
  }
  return value;
}

function readField(request: ProjectIdRequestLike, from: 'params' | 'body', name: string): unknown {
  const container = from === 'params' ? request.params : request.body;
  if (container === undefined || container === null || typeof container !== 'object') {
    return undefined;
  }
  return (container as Record<string, unknown>)[name];
}

@Injectable()
export class ProjectIdResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el proyecto según una lista de fuentes candidatas en orden: se
   * usa la primera cuyo identificador está presente en la request. Si
   * ninguna lo aporta, 400. Un `projectId`/`idProyecto` adicional presente
   * en la request que contradiga al de la entidad resuelta produce 404: la
   * entidad manda, nunca el identificador aportado por el cliente.
   */
  async resolve(
    sources: ProjectIdSource | ProjectIdSource[],
    request: ProjectIdRequestLike,
  ): Promise<ResolvedProjectId> {
    const candidates = Array.isArray(sources) ? sources : [sources];
    if (candidates.length === 0) {
      throw new BadRequestException('La ruta no declara ninguna fuente de proyecto');
    }

    const source =
      candidates.find((candidate) => this.identifierOf(candidate, request) !== undefined) ??
      candidates[0];
    const resolved = await this.resolveOne(source, request);
    this.assertNoContradictoryProjectId(resolved, request);
    return resolved;
  }

  private identifierOf(source: ProjectIdSource, request: ProjectIdRequestLike): unknown {
    switch (source.kind) {
      case 'param':
        return readField(request, 'params', source.name);
      case 'body':
        return readField(request, 'body', source.field);
      case 'task':
      case 'comment':
      case 'application':
      case 'hito':
        return readField(request, source.from ?? 'params', source.name ?? DEFAULT_ENTITY_PARAM[source.kind]);
      default:
        return undefined;
    }
  }

  private async resolveOne(
    source: ProjectIdSource,
    request: ProjectIdRequestLike,
  ): Promise<ResolvedProjectId> {
    switch (source.kind) {
      case 'param': {
        const projectId = parseIdentifier(readField(request, 'params', source.name), INVALID_PROJECT_ID_MESSAGE);
        return { projectId, source, entity: null };
      }
      case 'body': {
        const raw = readField(request, 'body', source.field);
        if (source.field === 'idRolProyecto') {
          const idRolProyecto = parseIdentifier(raw, 'idRolProyecto debe ser un número entero');
          const role = await this.prisma.rolProyecto.findUnique({
            where: { idRolProyecto },
            select: { idRolProyecto: true, idProyecto: true },
          });
          if (!role) {
            throw new NotFoundException(`Rol con id ${idRolProyecto} no encontrado`);
          }
          return { projectId: role.idProyecto, source, entity: { type: 'role', ...role } };
        }
        const projectId = parseIdentifier(raw, INVALID_PROJECT_ID_MESSAGE);
        return { projectId, source, entity: null };
      }
      case 'task': {
        const idTarea = parseIdentifier(this.identifierOf(source, request), 'taskId debe ser un número entero');
        const task = await this.prisma.tarea.findUnique({
          where: { idTarea },
          select: { idTarea: true, idProyecto: true, idSprint: true, eliminadoEn: true },
        });
        if (!task) {
          throw new NotFoundException(`Tarea con id ${idTarea} no encontrada`);
        }
        return { projectId: task.idProyecto, source, entity: { type: 'task', ...task } };
      }
      case 'comment': {
        const idComentario = parseIdentifier(
          this.identifierOf(source, request),
          'idComentario debe ser un número entero',
        );
        const comment = await this.prisma.comentario.findUnique({
          where: { idComentario },
          select: {
            idComentario: true,
            idAutor: true,
            idProyecto: true,
            idTarea: true,
            idHito: true,
            eliminadoEn: true,
            tarea: { select: { idProyecto: true, idSprint: true } },
            hito: { select: { idProyecto: true } },
          },
        });
        const projectId = comment?.idProyecto ?? comment?.tarea?.idProyecto ?? comment?.hito?.idProyecto ?? null;
        if (!comment || projectId === null) {
          throw new NotFoundException(`Comentario con id ${idComentario} no encontrado`);
        }
        return { projectId, source, entity: { type: 'comment', ...comment } };
      }
      case 'application': {
        const idPostulacion = parseIdentifier(
          this.identifierOf(source, request),
          'id de postulación debe ser un número entero',
        );
        const application = await this.prisma.postulacion.findUnique({
          where: { idPostulacion },
          select: {
            idPostulacion: true,
            idUsuarioPostulante: true,
            idRolProyecto: true,
            estadoPostulacion: true,
            rolProyecto: { select: { idProyecto: true } },
          },
        });
        if (!application) {
          throw new NotFoundException(`Postulación con id ${idPostulacion} no encontrada`);
        }
        return {
          projectId: application.rolProyecto.idProyecto,
          source,
          entity: { type: 'application', ...application },
        };
      }
      case 'hito': {
        const idHito = parseIdentifier(this.identifierOf(source, request), 'idHito debe ser un número entero');
        const hito = await this.prisma.hito.findUnique({
          where: { idHito },
          select: { idHito: true, idProyecto: true },
        });
        if (!hito) {
          throw new NotFoundException(`Hito con id ${idHito} no encontrado`);
        }
        return { projectId: hito.idProyecto, source, entity: { type: 'hito', ...hito } };
      }
      default: {
        const unknown = source as { kind?: unknown };
        throw new BadRequestException(`Fuente de proyecto desconocida: ${String(unknown.kind)}`);
      }
    }
  }

  /**
   * Si la entidad resolvió el proyecto y la request trae además un
   * identificador de proyecto distinto, la operación es cruzada: 404.
   */
  private assertNoContradictoryProjectId(resolved: ResolvedProjectId, request: ProjectIdRequestLike): void {
    if (resolved.entity === null) {
      return;
    }
    const candidates: unknown[] = [
      readField(request, 'params', 'projectId'),
      readField(request, 'params', 'idProyecto'),
      readField(request, 'body', 'projectId'),
      readField(request, 'body', 'idProyecto'),
    ];
    for (const raw of candidates) {
      if (raw === undefined || raw === null || raw === '') {
        continue;
      }
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isInteger(value) && value !== resolved.projectId) {
        throw new NotFoundException(`Recurso no encontrado en el proyecto ${value}`);
      }
    }
  }
}
