import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EstadoOrganizacion,
  EstadoPostulacion,
  EstadoProyecto,
  EstadoSprint,
  EstadoTarea,
  EstadoUsuario,
  ModalidadProyecto,
  Prioridad,
  Prisma,
  TipoNotificacion,
  TipoOrganizacion,
  TipoProyecto,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdmin } from '../common/guards/assert-admin';
import { buildCsv } from '../exports/csv-export.util';
import { AdminTablasQueryDto } from './dto/admin-tablas-query.dto';

type Fila = Record<string, unknown>;
type TipoFiltro = 'int' | 'bool' | 'texto' | Record<string, string>;

interface Delegate {
  findMany(args: object): Promise<Fila[]>;
  findUnique(args: object): Promise<Fila | null>;
  count(args: object): Promise<number>;
}

interface Entidad {
  etiqueta: string;
  delegate: string;
  pk: string;
  /** Lista blanca: solo estas columnas se leen, filtran, ordenan o exportan. */
  columnas: string[];
  correos?: string[];
  busqueda?: string[];
  filtros?: Record<string, TipoFiltro>;
}

// Los chat, las contraseñas, tokens, llaves, JSON libres y textos escritos por usuarios no figuran en ninguna lista.
export const ENTIDADES: Record<string, Entidad> = {
  usuarios: {
    etiqueta: 'Usuarios',
    delegate: 'usuario',
    pk: 'idUsuario',
    columnas: ['idUsuario', 'correo', 'nombre', 'apellido', 'estado', 'fechaCreacion', 'fechaUltimaSesion'],
    correos: ['correo'],
    busqueda: ['nombre', 'apellido', 'correo'],
    filtros: { estado: EstadoUsuario },
  },
  proyectos: {
    etiqueta: 'Proyectos',
    delegate: 'proyecto',
    pk: 'idProyecto',
    columnas: [
      'idProyecto',
      'tituloProyecto',
      'tipoProyecto',
      'estadoProyecto',
      'modalidadProyecto',
      'creadoPor',
      'idAsociacion',
      'fechaPublicacion',
      'fechaInicio',
      'fechaFinEstimada',
      'fechaCreacion',
      'eliminadoEn',
    ],
    busqueda: ['tituloProyecto'],
    filtros: {
      estadoProyecto: EstadoProyecto,
      tipoProyecto: TipoProyecto,
      modalidadProyecto: ModalidadProyecto,
      creadoPor: 'int',
      idAsociacion: 'int',
    },
  },
  'roles-proyecto': {
    etiqueta: 'Roles de proyecto',
    delegate: 'rolProyecto',
    pk: 'idRolProyecto',
    columnas: ['idRolProyecto', 'idProyecto', 'nombreRol', 'cupos', 'horasSemanalesEstimadas', 'idCarreraRequerida'],
    busqueda: ['nombreRol'],
    filtros: { idProyecto: 'int' },
  },
  postulaciones: {
    etiqueta: 'Postulaciones',
    delegate: 'postulacion',
    pk: 'idPostulacion',
    columnas: [
      'idPostulacion',
      'idUsuarioPostulante',
      'idRolProyecto',
      'estadoPostulacion',
      'fechaPostulacion',
      'fechaResolucion',
      'resueltaPor',
    ],
    filtros: { estadoPostulacion: EstadoPostulacion, idUsuarioPostulante: 'int', idRolProyecto: 'int' },
  },
  tareas: {
    etiqueta: 'Tareas',
    delegate: 'tarea',
    pk: 'idTarea',
    columnas: [
      'idTarea',
      'idProyecto',
      'idSprint',
      'tituloTarea',
      'estadoTarea',
      'prioridad',
      'tiempoEstimadoHoras',
      'puntosHistoria',
      'creadaPor',
      'fechaCreacion',
      'fechaLimite',
      'eliminadoEn',
    ],
    busqueda: ['tituloTarea'],
    filtros: { estadoTarea: EstadoTarea, prioridad: Prioridad, idProyecto: 'int', idSprint: 'int' },
  },
  sprints: {
    etiqueta: 'Sprints',
    delegate: 'sprint',
    pk: 'idSprint',
    columnas: ['idSprint', 'idProyecto', 'numero', 'estado', 'fechaInicio', 'fechaFinPlaneada', 'fechaCierre', 'cerradoPor'],
    filtros: { estado: EstadoSprint, idProyecto: 'int' },
  },
  horas: {
    etiqueta: 'Horas',
    delegate: 'registroTiempoTarea',
    pk: 'idRegistroTiempo',
    columnas: ['idRegistroTiempo', 'idAsignacion', 'idUsuario', 'horas', 'fecha', 'creadoEn', 'editadoEn', 'revocadoEn'],
    filtros: { idUsuario: 'int', idAsignacion: 'int' },
  },
  organizaciones: {
    etiqueta: 'Organizaciones',
    delegate: 'organizacion',
    pk: 'idOrganizacion',
    columnas: [
      'idOrganizacion',
      'nombreOrganizacion',
      'tipoOrganizacion',
      'correoContacto',
      'estadoOrganizacion',
      'creadaPor',
      'fechaCreacion',
    ],
    correos: ['correoContacto'],
    busqueda: ['nombreOrganizacion'],
    filtros: { tipoOrganizacion: TipoOrganizacion, estadoOrganizacion: EstadoOrganizacion },
  },
  asociaciones: {
    etiqueta: 'Asociaciones',
    delegate: 'asociacion',
    pk: 'idAsociacion',
    columnas: ['idAsociacion', 'nombre', 'archivada', 'fechaCreacion', 'fechaActualizacion'],
    busqueda: ['nombre'],
    filtros: { archivada: 'bool' },
  },
  notificaciones: {
    etiqueta: 'Notificaciones',
    delegate: 'notificacion',
    pk: 'idNotificacion',
    columnas: ['idNotificacion', 'idUsuario', 'tipoNotificacion', 'creadaEn', 'leidaEn'],
    filtros: { tipoNotificacion: TipoNotificacion, idUsuario: 'int' },
  },
  bitacora: {
    etiqueta: 'Bitácora',
    delegate: 'bitacoraAuditoria',
    pk: 'idAuditoria',
    columnas: ['idAuditoria', 'idUsuario', 'accion', 'tipoObjeto', 'idObjeto', 'ipOrigen', 'fechaEvento'],
    busqueda: ['accion', 'tipoObjeto', 'idObjeto'],
    filtros: { idUsuario: 'int', tipoObjeto: 'texto' },
  },
};

