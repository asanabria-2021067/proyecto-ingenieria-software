import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TipoProyecto } from '@prisma/client';
import { addDaysToDay, guatemalaDayOf, todayInGuatemala } from '../common/utils/guatemala-date';
import type { DatosConstancia } from '../exports/constancia-horas.builder';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRegistroHorasDto } from './dto/update-registro-horas.dto';
import { HorasCentralListQueryDto, HorasCentralQueryDto } from './dto/horas-central-query.dto';
import {
  esEnRiesgo,
  necesitaRegistro,
  proyectarFechaMeta,
  semestreDe,
  semestreDeAnioPeriodo,
  type Semestre,
} from './semestre';

interface Acreditadas {
  beca: number;
  extension: number;
}

export interface FilaHorasCentral {
  idUsuario: number;
  nombre: string;
  apellido: string;
  carne: string;
  idCarrera: number | null;
  /** Semestre academico del estudiante en su carrera. */
  semestreCarrera: number | null;
  carrera: string | null;
  metaBeca: number | null;
  becaDeclarada: number;
  becaAcreditada: number;
  faltaBeca: number | null;
  metaExtension: number | null;
  extensionDeclarada: number;
  extensionAcreditada: number;
  faltaExtension: number | null;
  enRiesgo: boolean;
  /** Solo en la vista de asociacion. */
  proyectosActivos?: number;
}

export type TipoHoras = 'BECA' | 'EXTENSION';

export interface FiltroCentral extends HorasCentralListQueryDto {
  /** Solo con este tipo se evalua el riesgo. */
  tipo?: TipoHoras;
  busqueda?: string;
  conProyectos?: boolean;
}

const ESTADOS_ACTIVOS = ['PUBLICADO', 'EN_PROGRESO', 'EN_SOLICITUD_CIERRE'] as const;

const LOTE_EN_RIESGO = 200;
const LOTE_REPORTE = 100;

/** Instante UTC del inicio de un dia de Guatemala (UTC-6, sin horario de verano). */
export const inicioDeDia = (dia: string) => new Date(`${dia}T06:00:00Z`);

const ventana = (s: Semestre) => ({ gte: inicioDeDia(s.inicio), lt: inicioDeDia(addDaysToDay(s.fin, 1)) });

const falta = (meta: number | null, avance: number) => (meta === null ? null : Math.max(meta - avance, 0));

const enRiesgoMeta = (meta: number | null, avance: number, s: Semestre, hoy: string) =>
  meta !== null && meta > 0 && esEnRiesgo((avance / meta) * 100, s.inicio, s.fin, hoy);

@Injectable()
export class HorasSemestreService {
  constructor(private readonly prisma: PrismaService) {}

  private semestreDeQuery(q: { anio?: number; periodo?: 1 | 2 }): Semestre {
    const actual = semestreDe(new Date());
    return semestreDeAnioPeriodo(q.anio ?? actual.anio, q.periodo ?? actual.periodo);
  }

  /** Horas aprobadas por un administrador cuya fecha de aprobacion cae en el semestre, por usuario. */
  private async acreditadasPorUsuario(s: Semestre, idsUsuario: number[]) {
    const filas = await this.prisma.horasParticipacion.findMany({
      where: {
        estadoHoras: 'APROBADA',
        fechaAprobacion: ventana(s),
        participacion: { idUsuario: { in: idsUsuario } },
      },
      select: {
        horasAprobadas: true,
        participacion: {
          select: { idUsuario: true, rolProyecto: { select: { proyecto: { select: { tipoProyecto: true } } } } },
        },
      },
    });
    const mapa = new Map<number, Acreditadas>();
    for (const f of filas) {
      const acc = mapa.get(f.participacion.idUsuario) ?? { beca: 0, extension: 0 };
      const horas = Number(f.horasAprobadas ?? 0);
      const tipo = f.participacion.rolProyecto.proyecto.tipoProyecto;
      if (tipo === TipoProyecto.ACADEMICO_HORAS_BECA) acc.beca += horas;
      else if (tipo === TipoProyecto.EXTRACURRICULAR_EXTENSION) acc.extension += horas;
      mapa.set(f.participacion.idUsuario, acc);
    }
    return mapa;
  }