const MAX_EXPORTACION = 5000;

export const enmascararCorreo = (correo: string): string => {
  const [local, dominio] = correo.split('@');
  return dominio ? `${local.slice(0, 1)}***@${dominio}` : '***';
};

@Injectable()
export class AdminTablasService {
  constructor(private readonly prisma: PrismaService) {}

  private entidad(clave: string): Entidad {
    const entidad = Object.keys(ENTIDADES).includes(clave) ? ENTIDADES[clave] : undefined;
    if (!entidad) throw new NotFoundException('Entidad no disponible');
    return entidad;
  }

  private delegate(entidad: Entidad): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[entidad.delegate];
  }

  private select(entidad: Entidad) {
    return Object.fromEntries(entidad.columnas.map((c) => [c, true]));
  }

  private parseFiltros(entidad: Entidad, texto?: string): Fila {
    const where: Fila = {};
    for (const par of texto ? texto.split(',') : []) {
      const [columna, ...resto] = par.split(':');
      const valor = resto.join(':').trim();
      const tipo = Object.keys(entidad.filtros ?? {}).includes(columna) ? entidad.filtros?.[columna] : undefined;
      if (!tipo) throw new BadRequestException(`Filtro no permitido: ${columna}`);
      if (tipo === 'int' && /^\d{1,9}$/.test(valor)) where[columna] = Number(valor);
      else if (tipo === 'bool' && (valor === 'true' || valor === 'false')) where[columna] = valor === 'true';
      else if (typeof tipo === 'object' && Object.values(tipo).includes(valor)) where[columna] = valor;
      else if (tipo === 'texto' && valor.length > 0 && valor.length <= 100) where[columna] = valor;
      else throw new BadRequestException(`Valor no válido para el filtro ${columna}`);
    }
    return where;
  }

  private armarConsulta(entidad: Entidad, query: AdminTablasQueryDto) {
    const where: Fila = this.parseFiltros(entidad, query.filtros);
    const q = query.q?.trim();
    if (q) {
      if (!entidad.busqueda) throw new BadRequestException('Esta entidad no admite búsqueda de texto');
      where.OR = entidad.busqueda.map((c) => ({ [c]: { contains: q, mode: 'insensitive' } }));
    }
    const orden = query.orden ?? entidad.pk;
    if (!entidad.columnas.includes(orden)) throw new BadRequestException(`Orden no permitido: ${orden}`);
    const dir = query.dir ?? 'desc';
    const orderBy = orden === entidad.pk ? [{ [orden]: dir }] : [{ [orden]: dir }, { [entidad.pk]: 'desc' }];
    return { where, orderBy };
  }

  private presentar(entidad: Entidad, fila: Fila, enmascarar: boolean): Fila {
    if (!enmascarar || !entidad.correos) return fila;
    const copia = { ...fila };
    for (const c of entidad.correos) if (typeof copia[c] === 'string') copia[c] = enmascararCorreo(copia[c]);
    return copia;
  }

  private registrar(idActor: number, accion: string, clave: string, idObjeto: number | null, detalle: object) {
    return this.prisma.bitacoraAuditoria.create({
      data: {
        idUsuario: idActor,
        accion,
        tipoObjeto: `Tabla:${clave}`,
        idObjeto: idObjeto === null ? null : String(idObjeto),
        detalleJson: detalle as Prisma.InputJsonValue,
      },
    });
  }

  async listarEntidades(idActor: number) {
    await assertAdmin(this.prisma, idActor);
    return Object.entries(ENTIDADES).map(([clave, e]) => ({
      clave,
      etiqueta: e.etiqueta,
      columnas: e.columnas,
      filtros: Object.entries(e.filtros ?? {}).map(([columna, tipo]) => ({
        columna,
        tipo: typeof tipo === 'string' ? tipo : 'enum',
        valores: typeof tipo === 'string' ? undefined : Object.values(tipo),
      })),
      busqueda: Boolean(e.busqueda),
    }));
  }

  async consultar(idActor: number, clave: string, query: AdminTablasQueryDto) {
    await assertAdmin(this.prisma, idActor);
    const entidad = this.entidad(clave);
    const { where, orderBy } = this.armarConsulta(entidad, query);
    const pagina = query.pagina ?? 1;
    const limite = query.limite ?? 20;
    const delegate = this.delegate(entidad);
    const [filas, total] = await Promise.all([
      delegate.findMany({ where, orderBy, skip: (pagina - 1) * limite, take: limite, select: this.select(entidad) }),
      delegate.count({ where }),
    ]);
    await this.registrar(idActor, 'ADMIN_TABLA_CONSULTA', clave, null, { ...query, total });
    return { filas: filas.map((f) => this.presentar(entidad, f, true)), total, pagina, limite };
  }

  async detalle(idActor: number, clave: string, id: number) {
    await assertAdmin(this.prisma, idActor);
    const entidad = this.entidad(clave);
    const fila = await this.delegate(entidad).findUnique({ where: { [entidad.pk]: id }, select: this.select(entidad) });
    if (!fila) throw new NotFoundException('Registro no encontrado');
    await this.registrar(idActor, 'ADMIN_TABLA_DETALLE', clave, id, {});
    return fila;
  }

  async exportar(idActor: number, clave: string, query: AdminTablasQueryDto) {
    await assertAdmin(this.prisma, idActor);
    const entidad = this.entidad(clave);
    const { where, orderBy } = this.armarConsulta(entidad, query);
    const filas = await this.delegate(entidad).findMany({
      where,
      orderBy,
      take: MAX_EXPORTACION,
      select: this.select(entidad),
    });
    await this.registrar(idActor, 'ADMIN_TABLA_EXPORTACION', clave, null, { ...query, filas: filas.length });
    const celda = (v: unknown): string | number =>
      v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'number' ? v : String(v);
    return buildCsv(
      entidad.columnas,
      filas.map((f) => {
        const visible = this.presentar(entidad, f, true);
        return entidad.columnas.map((c) => celda(visible[c]));
      }),
    );
  }
}