  private registroDe(idUsuario: number, s: Semestre) {
    return this.prisma.registroHorasSemestre.findUnique({
      where: { idUsuario_anio_periodo: { idUsuario, anio: s.anio, periodo: s.periodo } },
    });
  }

  async getActual(idUsuario: number) {
    const semestre = semestreDe(new Date());
    const [registro, totalRegistros] = await Promise.all([
      this.registroDe(idUsuario, semestre),
      this.prisma.registroHorasSemestre.count({ where: { idUsuario } }),
    ]);
    return {
      semestre,
      registro,
      necesitaRegistro: necesitaRegistro({
        hoy: todayInGuatemala(),
        tieneRegistroActual: registro !== null,
        tieneAlgunRegistro: totalRegistros > 0,
      }),
    };
  }

  actualizarActual(idUsuario: number, dto: UpdateRegistroHorasDto) {
    const { anio, periodo } = semestreDe(new Date());
    const data = {
      ...(dto.metaBeca !== undefined && { metaBeca: dto.metaBeca }),
      ...(dto.becaDeclarada !== undefined && { becaDeclarada: dto.becaDeclarada }),
      ...(dto.metaExtension !== undefined && { metaExtension: dto.metaExtension }),
      ...(dto.extensionDeclarada !== undefined && { extensionDeclarada: dto.extensionDeclarada }),
    };
    return this.prisma.registroHorasSemestre.upsert({
      where: { idUsuario_anio_periodo: { idUsuario, anio, periodo } },
      create: { idUsuario, anio, periodo, ...data },
      update: data,
    });
  }

  async getProgreso(idUsuario: number) {
    const semestre = semestreDe(new Date());
    const hoy = todayInGuatemala();
    const [registro, acreditadas] = await Promise.all([
      this.registroDe(idUsuario, semestre),
      this.acreditadasPorUsuario(semestre, [idUsuario]),
    ]);
    const acred = acreditadas.get(idUsuario) ?? { beca: 0, extension: 0 };
    const tramo = (meta: number | null, declaradas: number, acreditadas: number) => {
      const avance = declaradas + acreditadas;
      return {
        meta,
        declaradas,
        acreditadas,
        avance,
        falta: falta(meta, avance),
        fechaProyectada: proyectarFechaMeta({ avance, meta, inicioSemestre: semestre.inicio, hoy }),
        enRiesgo: enRiesgoMeta(meta, avance, semestre, hoy),
      };
    };
    return {
      semestre,
      beca: tramo(registro?.metaBeca ?? null, registro?.becaDeclarada ?? 0, acred.beca),
      extension: tramo(registro?.metaExtension ?? null, registro?.extensionDeclarada ?? 0, acred.extension),
    };
  }

  /** MEJ-11: horas acreditadas (aprobadas) del propio estudiante en un semestre, por proyecto. Solo datos propios. */
  async datosConstancia(idUsuario: number, q: { anio?: number; periodo?: 1 | 2 }): Promise<DatosConstancia> {
    const semestre = this.semestreDeQuery(q);
    const [usuario, aprobadas] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { idUsuario },
        select: {
          nombre: true,
          apellido: true,
          perfil: { select: { carne: true, carrera: { select: { nombreCarrera: true } } } },
        },
      }),
      this.prisma.horasParticipacion.findMany({
        where: { estadoHoras: 'APROBADA', fechaAprobacion: ventana(semestre), participacion: { idUsuario } },
        orderBy: { fechaAprobacion: 'asc' },
        select: {
          horasAprobadas: true,
          fechaAprobacion: true,
          participacion: {
            select: {
              rolProyecto: {
                select: { nombreRol: true, proyecto: { select: { tituloProyecto: true, tipoProyecto: true } } },
              },
            },
          },
        },
      }),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    const filas: DatosConstancia['filas'] = [];
    for (const a of aprobadas) {
      const { nombreRol, proyecto } = a.participacion.rolProyecto;
      const tipo =
        proyecto.tipoProyecto === TipoProyecto.ACADEMICO_HORAS_BECA
          ? 'beca'
          : proyecto.tipoProyecto === TipoProyecto.EXTRACURRICULAR_EXTENSION
            ? 'extension'
            : null;
      if (!tipo) continue;
      filas.push({
        proyecto: proyecto.tituloProyecto,
        rol: nombreRol,
        tipo,
        horas: Number(a.horasAprobadas ?? 0),
        fecha: guatemalaDayOf(a.fechaAprobacion!),
      });
    }
    return {
      nombre: `${usuario.nombre} ${usuario.apellido}`,
      carne: usuario.perfil?.carne ?? '',
      carrera: usuario.perfil?.carrera?.nombreCarrera ?? null,
      semestre: { anio: semestre.anio, periodo: semestre.periodo },
      emitida: todayInGuatemala(),
      filas,
    };
  }

  /** Desglose por semestre: lo declarado mas lo acreditado en cada uno, el mas reciente primero. */
  async getHistorial(idUsuario: number) {
    const [registros, aprobadas] = await Promise.all([
      this.prisma.registroHorasSemestre.findMany({ where: { idUsuario } }),
      this.prisma.horasParticipacion.findMany({
        where: { estadoHoras: 'APROBADA', fechaAprobacion: { not: null }, participacion: { idUsuario } },
        select: {
          horasAprobadas: true,
          fechaAprobacion: true,
          participacion: { select: { rolProyecto: { select: { proyecto: { select: { tipoProyecto: true } } } } } },
        },
      }),
    ]);
    const porSemestre = new Map<
      string,
      {
        semestre: Semestre;
        metaBeca: number | null;
        becaDeclarada: number;
        becaAcreditada: number;
        metaExtension: number | null;
        extensionDeclarada: number;
        extensionAcreditada: number;
      }
    >();
    const entrada = (semestre: Semestre) => {
      const clave = `${semestre.anio}-${semestre.periodo}`;
      let e = porSemestre.get(clave);
      if (!e) {
        e = {
          semestre,
          metaBeca: null,
          becaDeclarada: 0,
          becaAcreditada: 0,
          metaExtension: null,
          extensionDeclarada: 0,
          extensionAcreditada: 0,
        };
        porSemestre.set(clave, e);
      }
      return e;
    };
    for (const r of registros) {
      Object.assign(entrada(semestreDeAnioPeriodo(r.anio, r.periodo as 1 | 2)), {
        metaBeca: r.metaBeca,
        becaDeclarada: r.becaDeclarada,
        metaExtension: r.metaExtension,
        extensionDeclarada: r.extensionDeclarada,
      });
    }
    for (const a of aprobadas) {
      const e = entrada(semestreDe(a.fechaAprobacion!));
      const horas = Number(a.horasAprobadas ?? 0);
      const tipo = a.participacion.rolProyecto.proyecto.tipoProyecto;
      if (tipo === TipoProyecto.ACADEMICO_HORAS_BECA) e.becaAcreditada += horas;
      else if (tipo === TipoProyecto.EXTRACURRICULAR_EXTENSION) e.extensionAcreditada += horas;
    }
    return [...porSemestre.values()].sort(
      (a, b) => b.semestre.anio - a.semestre.anio || b.semestre.periodo - a.semestre.periodo,
    );
  }

  /**
   * Pagina con cursor (idUsuario) de los estudiantes activos con sus horas del semestre.
   * `enRiesgo` se evalua despues de calcular, asi que recorre lotes hasta llenar la pagina.
   */
  async listarCentral(idActor: number, q: HorasCentralListQueryDto) {
    await this.requireAdmin(idActor);
    return this.paginaCentral(q);
  }

  private async requireAdmin(idUsuario: number) {
    const rol = await this.prisma.usuarioRolAcceso.findFirst({
      where: { idUsuario, rolAcceso: { nombrePerfil: 'administrador' } },
    });
    if (!rol) throw new ForbiddenException('Acceso restringido a administradores');
  }

  /** Proyectos activos (participacion activa) por usuario. */
  private async proyectosActivosPorUsuario(idsUsuario: number[]) {
    const filas = await this.prisma.participacionProyecto.findMany({
      where: {
        idUsuario: { in: idsUsuario },
        estadoParticipacion: 'ACTIVO',
        rolProyecto: { proyecto: { estadoProyecto: { in: [...ESTADOS_ACTIVOS] }, eliminadoEn: null } },
      },
      select: { idUsuario: true, rolProyecto: { select: { idProyecto: true } } },
    });
    const mapa = new Map<number, Set<number>>();
    for (const f of filas) {
      const set = mapa.get(f.idUsuario) ?? new Set<number>();
      set.add(f.rolProyecto.idProyecto);
      mapa.set(f.idUsuario, set);
    }
    return mapa;
  }

  async paginaCentral(q: FiltroCentral) {
    const semestre = this.semestreDeQuery(q);
    const hoy = todayInGuatemala();
    const limit = q.limit ?? 50;
    const lote = q.enRiesgo ? LOTE_EN_RIESGO : limit + 1;
    const filas: FilaHorasCentral[] = [];
    let cursor = q.cursor ?? 0;
    const terminos = (q.busqueda ?? '').trim().split(/\s+/).filter(Boolean);

    while (filas.length <= limit) {
      const usuarios = await this.prisma.usuario.findMany({
        where: {
          idUsuario: { gt: cursor },
          estado: 'ACTIVO',
          ...(terminos.length
            ? {
                AND: terminos.map((t) => ({
                  OR: [
                    { nombre: { contains: t, mode: 'insensitive' as const } },
                    { apellido: { contains: t, mode: 'insensitive' as const } },
                    { perfil: { is: { carne: { contains: t, mode: 'insensitive' as const } } } },
                  ],
                })),
              }
            : {}),
          perfil: {
            is: {
              ...(q.idCarrera ? { idCarrera: q.idCarrera } : {}),
              ...(q.idAsociacion ? { carrera: { asociaciones: { some: { idAsociacion: q.idAsociacion } } } } : {}),
            },
          },
        },
        orderBy: { idUsuario: 'asc' },
        take: lote,
        select: {
          idUsuario: true,
          nombre: true,
          apellido: true,
          perfil: { select: { carne: true, idCarrera: true, semestre: true, carrera: { select: { nombreCarrera: true } } } },
          registrosHorasSemestre: { where: { anio: semestre.anio, periodo: semestre.periodo } },
        },
      });
      const acreditadas = await this.acreditadasPorUsuario(semestre, usuarios.map((u) => u.idUsuario));
      const proyectos = q.conProyectos ? await this.proyectosActivosPorUsuario(usuarios.map((u) => u.idUsuario)) : null;
      for (const u of usuarios) {
        cursor = u.idUsuario;
        const r = u.registrosHorasSemestre[0];
        const acred = acreditadas.get(u.idUsuario) ?? { beca: 0, extension: 0 };
        const avanceBeca = (r?.becaDeclarada ?? 0) + acred.beca;
        const avanceExt = (r?.extensionDeclarada ?? 0) + acred.extension;
        const enRiesgo =
          (q.tipo !== 'EXTENSION' && enRiesgoMeta(r?.metaBeca ?? null, avanceBeca, semestre, hoy)) ||
          (q.tipo !== 'BECA' && enRiesgoMeta(r?.metaExtension ?? null, avanceExt, semestre, hoy));
        if (q.enRiesgo && !enRiesgo) continue;
        filas.push({
          idUsuario: u.idUsuario,
          nombre: u.nombre,
          apellido: u.apellido,
          carne: u.perfil!.carne,
          idCarrera: u.perfil!.idCarrera,
          semestreCarrera: u.perfil!.semestre,
          carrera: u.perfil!.carrera?.nombreCarrera ?? null,
          metaBeca: r?.metaBeca ?? null,
          becaDeclarada: r?.becaDeclarada ?? 0,
          becaAcreditada: acred.beca,
          faltaBeca: falta(r?.metaBeca ?? null, avanceBeca),
          metaExtension: r?.metaExtension ?? null,
          extensionDeclarada: r?.extensionDeclarada ?? 0,
          extensionAcreditada: acred.extension,
          faltaExtension: falta(r?.metaExtension ?? null, avanceExt),
          enRiesgo,
          ...(proyectos && { proyectosActivos: proyectos.get(u.idUsuario)?.size ?? 0 }),
        });
        if (filas.length > limit) break;
      }
      if (usuarios.length < lote) break;
    }

    // La fila limit+1 solo confirma que hay pagina siguiente; no se entrega.
    const hayMas = filas.length > limit;
    const pagina = filas.slice(0, limit);
    return { semestre, filas: pagina, siguienteCursor: hayMas ? pagina[pagina.length - 1].idUsuario : null };
  }

  /** Todas las filas que cumplen el filtro (totales y reportes). */
  async todasLasFilas(idActor: number, q: HorasCentralQueryDto) {
    await this.requireAdmin(idActor);
    return this.recorrerTodas(q);
  }

  /** Igual que `todasLasFilas` sin verificar al actor: el llamador ya autorizo (junta de la asociacion). */
  async recorrerTodas(q: FiltroCentral) {
    const filas: FilaHorasCentral[] = [];
    let cursor: number | undefined;
    let semestre!: Semestre;
    do {
      const pagina = await this.paginaCentral({ ...q, cursor, limit: LOTE_REPORTE });
      semestre = pagina.semestre;
      filas.push(...pagina.filas);
      cursor = pagina.siguienteCursor ?? undefined;
    } while (cursor !== undefined);
    return { semestre, filas };
  }

  /** MEJ-72: los ultimos `cantidad` semestres (el mas reciente primero) con las horas de todos los estudiantes. */
  async comparativo(idActor: number, cantidad = 4) {
    await this.requireAdmin(idActor);
    const semestres: Semestre[] = [];
    let { anio, periodo } = semestreDe(new Date());
    for (let i = 0; i < cantidad; i++) {
      semestres.push(semestreDeAnioPeriodo(anio, periodo));
      if (periodo === 1) {
        anio -= 1;
        periodo = 2;
      } else periodo = 1;
    }
    const filas = await Promise.all(
      semestres.map(async (semestre) => {
        const [registros, aprobadas] = await Promise.all([
          this.prisma.registroHorasSemestre.aggregate({
            where: { anio: semestre.anio, periodo: semestre.periodo },
            _count: { _all: true },
            _sum: { metaBeca: true, becaDeclarada: true, metaExtension: true, extensionDeclarada: true },
          }),
          this.prisma.horasParticipacion.findMany({
            where: { estadoHoras: 'APROBADA', fechaAprobacion: ventana(semestre) },
            select: {
              horasAprobadas: true,
              participacion: { select: { rolProyecto: { select: { proyecto: { select: { tipoProyecto: true } } } } } },
            },
          }),
        ]);
        let becaAcreditada = 0;
        let extensionAcreditada = 0;
        for (const a of aprobadas) {
          const horas = Number(a.horasAprobadas ?? 0);
          const tipo = a.participacion.rolProyecto.proyecto.tipoProyecto;
          if (tipo === TipoProyecto.ACADEMICO_HORAS_BECA) becaAcreditada += horas;
          else if (tipo === TipoProyecto.EXTRACURRICULAR_EXTENSION) extensionAcreditada += horas;
        }
        const suma = registros._sum;
        return {
          semestre,
          estudiantesConRegistro: registros._count._all,
          metaBeca: suma.metaBeca ?? 0,
          becaDeclarada: suma.becaDeclarada ?? 0,
          becaAcreditada,
          metaExtension: suma.metaExtension ?? 0,
          extensionDeclarada: suma.extensionDeclarada ?? 0,
          extensionAcreditada,
        };
      }),
    );
    return { semestres: filas };
  }

  /** MEJ-68: por asociacion, estudiantes de sus carreras con horas del semestre, en riesgo, proyectos y junta. */
  async resumenPorAsociacion(idActor: number, q: HorasCentralQueryDto) {
    await this.requireAdmin(idActor);
    const [{ semestre, filas }, asociaciones] = await Promise.all([
      this.recorrerTodas({ anio: q.anio, periodo: q.periodo }),
      this.prisma.asociacion.findMany({
        where: { archivada: false },
        orderBy: { nombre: 'asc' },
        select: {
          idAsociacion: true,
          nombre: true,
          carreras: { select: { idCarrera: true, carrera: { select: { nombreCarrera: true } } } },
          proyectos: { where: { eliminadoEn: null, estadoProyecto: { in: [...ESTADOS_ACTIVOS] } }, select: { idProyecto: true } },
          _count: { select: { junta: true } },
        },
      }),
    ]);
    return {
      semestre,
      asociaciones: asociaciones.map((a) => {
        const ids = new Set(a.carreras.map((c) => c.idCarrera));
        const propios = filas.filter((f) => f.idCarrera !== null && ids.has(f.idCarrera));
        const suma = (campo: (f: FilaHorasCentral) => number) => propios.reduce((t, f) => t + campo(f), 0);
        return {
          idAsociacion: a.idAsociacion,
          nombre: a.nombre,
          carreras: a.carreras.map((c) => c.carrera.nombreCarrera),
          integrantesJunta: a._count.junta,
          proyectosActivos: a.proyectos.length,
          estudiantes: propios.length,
          enRiesgo: propios.filter((f) => f.enRiesgo).length,
          metaBeca: suma((f) => f.metaBeca ?? 0),
          becaDeclarada: suma((f) => f.becaDeclarada),
          becaAcreditada: suma((f) => f.becaAcreditada),
          faltaBeca: suma((f) => f.faltaBeca ?? 0),
          metaExtension: suma((f) => f.metaExtension ?? 0),
          extensionDeclarada: suma((f) => f.extensionDeclarada),
          extensionAcreditada: suma((f) => f.extensionAcreditada),
          faltaExtension: suma((f) => f.faltaExtension ?? 0),
        };
      }),
    };
  }

  /**
   * Totales por carrera. ponytail: el modelo Asociacion aun no existe (fase ASO);
   * cuando exista, agrupar por asociacion a partir de las carreras que representa.
   */
  async totales(idActor: number, q: HorasCentralQueryDto) {
    const { semestre, filas } = await this.todasLasFilas(idActor, q);
    const vacio = (f: FilaHorasCentral) => ({
      idCarrera: f.idCarrera,
      carrera: f.carrera,
      estudiantes: 0,
      enRiesgo: 0,
      metaBeca: 0,
      becaDeclarada: 0,
      becaAcreditada: 0,
      faltaBeca: 0,
      metaExtension: 0,
      extensionDeclarada: 0,
      extensionAcreditada: 0,
      faltaExtension: 0,
    });
    const grupos = new Map<number | null, ReturnType<typeof vacio>>();
    for (const f of filas) {
      const g = grupos.get(f.idCarrera) ?? vacio(f);
      g.estudiantes += 1;
      g.enRiesgo += f.enRiesgo ? 1 : 0;
      g.metaBeca += f.metaBeca ?? 0;
      g.becaDeclarada += f.becaDeclarada;
      g.becaAcreditada += f.becaAcreditada;
      g.faltaBeca += f.faltaBeca ?? 0;
      g.metaExtension += f.metaExtension ?? 0;
      g.extensionDeclarada += f.extensionDeclarada;
      g.extensionAcreditada += f.extensionAcreditada;
      g.faltaExtension += f.faltaExtension ?? 0;
      grupos.set(f.idCarrera, g);
    }
    return { semestre, porCarrera: [...grupos.values()] };
  }
}
